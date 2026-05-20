import { redirect } from "next/navigation"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  ensureGeneralChannel,
  listChannels,
} from "@/server/services/chat.service"

/**
 * /chat redirige al canal general (o el más reciente con actividad).
 */
export default async function ChatRootPage() {
  const session = await requireStudioAuth()

  // Asegura que existe el canal general
  await ensureGeneralChannel(session.studioId).catch(() => null)

  // Lista canales del user
  const channels = await listChannels(session.studioId, session.userId).catch(
    () => [],
  )

  const targetChannel =
    channels.find((c) => c.kind === "general") ?? channels[0]

  if (targetChannel) {
    redirect(`/chat/${targetChannel.id}`)
  }

  // Fallback: sin canales (shouldn't happen)
  redirect("/dashboard")
}
