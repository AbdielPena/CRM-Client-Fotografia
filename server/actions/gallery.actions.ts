"use server"

import { revalidatePath } from "next/cache"
import { hash } from "bcryptjs"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { createInvoice } from "@/server/services/invoice.service"
import { getGallerySelectionQuota } from "@/server/services/selection-quota.service"
import {
  createGallery,
  createGalleryShareToken,
  deleteGallery,
  publishGallery,
  setAssetsDeliveryTrack,
  setGalleryEmbed,
  shareGalleryWithClient,
  updateGallery,
  updateGalleryBookConfig,
  type CreateGalleryInput,
  type UpdateGalleryInput,
} from "@/server/services/gallery.service"
import { onGalleryLinkedToClient } from "@/server/services/project-automation.service"
import {
  galleryBookConfigSchema,
  type GalleryBookConfigInput,
} from "@/lib/validations/gallery-book.schema"

// ─── Luxury Book (Abby XV Gallery): config del álbum digital por galería ─────
export async function updateGalleryBookConfigAction(
  galleryId: string,
  raw: GalleryBookConfigInput,
) {
  const ctx = await requireStudioAuth()
  const parsed = galleryBookConfigSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  try {
    await updateGalleryBookConfig(ctx.studioId, galleryId, parsed.data)
    revalidatePath(`/galleries/${galleryId}`)
    return { success: true as const }
  } catch (e) {
    return {
      error: { _root: [e instanceof Error ? e.message : "No se pudo guardar"] },
    }
  }
}

// ─── Schemas zod ───────────────────────────────────────────────────────────
const uuidSchema = z.string().uuid("ID inválido")
const uuidOrNull = uuidSchema.nullable()
const visibilityEnum = z.enum(["private", "public", "password"])
const galleryStatusEnum = z.enum(["draft", "published", "archived", "expired"])

const galleryTypeEnum = z.enum(["selection", "final_delivery"])

const createGallerySchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(120),
  description: z.string().max(2000).nullable(),
  projectId: uuidOrNull,
  clientId: uuidOrNull,
  visibility: visibilityEnum,
  password: z.string().min(4).max(120).nullable(),
  allowDownload: z.boolean(),
  requireEmail: z.boolean(),
  expiresAt: z.string().nullable(),
  galleryType: galleryTypeEnum.default("selection"),
  templateId: z.string().max(40).nullable(),
  availabilityDays: z.number().int().min(0).max(3650).nullable(),
  packageId: uuidOrNull,
})

const updateGallerySchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).nullable(),
    visibility: visibilityEnum,
    password: z.string().min(4).max(120).nullable(),
    allowDownload: z.boolean(),
    requireEmail: z.boolean(),
    expiresAt: z.string().nullable(),
    status: galleryStatusEnum,
    coverAssetId: uuidOrNull,
    watermarkEnabled: z.boolean(),
    watermarkText: z.string().max(120).nullable(),
    watermarkPosition: z.string().max(40),
    watermarkOpacity: z.number().min(0).max(1),
    selectionEnabled: z.boolean(),
    selectionLocked: z.boolean(),
    downloadPinRequired: z.boolean(),
    eventDate: z.string().nullable(),
    accentColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Color hex inválido"),
    layoutGrid: z.string().max(40),
    coverDesign: z.string().max(40),
  })
  .partial()

function pickString(fd: FormData, key: string): string | null {
  const v = fd.get(key)
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null
}

function pickBool(fd: FormData, key: string): boolean {
  const v = fd.get(key)
  return v === "true" || v === "on" || v === "1"
}

async function passwordHashOrNull(raw: string | null): Promise<string | null> {
  if (!raw) return null
  return hash(raw, 10)
}

export async function createGalleryAction(formData: FormData): Promise<{ id: string }> {
  const ctx = await requireStudioAuth()

  const availabilityRaw = pickString(formData, "availabilityDays")
  const data = createGallerySchema.parse({
    name: pickString(formData, "name") ?? "",
    description: pickString(formData, "description"),
    projectId: pickString(formData, "projectId"),
    clientId: pickString(formData, "clientId"),
    visibility: pickString(formData, "visibility") ?? "private",
    password: pickString(formData, "password"),
    allowDownload: pickBool(formData, "allowDownload"),
    requireEmail: pickBool(formData, "requireEmail"),
    expiresAt: pickString(formData, "expiresAt"),
    galleryType: pickString(formData, "galleryType") ?? "selection",
    templateId: pickString(formData, "templateId"),
    availabilityDays: availabilityRaw ? Number(availabilityRaw) : null,
    packageId: pickString(formData, "packageId"),
  })

  const passwordHash = await passwordHashOrNull(data.password)
  const input: CreateGalleryInput = {
    name: data.name,
    description: data.description,
    projectId: data.projectId,
    clientId: data.clientId,
    visibility: data.visibility,
    passwordHash,
    allowDownload: data.allowDownload,
    requireEmail: data.requireEmail,
    expiresAt: data.expiresAt,
    galleryType: data.galleryType,
    templateId: data.templateId,
    availabilityDays: data.availabilityDays,
    packageId: data.packageId,
  }

  const row = await createGallery(ctx.studioId, ctx.userId, input)

  // Automatización: si la galería se vincula a un cliente, mover su proyecto
  // a "Esperando selección".
  if (input.clientId) {
    try {
      await onGalleryLinkedToClient(ctx.studioId, input.clientId, input.projectId ?? null)
    } catch (err) {
      console.error("[createGalleryAction] automation onGalleryLinked falló:", err)
    }
  }

  revalidatePath("/galleries")
  revalidatePath("/projects")
  return { id: row.id }
}

export async function updateGalleryAction(
  galleryId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireStudioAuth()
  uuidSchema.parse(galleryId)

  // Construir el raw patch — solo campos presentes
  const raw: Record<string, unknown> = {}
  const name = pickString(formData, "name")
  if (name) raw.name = name
  const description = formData.get("description")
  if (typeof description === "string") raw.description = description || null
  const visibility = pickString(formData, "visibility")
  if (visibility) raw.visibility = visibility
  if (formData.has("allowDownload")) raw.allowDownload = pickBool(formData, "allowDownload")
  if (formData.has("requireEmail")) raw.requireEmail = pickBool(formData, "requireEmail")
  const expiresAt = formData.get("expiresAt")
  if (typeof expiresAt === "string") raw.expiresAt = expiresAt || null
  const status = pickString(formData, "status")
  if (status) raw.status = status
  const coverAssetId = formData.get("coverAssetId")
  if (typeof coverAssetId === "string") raw.coverAssetId = coverAssetId || null

  // Marca de agua
  if (formData.has("watermark_enabled"))
    raw.watermarkEnabled = pickBool(formData, "watermark_enabled")
  const watermarkText = formData.get("watermark_text")
  if (typeof watermarkText === "string") raw.watermarkText = watermarkText || null
  const watermarkPosition = pickString(formData, "watermark_position")
  if (watermarkPosition) raw.watermarkPosition = watermarkPosition
  const watermarkOpacity = formData.get("watermark_opacity")
  if (typeof watermarkOpacity === "string" && watermarkOpacity.trim()) {
    const n = Number(watermarkOpacity)
    if (!Number.isNaN(n)) raw.watermarkOpacity = Math.min(1, Math.max(0, n))
  }

  // Selección + PIN required + extras de info
  if (formData.has("selection_enabled"))
    raw.selectionEnabled = pickBool(formData, "selection_enabled")
  if (formData.has("selection_locked"))
    raw.selectionLocked = pickBool(formData, "selection_locked")
  if (formData.has("download_pin_required"))
    raw.downloadPinRequired = pickBool(formData, "download_pin_required")
  const eventDate = formData.get("event_date")
  if (typeof eventDate === "string") raw.eventDate = eventDate || null
  const accentColor = pickString(formData, "accent_color")
  if (accentColor) raw.accentColor = accentColor
  const layoutGrid = pickString(formData, "layout_grid")
  if (layoutGrid) raw.layoutGrid = layoutGrid
  const coverDesign = pickString(formData, "cover_design")
  if (coverDesign) raw.coverDesign = coverDesign

  // Validar todo el patch en una sola pasada
  const parsed = updateGallerySchema.parse(raw)

  // Construir UpdateGalleryInput final con password ya hasheado
  const patch: UpdateGalleryInput = { ...parsed }
  const passwordRaw = pickString(formData, "password")
  if (passwordRaw !== null) patch.passwordHash = await passwordHashOrNull(passwordRaw)

  await updateGallery(ctx.studioId, ctx.userId, galleryId, patch)
  revalidatePath(`/galleries/${galleryId}`)
  revalidatePath("/galleries")
}

export async function publishGalleryAction(galleryId: string): Promise<void> {
  const ctx = await requireStudioAuth()
  await publishGallery(ctx.studioId, ctx.userId, galleryId)
  revalidatePath(`/galleries/${galleryId}`)
  revalidatePath("/galleries")
}

export async function deleteGalleryAction(galleryId: string): Promise<void> {
  const ctx = await requireStudioAuth()
  await deleteGallery(ctx.studioId, ctx.userId, galleryId)
  revalidatePath("/galleries")
}

export async function shareGalleryAction(
  galleryId: string,
  formData: FormData,
): Promise<{ token: string; url: string }> {
  const ctx = await requireStudioAuth()
  const expiresAt = pickString(formData, "expiresAt")
  const clientEmail = pickString(formData, "clientEmail")

  const result = clientEmail
    ? await shareGalleryWithClient(ctx.studioId, galleryId, {
        clientEmail,
        expiresAt,
      })
    : await createGalleryShareToken(ctx.studioId, galleryId, { expiresAt })

  revalidatePath(`/galleries/${galleryId}`)
  return result
}

/**
 * Notifica al cliente que su entrega final está lista por los canales
 * elegidos (email/whatsapp) y devuelve los links (web + Drive si existe)
 * para que el fotógrafo pueda compartirlos también de forma manual.
 */
export async function notifyClientFinalDeliveryAction(input: {
  galleryId: string
  sendEmail: boolean
  sendWhatsapp: boolean
}): Promise<{
  url: string
  driveLink: string | null
  /** ready = link disponible · running = respaldo en curso · unavailable = Drive no conectado */
  driveStatus: "ready" | "running" | "unavailable"
  sentEmail: boolean
  sentWhatsapp: boolean
  whatsappLink: string | null
  errors: string[]
}> {
  const ctx = await requireStudioAuth()
  const galleryId = uuidSchema.parse(input.galleryId)

  const supabase = createSupabaseServerClient()
  const { untypedService } = await import("@/server/supabase/untyped")
  const sb = untypedService()

  // Galería + cliente + studio
  const { data: gRow } = await supabase
    .from("galleries")
    .select("id, name, client_id, gallery_type, status")
    .eq("id", galleryId)
    .eq("studio_id", ctx.studioId)
    .is("deleted_at", null)
    .maybeSingle()
  const gallery = gRow as {
    id: string
    name: string
    client_id: string | null
    gallery_type: string
    status: string
  } | null
  if (!gallery) throw new Error("Galería no encontrada")
  if (!gallery.client_id) {
    return {
      url: "",
      driveLink: null,
      driveStatus: "unavailable",
      sentEmail: false,
      sentWhatsapp: false,
      whatsappLink: null,
      errors: ["Esta galería no tiene cliente vinculado"],
    }
  }

  // Si está en draft, publicar primero (sin token hacia el cliente no sirve).
  if (gallery.status === "draft") {
    await publishGallery(ctx.studioId, ctx.userId, galleryId)
  }

  // Entrega final implica descarga: si la galería venía de selección con
  // descargas apagadas, encenderlas — el cliente DEBE poder bajar sus fotos.
  await sb
    .from("galleries")
    .update({ allow_download: true })
    .eq("id", galleryId)
    .eq("studio_id", ctx.studioId)
    .eq("allow_download", false)

  // Marcar como entrega final (si venía reciclada de selección) — así el portal
  // y los reportes la reconocen como entrega y no como galería de selección.
  if (gallery.gallery_type !== "final_delivery") {
    await sb
      .from("galleries")
      .update({ gallery_type: "final_delivery" })
      .eq("id", galleryId)
      .eq("studio_id", ctx.studioId)
  }

  // 1) Token público
  const { url, token: _token } = await createGalleryShareToken(ctx.studioId, galleryId, {
    expiresAt: null,
  })

  // 2) Link de Drive. Si no hay backup con link, disparamos uno automáticamente
  //    (sube por categoría: quinceañera/boda/estudio/exterior — gallery-drive.service).
  //    El worker manda el link al cliente por email al terminar.
  const { data: driveRow } = await sb
    .from("gallery_drive_backups")
    .select("web_view_link, status")
    .eq("gallery_id", galleryId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  let driveLink =
    (driveRow as { web_view_link: string | null; status: string } | null)?.web_view_link ?? null
  let driveStatus: "ready" | "running" | "unavailable" = driveLink ? "ready" : "unavailable"

  if (!driveLink) {
    try {
      const { getGoogleDriveStatus, enqueueGalleryDriveBackup, runGalleryDriveBackup } =
        await import("@/server/services/gallery-drive.service")
      const drive = await getGoogleDriveStatus(ctx.studioId)
      if (drive.connected) {
        const existingStatus = (driveRow as { status: string } | null)?.status
        if (existingStatus === "pending" || existingStatus === "running" || existingStatus === "uploading") {
          driveStatus = "running" // ya hay uno en curso
        } else {
          const backupId = await enqueueGalleryDriveBackup(ctx.studioId, galleryId, {
            track: "both",
            createdBy: ctx.userId,
          })
          driveStatus = "running"
          // Fire-and-forget: al completar guarda web_view_link y emailea al cliente.
          void runGalleryDriveBackup(backupId).catch((e) => {
            console.error("[notifyFinalDelivery] drive backup failed", e)
          })
          // Espera corta por si la galería es chica y termina rápido (≤10s).
          for (let i = 0; i < 5; i++) {
            await new Promise((r) => setTimeout(r, 2000))
            const { data: fresh } = await sb
              .from("gallery_drive_backups")
              .select("web_view_link")
              .eq("id", backupId)
              .maybeSingle()
            const link = (fresh as { web_view_link: string | null } | null)?.web_view_link
            if (link) {
              driveLink = link
              driveStatus = "ready"
              break
            }
          }
        }
      }
    } catch (e) {
      console.error("[notifyFinalDelivery] drive auto-backup error", e)
    }
  }

  // 3) Datos del cliente + studio
  const { data: cliRow } = await sb
    .from("clients")
    .select("name, email, phone")
    .eq("id", gallery.client_id)
    .maybeSingle()
  const client = cliRow as { name: string | null; email: string | null; phone: string | null } | null

  const { data: studioRow } = await sb
    .from("studios")
    .select("name")
    .eq("id", ctx.studioId)
    .maybeSingle()
  const studioName = (studioRow as { name?: string } | null)?.name ?? ""

  const errors: string[] = []
  let sentEmail = false
  let sentWhatsapp = false

  // 4) Email — plantilla delivery_ready
  if (input.sendEmail) {
    if (!client?.email) {
      errors.push("El cliente no tiene email registrado")
    } else {
      try {
        const { enqueueEmail } = await import("@/server/services/email.service")
        const { resolveTemplate, TEMPLATE_CATALOG } = await import(
          "@/server/services/email-template.service"
        )
        const defaults = TEMPLATE_CATALOG.delivery_ready
        const vars = {
          client_name: client.name ?? "",
          delivery_title: gallery.name,
          portal_url: url,
          studio_name: studioName,
        }
        const tpl = await resolveTemplate(ctx.studioId, "delivery_ready", vars, {
          subject: defaults.defaultSubject,
          bodyHtml: defaults.defaultBodyHtml,
        })
        await enqueueEmail({
          studioId: ctx.studioId,
          toEmail: client.email,
          toName: client.name,
          subject: tpl.subject,
          bodyHtml: tpl.bodyHtml,
          fromName: tpl.fromName,
          replyTo: tpl.replyTo,
          templateSlug: "delivery_ready",
          relatedEntityType: "gallery",
          relatedEntityId: galleryId,
        })
        sentEmail = true
      } catch (e) {
        errors.push(`Email: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  // 5) WhatsApp — plantilla aprobada "entrega_final_lista" (solo {{1}}=nombre)
  let waLink: string | null = null
  if (input.sendWhatsapp) {
    if (!client?.phone) {
      errors.push("El cliente no tiene teléfono registrado")
    } else {
      try {
        const { sendTemplateMessage } = await import(
          "@/server/services/whatsapp/cloud-api.service"
        )
        const r = await sendTemplateMessage(
          ctx.studioId,
          client.phone,
          "entrega_final_lista",
          "es",
          [client.name ?? "amig@"],
        )
        if (r.ok) {
          sentWhatsapp = true
        } else {
          errors.push(`WhatsApp: ${r.error ?? "fallo"}`)
        }
      } catch (e) {
        errors.push(`WhatsApp: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  // 6) wa.me link manual (siempre, para fallback manual)
  if (client?.phone) {
    const phoneDigits = client.phone.replace(/\D/g, "")
    const msg = `¡Hola ${client.name ?? ""}! 🎁 Tus fotos finales de "${gallery.name}" ya están listas. Acá podés verlas: ${url}`
    waLink = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(msg)}`
  }

  // 7) Transición del proyecto → "Entregado" + tarea de impresiones (best-effort).
  try {
    const { data: gProj } = await sb
      .from("galleries")
      .select("project_id")
      .eq("id", galleryId)
      .maybeSingle()
    const projectId = (gProj as { project_id: string | null } | null)?.project_id
    if (projectId && (sentEmail || sentWhatsapp)) {
      const { onFinalDeliveryPublished } = await import(
        "@/server/services/project-automation.service"
      )
      await onFinalDeliveryPublished(ctx.studioId, projectId)
    }
  } catch (e) {
    console.error("[notifyFinalDelivery] project transition failed", e)
  }

  revalidatePath(`/galleries/${galleryId}`)
  return {
    url,
    driveLink,
    driveStatus,
    sentEmail,
    sentWhatsapp,
    whatsappLink: waLink,
    errors,
  }
}

// ─── Galerías 2.0: apariencia / pistas / embed ──────────────────────────────

const appearanceSchema = z.object({
  templateId: z.string().max(40).optional(),
  galleryType: galleryTypeEnum.optional(),
  theme: z
    .object({
      mode: z.enum(["light", "dark"]),
      accent: z.string().regex(/^#[0-9A-Fa-f]{3,8}$/),
      font: z.enum(["serif-editorial", "serif-display", "sans-clean", "modern-geo"]),
      grid: z.enum(["masonry", "grid", "justified"]),
      columns: z.number().int().min(2).max(6),
      spacing: z.enum(["compact", "cozy", "spacious"]),
      corner: z.enum(["sharp", "soft"]),
      coverStyle: z.enum(["full", "split", "framed", "minimal"]),
    })
    .partial()
    .optional(),
  coverConfig: z
    .object({
      imageAssetId: z.string().uuid().nullable(),
      imageUrl: z.string().url().nullable(),
      focalX: z.number().min(0).max(1),
      focalY: z.number().min(0).max(1),
      overlay: z.enum(["none", "light", "dark"]),
      overlayIntensity: z.number().min(0).max(1),
      title: z.string().max(160).nullable(),
      subtitle: z.string().max(240).nullable(),
      showButton: z.boolean(),
      buttonLabel: z.string().max(60).nullable(),
      textAlign: z.enum(["left", "center", "right"]),
      textColor: z.enum(["light", "dark"]),
    })
    .partial()
    .optional(),
  subtitle: z.string().max(240).nullable().optional(),
  welcomeText: z.string().max(2000).nullable().optional(),
})

export async function saveGalleryAppearanceAction(
  galleryId: string,
  input: unknown,
): Promise<{ ok: true }> {
  const ctx = await requireStudioAuth()
  uuidSchema.parse(galleryId)
  const data = appearanceSchema.parse(input)
  await updateGallery(ctx.studioId, ctx.userId, galleryId, {
    galleryType: data.galleryType,
    templateId: data.templateId,
    theme: data.theme as Record<string, unknown> | undefined,
    coverConfig: data.coverConfig as Record<string, unknown> | undefined,
    subtitle: data.subtitle,
    welcomeText: data.welcomeText,
  })
  revalidatePath(`/galleries/${galleryId}`)
  return { ok: true }
}

export async function setAssetsDeliveryTrackAction(
  galleryId: string,
  assetIds: string[],
  track: "social" | "high_quality" | null,
): Promise<{ ok: true }> {
  const ctx = await requireStudioAuth()
  uuidSchema.parse(galleryId)
  z.array(uuidSchema).max(2000).parse(assetIds)
  if (track !== null && track !== "social" && track !== "high_quality") {
    throw new Error("Pista inválida")
  }
  await setAssetsDeliveryTrack(ctx.studioId, galleryId, assetIds, track)
  revalidatePath(`/galleries/${galleryId}`)
  return { ok: true }
}

export async function setGalleryEmbedAction(
  galleryId: string,
  enabled: boolean,
): Promise<{ embedEnabled: boolean; embedToken: string | null }> {
  const ctx = await requireStudioAuth()
  uuidSchema.parse(galleryId)
  const r = await setGalleryEmbed(ctx.studioId, ctx.userId, galleryId, !!enabled)
  revalidatePath(`/galleries/${galleryId}`)
  return r
}

/**
 * Genera (1 clic) una factura por las fotos extra que el cliente seleccionó
 * por encima de la cuota de su paquete. Idempotente: si ya existe una factura
 * de extras para esta galería, la devuelve en lugar de duplicar.
 */
export async function generateExtrasInvoiceAction(
  galleryId: string,
): Promise<{ invoiceId: string; already?: boolean } | { error: string }> {
  const ctx = await requireStudioAuth()
  uuidSchema.parse(galleryId)
  const db = createSupabaseServerClient() as unknown as SupabaseClient

  const { data: g } = await db
    .from("galleries")
    .select("name, client_id, project_id, selection_submitted_by")
    .eq("id", galleryId)
    .eq("studio_id", ctx.studioId)
    .maybeSingle()
  if (!g) return { error: "Galería no encontrada" }
  if (!g.client_id || !g.project_id) {
    return { error: "Vincula la galería a un cliente y proyecto para facturar extras." }
  }

  // Email con el que contar la selección (quien la envió, o el cliente dueño).
  let clientEmail: string | undefined = (g.selection_submitted_by as string | null) ?? undefined
  if (!clientEmail) {
    const { data: c } = await db
      .from("clients")
      .select("email")
      .eq("id", g.client_id)
      .maybeSingle()
    clientEmail = (c?.email as string | null) ?? undefined
  }

  const quota = await getGallerySelectionQuota(galleryId, clientEmail)
  if (quota.extras <= 0) {
    return { error: "El cliente no excedió su cuota; no hay extras que facturar." }
  }
  if (quota.extraUnitPrice <= 0) {
    return { error: "El paquete no define un precio de foto extra (extra_photo_price)." }
  }

  // Idempotencia por marcador en las notas (galleries no tiene metadata).
  const marker = `[extras:${galleryId}]`
  const { data: existing } = await db
    .from("invoices")
    .select("id")
    .eq("studio_id", ctx.studioId)
    .eq("project_id", g.project_id)
    .ilike("notes", `%${marker}%`)
    .is("deleted_at", null)
    .maybeSingle()
  if (existing?.id) return { invoiceId: existing.id as string, already: true }

  const invoice = await createInvoice(ctx.studioId, ctx.userId, {
    clientId: g.client_id as string,
    projectId: g.project_id as string,
    currency: (quota.currency || "DOP").slice(0, 3).toUpperCase(),
    discount: 0,
    depositPercent: 0,
    dueDate: "",
    footer: "",
    notes: `Fotos extra de la selección — ${g.name}. ${marker}`,
    items: [
      {
        description: `Fotos extra de selección (${quota.extras})`,
        quantity: quota.extras,
        unitPrice: quota.extraUnitPrice,
        taxRate: 0,
      },
    ],
  })

  revalidatePath(`/galleries/${galleryId}`)
  return { invoiceId: invoice.id as string }
}
