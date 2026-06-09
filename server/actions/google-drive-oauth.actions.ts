"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createHmac } from "crypto"

import { requireRole } from "@/server/middleware/auth"
import {
  getDriveAuthorizeUrl,
  disconnectGoogleDrive,
} from "@/server/services/google-drive-oauth.service"

/** Firma el state con sufijo |drive para que el callback sepa que es Drive. */
function signDriveState(studioId: string): string {
  const secret = process.env.OAUTH_STATE_SECRET
  if (!secret) throw new Error("OAUTH_STATE_SECRET no configurado")
  const payload = Buffer.from(`${studioId}|drive`, "utf8").toString("base64")
  const signature = createHmac("sha256", secret).update(payload).digest("hex")
  return `${payload}.${signature}`
}

export async function connectGoogleDriveAction() {
  const session = await requireRole("admin")
  const missing: string[] = []
  if (!process.env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID")
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET")
  if (!process.env.OAUTH_STATE_SECRET) missing.push("OAUTH_STATE_SECRET")
  if (missing.length > 0) {
    redirect(
      `/settings/integrations/google?error=${encodeURIComponent(
        `Google no está configurado en el servidor (falta: ${missing.join(", ")}).`,
      )}`,
    )
  }
  const state = signDriveState(session.studioId)
  redirect(getDriveAuthorizeUrl(state))
}

export async function disconnectGoogleDriveAction() {
  const session = await requireRole("admin")
  await disconnectGoogleDrive(session.studioId)
  revalidatePath("/settings/integrations/google")
  revalidatePath("/galleries")
}
