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
import { untypedServer } from "@/server/supabase/untyped"

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

  // Lista de members del studio para mostrar nombres de autores
  const sb = untypedServer()
  const { data: membersRes } = await sb
    .from("studio_members")
    .select("user_id, user:auth_users(id, email, raw_user_meta_data)")
    .eq("studio_id", session.studioId)

  type MemberRow = {
    user_id: string
    user?: {
      id: string
      email: string
      raw_user_meta_data: { full_name?: string } | null
    } | null
  }

  const members = ((membersRes ?? []) as MemberRow[]).map((m) => ({
    userId: m.user_id,
    email: m.user?.email ?? "",
    name: m.user?.raw_user_meta_data?.full_name ?? m.user?.email ?? "Usuario",
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
