import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  ensureGeneralChannel,
  getChannelById,
  getMessages,
  getReactions,
  listChannels,
} from "@/server/services/chat.service"
import { listMembers } from "@/server/services/studio-members.service"

import { AppTopbar } from "@/components/layout/app-topbar"

import { ChatLayout } from "./chat-layout"

export const metadata: Metadata = { title: "Chat interno" }

export default async function ChannelPage({
  params,
}: {
  params: { channelId: string }
}) {
  const session = await requireStudioAuth()

  // Asegura general channel
  await ensureGeneralChannel(session.studioId).catch(() => null)

  const channelResult = await getChannelById(params.channelId, session.userId)
  if (!channelResult || channelResult.channel.studio_id !== session.studioId) {
    notFound()
  }

  const { channel, isMember } = channelResult

  const [channels, messages, unread] = await Promise.all([
    listChannels(session.studioId, session.userId),
    isMember ? getMessages(params.channelId, { limit: 50 }) : Promise.resolve([]),
    countUnreadNotifications(session.studioId),
  ])

  // Reactions para los mensajes cargados
  const reactions = await getReactions(messages.map((m) => m.id))

  // Lista de members del studio para mostrar nombres de autores. listMembers
  // resuelve el email vía admin API (auth.users no es embebible por PostgREST → 500).
  const memberList = await listMembers(session.studioId)
  const members = memberList.map((m) => ({
    userId: m.user_id,
    email: m.email ?? "",
    name: m.name ?? "Usuario",
  }))

  return (
    <>
      <AppTopbar
        eyebrow="Chat interno"
        title={channel.name}
        description={
          channel.description ??
          (channel.kind === "general"
            ? "Canal general del studio"
            : channel.kind === "dm"
              ? "Conversación privada"
              : "Canal de grupo")
        }
        unreadNotifications={unread}
      />

      <ChatLayout
        currentChannel={channel}
        channels={channels}
        messages={messages}
        reactions={reactions}
        members={members}
        currentUserId={session.userId}
        isMember={isMember}
      />
    </>
  )
}
