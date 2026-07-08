import "server-only"

import { randomBytes } from "crypto"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import { enqueueEmail } from "./email.service"
import { resolveTemplate, type TemplateSlug } from "./email-template.service"

/**
 * Service de members del studio + invitations.
 */

function appBaseUrl(): string {
  return (process.env["NEXT_PUBLIC_APP_URL"] ?? "https://my.abbypixel.com").replace(/\/+$/, "")
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export type StudioRole = "owner" | "admin" | "staff" | "finance" | "viewer"

export type StudioMember = {
  user_id: string
  role: StudioRole
  joined_at: string
  email: string | null
  name: string | null
}

export type StudioInvitation = {
  id: string
  studio_id: string
  email: string
  role: StudioRole
  token: string
  message: string | null
  status: "pending" | "accepted" | "expired" | "revoked"
  expires_at: string
  accepted_at: string | null
  accepted_by: string | null
  revoked_at: string | null
  revoked_reason: string | null
  resent_count: number
  last_resent_at: string | null
  invited_by: string | null
  created_at: string
  updated_at: string
}

// ============================================================================
// Members
// ============================================================================

/**
 * Resuelve email + nombre de un conjunto de user_ids vía la admin API
 * (service role). `auth.users` NO es embebible por PostgREST (schema auth no
 * expuesto), así que esta es la forma soportada de obtener el email en el
 * servidor — mismo patrón que app/api/auth/hub-sso. Nunca expone auth.users
 * al cliente.
 */
async function resolveUsersByIds(
  userIds: string[],
): Promise<Map<string, { email: string | null; fullName: string | null }>> {
  const map = new Map<string, { email: string | null; fullName: string | null }>()
  const wanted = new Set(userIds.filter(Boolean))
  if (wanted.size === 0) return map

  const admin = untypedService()
  const perPage = 1000
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) break
    const users = (data?.users ?? []) as Array<{
      id: string
      email?: string | null
      user_metadata?: { full_name?: string } | null
    }>
    for (const u of users) {
      if (wanted.has(u.id)) {
        map.set(u.id, {
          email: u.email ?? null,
          fullName: u.user_metadata?.full_name ?? null,
        })
      }
    }
    // Última página, o ya encontramos todos los buscados.
    if (users.length < perPage || map.size >= wanted.size) break
  }
  return map
}

export async function listMembers(studioId: string): Promise<StudioMember[]> {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("studio_members")
    .select("user_id, role, created_at, display_name")
    .eq("studio_id", studioId)
    .order("created_at", { ascending: true })

  if (error) throwServiceError("MEMBERS_LIST_FAILED", error)

  type Row = {
    user_id: string
    role: StudioRole
    created_at: string
    display_name: string | null
  }
  const rows = (data ?? []) as Row[]

  // El email vive en auth.users (no embebible) → admin API con service role.
  const userMap = await resolveUsersByIds(rows.map((r) => r.user_id))

  return rows.map((r) => {
    const u = userMap.get(r.user_id)
    return {
      user_id: r.user_id,
      role: r.role,
      joined_at: r.created_at,
      email: u?.email ?? null,
      name: r.display_name ?? u?.fullName ?? u?.email ?? null,
    }
  })
}

export async function updateMemberRole(
  studioId: string,
  actorId: string,
  userId: string,
  newRole: StudioRole,
): Promise<void> {
  const sb = untypedService()

  // No permitir cambiar el rol del owner
  const { data: target } = await sb
    .from("studio_members")
    .select("role")
    .eq("studio_id", studioId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!target) throw new Error("MEMBER_NOT_FOUND")
  if ((target as { role: string }).role === "owner") {
    throw new Error("CANNOT_CHANGE_OWNER_ROLE")
  }

  const { error } = await sb
    .from("studio_members")
    .update({ role: newRole })
    .eq("studio_id", studioId)
    .eq("user_id", userId)

  if (error) throwServiceError("MEMBER_UPDATE_ROLE_FAILED", error)

  await logActivity({
    studioId,
    actorId,
    entityType: "studio_member",
    entityId: userId,
    action: "studio_member.role_changed",
    metadata: { new_role: newRole },
  })
}

export async function removeMember(
  studioId: string,
  actorId: string,
  userId: string,
): Promise<void> {
  const sb = untypedService()

  const { data: target } = await sb
    .from("studio_members")
    .select("role")
    .eq("studio_id", studioId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!target) throw new Error("MEMBER_NOT_FOUND")
  if ((target as { role: string }).role === "owner") {
    throw new Error("CANNOT_REMOVE_OWNER")
  }

  const { error } = await sb
    .from("studio_members")
    .delete()
    .eq("studio_id", studioId)
    .eq("user_id", userId)

  if (error) throwServiceError("MEMBER_REMOVE_FAILED", error)

  await logActivity({
    studioId,
    actorId,
    entityType: "studio_member",
    entityId: userId,
    action: "studio_member.removed",
  })
}

// ============================================================================
// Invitations
// ============================================================================

function generateInvitationToken(): string {
  return "inv_" + randomBytes(24).toString("hex")
}

export async function listInvitations(
  studioId: string,
  status?: "pending" | "accepted" | "expired" | "revoked",
): Promise<StudioInvitation[]> {
  const sb = untypedServer()
  let query = sb
    .from("studio_invitations")
    .select("*")
    .eq("studio_id", studioId)
    .order("created_at", { ascending: false })

  if (status) query = query.eq("status", status)

  const { data, error } = await query
  if (error) throwServiceError("INVITATIONS_LIST_FAILED", error)
  return (data ?? []) as StudioInvitation[]
}

export async function inviteToStudio(
  studioId: string,
  actorId: string,
  data: {
    email: string
    role?: StudioRole
    message?: string
  },
): Promise<StudioInvitation> {
  const sb = untypedService()

  if (!data.email.includes("@")) {
    throw new Error("INVALID_EMAIL")
  }

  // Check si ya es miembro. auth.users no es embebible por PostgREST, así que
  // resolvemos los emails de los miembros vía la admin API (service role).
  const { data: existing } = await sb
    .from("studio_members")
    .select("user_id")
    .eq("studio_id", studioId)

  const memberIds = ((existing ?? []) as Array<{ user_id: string }>).map(
    (m) => m.user_id,
  )
  const memberUsers = await resolveUsersByIds(memberIds)
  const isMember = [...memberUsers.values()].some(
    (u) => u.email?.toLowerCase() === data.email.toLowerCase(),
  )
  if (isMember) {
    throw new Error("USER_ALREADY_MEMBER")
  }

  // Check si ya hay invitation pending
  const { data: pending } = await sb
    .from("studio_invitations")
    .select("id")
    .eq("studio_id", studioId)
    .eq("email", data.email.toLowerCase())
    .eq("status", "pending")
    .maybeSingle()

  if (pending) {
    throw new Error("INVITATION_ALREADY_PENDING")
  }

  const token = generateInvitationToken()

  const { data: row, error } = await sb
    .from("studio_invitations")
    .insert({
      studio_id: studioId,
      email: data.email.toLowerCase().trim(),
      role: data.role ?? "staff",
      token,
      message: data.message ?? null,
      invited_by: actorId,
      status: "pending",
    })
    .select("*")
    .single()

  if (error) throwServiceError("INVITATION_CREATE_FAILED", error)

  const invitation = row as StudioInvitation

  // TODO V2: enviar email con el link /invitations/[token]
  // Por ahora solo se loguea — el owner copia el link de la UI

  await logActivity({
    studioId,
    actorId,
    entityType: "studio_invitation",
    entityId: invitation.id,
    action: "studio_invitation.created",
    metadata: { email: invitation.email, role: invitation.role },
  })

  return invitation
}

export async function revokeInvitation(
  studioId: string,
  actorId: string,
  invitationId: string,
  reason?: string,
): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("studio_invitations")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_reason: reason ?? null,
    })
    .eq("id", invitationId)
    .eq("studio_id", studioId)
    .eq("status", "pending")

  if (error) throwServiceError("INVITATION_REVOKE_FAILED", error)

  await logActivity({
    studioId,
    actorId,
    entityType: "studio_invitation",
    entityId: invitationId,
    action: "studio_invitation.revoked",
    metadata: reason ? { reason } : undefined,
  })
}

export async function resendInvitation(
  studioId: string,
  actorId: string,
  invitationId: string,
): Promise<void> {
  const sb = untypedService()

  // Update resent_count + last_resent_at + extender expiración
  const { error } = await sb
    .from("studio_invitations")
    .update({
      last_resent_at: new Date().toISOString(),
      expires_at: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    })
    .eq("id", invitationId)
    .eq("studio_id", studioId)
    .eq("status", "pending")

  if (error) throwServiceError("INVITATION_RESEND_FAILED", error)

  // Increment resent_count (raw SQL via rpc o select+update)
  // Por simplicidad: select + update
  const { data: inv } = await sb
    .from("studio_invitations")
    .select("resent_count")
    .eq("id", invitationId)
    .maybeSingle()
  if (inv) {
    await sb
      .from("studio_invitations")
      .update({ resent_count: (inv as { resent_count: number }).resent_count + 1 })
      .eq("id", invitationId)
  }

  await logActivity({
    studioId,
    actorId,
    entityType: "studio_invitation",
    entityId: invitationId,
    action: "studio_invitation.resent",
  })
}

/**
 * Acepta invitation: añade el user como member del studio.
 * Llamado desde /invitations/[token] cuando el user hace click y está logueado.
 */
export async function acceptInvitation(
  token: string,
  userId: string,
): Promise<{ ok: boolean; studioId?: string; message?: string }> {
  const sb = untypedService()

  const { data: inv } = await sb
    .from("studio_invitations")
    .select("*")
    .eq("token", token)
    .maybeSingle()

  if (!inv) return { ok: false, message: "Invitación no encontrada" }
  const invitation = inv as StudioInvitation

  if (invitation.status !== "pending") {
    return { ok: false, message: `Invitación ${invitation.status}` }
  }
  if (new Date(invitation.expires_at) < new Date()) {
    await sb
      .from("studio_invitations")
      .update({ status: "expired" })
      .eq("id", invitation.id)
    return { ok: false, message: "Invitación expirada" }
  }

  // Verificar que el email del user matchee (best effort — el user puede
  // logiarse con otro email y aceptar, lo cual es OK)
  const { error: insErr } = await sb.from("studio_members").insert({
    studio_id: invitation.studio_id,
    user_id: userId,
    role: invitation.role,
  })

  if (insErr) {
    if (insErr.code === "23505") {
      // Ya es miembro
      return { ok: false, message: "Ya eres miembro de este studio" }
    }
    return { ok: false, message: insErr.message }
  }

  // Marcar accepted
  await sb
    .from("studio_invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by: userId,
    })
    .eq("id", invitation.id)

  await logActivity({
    studioId: invitation.studio_id,
    actorId: userId,
    entityType: "studio_invitation",
    entityId: invitation.id,
    action: "studio_invitation.accepted",
  })

  return { ok: true, studioId: invitation.studio_id }
}

// ============================================================================
// Creación directa de usuario del sistema (email + contraseña)
// ----------------------------------------------------------------------------
// El estudio crea la cuenta del compañero con email + contraseña. Se crea la
// cuenta en Supabase Auth (service-role) Y la membresía del estudio de una vez,
// de modo que al iniciar sesión el usuario cae directo al CRM (nunca a /setup,
// que crearía un estudio nuevo). Si el email ya tiene cuenta, se reutiliza y
// solo se agrega la membresía (no se toca su contraseña).
// ============================================================================

/** Busca el id de un usuario Auth por email (auth.users no es embebible). */
async function findAuthUserIdByEmail(
  admin: ReturnType<typeof untypedService>,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase()
  const perPage = 1000
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) break
    const users = (data?.users ?? []) as Array<{ id: string; email?: string | null }>
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === target)
    if (hit) return hit.id
    if (users.length < perPage) break
  }
  return null
}

export async function createInternalUser(
  studioId: string,
  actorId: string,
  input: { name?: string | null; email: string; password: string; role: StudioRole },
): Promise<{ ok: boolean; userId: string; createdAccount: boolean; alreadyMember?: boolean }> {
  const email = input.email.trim().toLowerCase()
  if (!email.includes("@")) throw new Error("Correo inválido")
  if (input.role === "owner") throw new Error("No se puede asignar el rol de propietario")

  const admin = untypedService()

  // 1. Reutilizar la cuenta Auth si el email ya existe; si no, crearla.
  let userId = await findAuthUserIdByEmail(admin, email)
  let createdAccount = false
  if (!userId) {
    if (!input.password || input.password.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres")
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.name?.trim() || null },
    })
    if (error) throw new Error(error.message ?? "No se pudo crear la cuenta")
    userId = (data?.user?.id as string | undefined) ?? null
    createdAccount = true
  }
  if (!userId) throw new Error("No se pudo resolver el usuario")

  // 2. ¿Ya es miembro de ESTE estudio?
  const { data: existingMember } = await admin
    .from("studio_members")
    .select("user_id")
    .eq("studio_id", studioId)
    .eq("user_id", userId)
    .maybeSingle()
  if (existingMember) {
    return { ok: false, userId, createdAccount, alreadyMember: true }
  }

  // 3. Membresía en el estudio EXISTENTE (service-role → RLS bypass).
  const { error: insErr } = await admin.from("studio_members").insert({
    studio_id: studioId,
    user_id: userId,
    role: input.role,
    is_active: true,
    display_name: input.name?.trim() || null,
    joined_at: new Date().toISOString(),
  })
  if (insErr) throwServiceError("MEMBER_CREATE_FAILED", insErr)

  await logActivity({
    studioId,
    actorId,
    entityType: "studio_member",
    entityId: userId,
    action: "studio_member.created",
    metadata: { email, role: input.role, new_account: createdAccount },
  })

  // 4. Correo de bienvenida (best-effort; no bloquea la creación).
  try {
    await sendTeamWelcomeEmail(studioId, {
      email,
      name: input.name ?? null,
      createdAccount,
    })
  } catch (e) {
    console.error("[members] correo de bienvenida falló", e)
  }

  return { ok: true, userId, createdAccount }
}

async function sendTeamWelcomeEmail(
  studioId: string,
  opts: { email: string; name: string | null; createdAccount: boolean },
): Promise<void> {
  const sb = untypedService()
  const { data: studioRow } = await sb
    .from("studios")
    .select("name, email")
    .eq("id", studioId)
    .maybeSingle()
  const studio = studioRow as { name?: string; email?: string | null } | null
  const studioName = studio?.name ?? "El estudio"
  const loginUrl = `${appBaseUrl()}/login`
  const firstName = (opts.name ?? "").trim() || opts.email

  const accessLine = opts.createdAccount
    ? `Tu cuenta ya está lista. Entra con tu correo <strong>${escapeHtml(
        opts.email,
      )}</strong> y la contraseña que te compartió el estudio.`
    : `Ahora también tienes acceso al sistema de <strong>${escapeHtml(
        studioName,
      )}</strong> con tu cuenta de siempre (<strong>${escapeHtml(opts.email)}</strong>).`

  const defaultHtml = `
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#A1A1A6">Equipo</p>
  <h1>Ya tienes acceso a {{studio_name}}</h1>
  <p>Hola <strong>{{first_name}}</strong>, ${accessLine}</p>
  <p style="text-align:center;margin:28px 0 6px"><a class="btn" href="{{login_url}}">Entrar al sistema</a></p>
  <p style="margin:8px 0 0;font-size:12.5px;color:#A1A1A6;text-align:center">Si no esperabas este acceso, puedes ignorar este correo.</p>`

  const resolved = await resolveTemplate(
    studioId,
    "team_member_welcome" as TemplateSlug,
    {
      studio_name: escapeHtml(studioName),
      first_name: escapeHtml(firstName),
      login_url: loginUrl,
    },
    { subject: `Acceso al sistema de ${studioName}`, bodyHtml: defaultHtml },
  )

  await enqueueEmail({
    studioId,
    toEmail: opts.email,
    toName: opts.name ?? undefined,
    fromEmail: studio?.email ?? null,
    fromName: resolved.fromName ?? studioName,
    replyTo: resolved.replyTo ?? studio?.email ?? null,
    subject: resolved.subject,
    bodyHtml: resolved.bodyHtml,
    templateSlug: "team_member_welcome",
    relatedEntityType: "studio_member",
    relatedEntityId: null,
  })
}
