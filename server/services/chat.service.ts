import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"

/**
 * Service de chat interno entre staff del studio.
 *
 * Canales:
 *   - general: 1 por studio, auto-añade todos los members
 *   - group: subset de members con nombre custom
 *   - dm: 1:1 con otro user
 *   - project: vinculado a project_id (acceso por miembros del proyecto)
 */

export type ChatChannelKind = "general" | "group" | "dm" | "project"

export type ChatChannel = {
  id: string
  studio_id: string
  kind: ChatChannelKind
  name: string
  description: string | null
  project_id: string | null
  is_archived: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  last_message_at: string | null
  message_count: number
}

export type ChatMessage = {
  id: string
  channel_id: string
  studio_id: string
  author_id: string
  content: string | null
  content_type: "text" | "system" | "file"
  parent_message_id: string | null
  attachments: unknown
  mentions: string[]
  is_edited: boolean
  edited_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type ChatChannelMember = {
  channel_id: string
  user_id: string
  role: "admin" | "member"
  joined_at: string
  last_read_at: string | null
  notifications_enabled: boolean
  is_muted: boolean
}

// ============================================================================
// Channels
// ============================================================================

export async function ensureGeneralChannel(studioId: string): Promise<string> {
  const sb = untypedService()
  const { data, error } = await sb.rpc("studio_seed_default_chat_channel", {
    p_studio_id: studioId,
  })
  if (error)
    throwServiceError("CHAT_SEED_FAILED", error, { studioId })
  return data as string
}

export async function listChannels(
  studioId: string,
  userId: string,
): Promise<ChatChannel[]> {
  const sb = untypedServer()
  // Canales donde el user es miembro
  const { data, error } = await sb
    .from("chat_channel_members")
    .select(
      `last_read_at, channel:chat_channels(*)`,
    )
    .eq("user_id", userId)

  if (error) throwServiceError("CHAT_LIST_CHANNELS_FAILED", error, { studioId })

  type Row = { last_read_at: string | null; channel: ChatChannel | ChatChannel[] | null }
  const rows = (data ?? []) as Row[]
  return rows
    .map((r) => (Array.isArray(r.channel) ? r.channel[0] : r.channel))
    .filter((c): c is ChatChannel => c !== null && !c.is_archived && c.studio_id === studioId)
    .sort((a, b) => {
      // Última actividad primero
      const aTs = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
      const bTs = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
      return bTs - aTs
    })
}

export async function getChannelById(
  channelId: string,
  userId: string,
): Promise<{ channel: ChatChannel; isMember: boolean } | null> {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("chat_channels")
    .select("*")
    .eq("id", channelId)
    .maybeSingle()

  if (error) return null
  if (!data) return null

  const channel = data as ChatChannel

  const { data: membership } = await sb
    .from("chat_channel_members")
    .select("user_id")
    .eq("channel_id", channelId)
    .eq("user_id", userId)
    .maybeSingle()

  return { channel, isMember: !!membership }
}

export async function createChannel(
  studioId: string,
  actorId: string,
  data: {
    kind: ChatChannelKind
    name: string
    description?: string
    projectId?: string
    memberUserIds?: string[]
  },
): Promise<ChatChannel> {
  const sb = untypedService()

  const { data: row, error } = await sb
    .from("chat_channels")
    .insert({
      studio_id: studioId,
      kind: data.kind,
      name: data.name,
      description: data.description ?? null,
      project_id: data.projectId ?? null,
      created_by: actorId,
    })
    .select("*")
    .single()

  if (error) throwServiceError("CHAT_CHANNEL_CREATE_FAILED", error)

  const channel = row as ChatChannel

  // Auto-add al creador como admin + members
  const memberIds = Array.from(
    new Set([actorId, ...(data.memberUserIds ?? [])]),
  )
  await sb.from("chat_channel_members").insert(
    memberIds.map((uid) => ({
      channel_id: channel.id,
      user_id: uid,
      role: uid === actorId ? "admin" : "member",
    })),
  )

  await logActivity({
    studioId,
    actorId,
    entityType: "chat_channel",
    entityId: channel.id,
    action: "chat_channel.created",
    metadata: { name: channel.name, kind: channel.kind },
  })

  return channel
}

export async function addChannelMembers(
  channelId: string,
  actorId: string,
  userIds: string[],
): Promise<void> {
  const sb = untypedService()
  await sb.from("chat_channel_members").insert(
    userIds.map((uid) => ({
      channel_id: channelId,
      user_id: uid,
      role: "member",
    })),
  )

  // System message
  await sb.from("chat_messages").insert({
    channel_id: channelId,
    studio_id: (await getChannelStudio(channelId)) ?? "",
    author_id: actorId,
    content: `Agregó ${userIds.length} ${userIds.length === 1 ? "miembro" : "miembros"} al canal`,
    content_type: "system",
  })
}

async function getChannelStudio(channelId: string): Promise<string | null> {
  const sb = untypedService()
  const { data } = await sb
    .from("chat_channels")
    .select("studio_id")
    .eq("id", channelId)
    .maybeSingle()
  return (data as { studio_id: string } | null)?.studio_id ?? null
}

// ============================================================================
// Messages
// ============================================================================

export async function getMessages(
  channelId: string,
  opts: { limit?: number; before?: string } = {},
): Promise<ChatMessage[]> {
  const limit = opts.limit ?? 50
  const sb = untypedServer()
  let query = sb
    .from("chat_messages")
    .select("*")
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (opts.before) query = query.lt("created_at", opts.before)

  const { data, error } = await query
  if (error) throwServiceError("CHAT_MESSAGES_LIST_FAILED", error)
  return ((data ?? []) as ChatMessage[]).reverse() // chronological order
}

export async function sendMessage(
  studioId: string,
  authorId: string,
  data: {
    channelId: string
    content: string
    parentMessageId?: string
    mentions?: string[]
    attachments?: unknown
  },
): Promise<ChatMessage> {
  const sb = untypedService()
  const { data: row, error } = await sb
    .from("chat_messages")
    .insert({
      channel_id: data.channelId,
      studio_id: studioId,
      author_id: authorId,
      content: data.content,
      content_type: "text",
      parent_message_id: data.parentMessageId ?? null,
      mentions: data.mentions ?? [],
      attachments: data.attachments ?? null,
    })
    .select("*")
    .single()

  if (error) throwServiceError("CHAT_MESSAGE_SEND_FAILED", error)

  const msg = row as ChatMessage

  // Notification a mentioned users
  if (data.mentions && data.mentions.length > 0) {
    void Promise.all(
      data.mentions.map((uid) =>
        sb.from("notifications").insert({
          studio_id: studioId,
          user_id: uid,
          type: "chat.mention",
          title: "Te mencionaron en un mensaje",
          body: data.content.slice(0, 200),
          entity_type: "chat_message",
          entity_id: msg.id,
          severity: "info",
        }),
      ),
    )
  }

  return msg
}

export async function editMessage(
  messageId: string,
  authorId: string,
  newContent: string,
): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("chat_messages")
    .update({
      content: newContent,
      is_edited: true,
      edited_at: new Date().toISOString(),
    })
    .eq("id", messageId)
    .eq("author_id", authorId)

  if (error) throwServiceError("CHAT_MESSAGE_EDIT_FAILED", error)
}

export async function deleteMessage(
  messageId: string,
  authorId: string,
): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("chat_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("author_id", authorId)

  if (error) throwServiceError("CHAT_MESSAGE_DELETE_FAILED", error)
}

export async function markChannelRead(
  channelId: string,
  userId: string,
): Promise<void> {
  const sb = untypedService()
  await sb
    .from("chat_channel_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("user_id", userId)
}

// ============================================================================
// Reactions
// ============================================================================

export async function toggleReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<{ added: boolean }> {
  const sb = untypedService()

  // Check si ya existe
  const { data: existing } = await sb
    .from("chat_reactions")
    .select("emoji")
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .eq("emoji", emoji)
    .maybeSingle()

  if (existing) {
    await sb
      .from("chat_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .eq("emoji", emoji)
    return { added: false }
  }

  await sb.from("chat_reactions").insert({
    message_id: messageId,
    user_id: userId,
    emoji,
  })
  return { added: true }
}

export async function getReactions(
  messageIds: string[],
): Promise<
  Record<string, Array<{ emoji: string; user_ids: string[]; count: number }>>
> {
  if (messageIds.length === 0) return {}
  const sb = untypedServer()
  const { data, error } = await sb
    .from("chat_reactions")
    .select("message_id, user_id, emoji")
    .in("message_id", messageIds)

  if (error) return {}

  type Row = { message_id: string; user_id: string; emoji: string }
  const rows = (data ?? []) as Row[]

  const grouped: Record<
    string,
    Record<string, string[]>
  > = {}

  for (const r of rows) {
    grouped[r.message_id] = grouped[r.message_id] ?? {}
    grouped[r.message_id][r.emoji] = grouped[r.message_id][r.emoji] ?? []
    grouped[r.message_id][r.emoji].push(r.user_id)
  }

  const result: Record<
    string,
    Array<{ emoji: string; user_ids: string[]; count: number }>
  > = {}

  for (const [msgId, byEmoji] of Object.entries(grouped)) {
    result[msgId] = Object.entries(byEmoji).map(([emoji, user_ids]) => ({
      emoji,
      user_ids,
      count: user_ids.length,
    }))
  }

  return result
}
