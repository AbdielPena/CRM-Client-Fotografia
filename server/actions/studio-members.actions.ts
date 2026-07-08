"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  acceptInvitation,
  createInternalUser,
  inviteToStudio,
  removeMember,
  resendInvitation,
  revokeInvitation,
  updateMemberRole,
  type StudioRole,
} from "@/server/services/studio-members.service"

export async function inviteMemberAction(formData: FormData): Promise<{
  ok: boolean
  invitationId?: string
  invitationLink?: string
  message?: string
}> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  const email = String(formData.get("email") ?? "").trim()
  const role = String(formData.get("role") ?? "staff") as StudioRole
  const message = (formData.get("message") as string) || undefined

  if (!email) return { ok: false, message: "Email requerido" }

  try {
    const inv = await inviteToStudio(session.studioId, session.userId, {
      email,
      role,
      message,
    })
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    revalidatePath("/settings/members")
    return {
      ok: true,
      invitationId: inv.id,
      invitationLink: `${baseUrl}/invitations/${inv.token}`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error"
    let userMsg = msg
    if (msg === "USER_ALREADY_MEMBER")
      userMsg = "Esa persona ya es miembro del studio"
    if (msg === "INVITATION_ALREADY_PENDING")
      userMsg = "Ya hay una invitación pendiente para ese email"
    if (msg === "INVALID_EMAIL") userMsg = "Email inválido"
    return { ok: false, message: userMsg }
  }
}

/**
 * Crea un usuario del sistema con email + contraseña y lo agrega al estudio
 * (accede al CRM de una vez). Si el email ya tiene cuenta, la reutiliza.
 */
export async function createInternalUserAction(formData: FormData): Promise<{
  ok: boolean
  message?: string
}> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }
  if (session.role !== "owner" && session.role !== "admin") {
    return { ok: false, message: "Solo el dueño o un admin puede crear usuarios" }
  }

  const name = (String(formData.get("name") ?? "").trim() || null) as string | null
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const role = String(formData.get("role") ?? "staff") as StudioRole

  if (!email) return { ok: false, message: "Correo requerido" }

  try {
    const res = await createInternalUser(session.studioId, session.userId, {
      name,
      email,
      password,
      role,
    })
    revalidatePath("/settings/members")
    if (!res.ok && res.alreadyMember) {
      return { ok: false, message: "Esa persona ya es miembro del estudio" }
    }
    return {
      ok: true,
      message: res.createdAccount
        ? "Usuario creado. Ya puede entrar con su correo y contraseña."
        : "Usuario existente agregado a tu estudio.",
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error" }
  }
}

export async function revokeInvitationAction(
  invitationId: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  try {
    await revokeInvitation(session.studioId, session.userId, invitationId)
    revalidatePath("/settings/members")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function resendInvitationAction(
  invitationId: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  try {
    await resendInvitation(session.studioId, session.userId, invitationId)
    revalidatePath("/settings/members")
    return { ok: true, message: "Invitación reenviada (expiración extendida)" }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function updateMemberRoleAction(
  userId: string,
  newRole: StudioRole,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  try {
    await updateMemberRole(
      session.studioId,
      session.userId,
      userId,
      newRole,
    )
    revalidatePath("/settings/members")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function removeMemberAction(
  userId: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  try {
    await removeMember(session.studioId, session.userId, userId)
    revalidatePath("/settings/members")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function acceptInvitationAction(
  token: string,
): Promise<{ ok: boolean; studioId?: string; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Debes iniciar sesión primero" }
  }

  const result = await acceptInvitation(token, session.userId)
  if (result.ok && result.studioId) {
    revalidatePath("/")
    redirect("/dashboard?welcome=joined")
  }
  return result
}
