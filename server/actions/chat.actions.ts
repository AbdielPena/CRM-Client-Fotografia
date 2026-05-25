"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createChannel,
  deleteMessage,
  editMessage,
  ensureGeneralChannel,
  markChannelRead,
  sendMessage,
  toggleReaction,
  type ChatChannelKind,
} from "@/server/services/chat.service"

export async function ensureGeneralChannelAction(): Promise<{
  ok: boolean
  channelId?: string
  message?: string
}> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  try {
    const channelId = await ensureGeneralChannel(session.studioId)
    return { ok: true, channelId }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function sendMessageAction(formData: FormData): Promise<{
  ok: boolean
  messageId?: string
  message?: string
}> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  const channelId = String(formData.get("channelId") ?? "")
  const content = String(formData.get("content") ?? "").trim()
  if (!channelId || !content)
    return { ok: false, message: "channelId + content requeridos" }

  // Parse @mentions del contenido (formato @{uuid})
  const mentionRegex = /@\{([0-9a-f-]{36})\}/g
  const mentions: string[] = []
  let match: RegExpExecArray | null
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1])
  }

  try {
    const msg = await sendMessage(session.studioId, session.userId, {
      channelId,
      content,
      mentions: mentions.length > 0 ? mentions : undefined,
    })
    revalidatePath(`/chat/${channelId}`)
    return { ok: true, messageId: msg.id }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function editMessageAction(
  messageId: string,
  newContent: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  try {
    await editMessage(messageId, session.userId, newContent)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function deleteMessageAction(
  messageId: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  try {
    await deleteMessage(messageId, session.userId)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function toggleReactionAction(
  messageId: string,
  emoji: string,
): Promise<{ ok: boolean; added?: boolean }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false }
  }

  try {
    const result = await toggleReaction(messageId, session.userId, emoji)
    return { ok: true, added: result.added }
  } catch {
    return { ok: false }
  }
}

export async function markChannelReadAction(
  channelId: string,
): Promise<{ ok: boolean }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false }
  }

  try {
    await markChannelRead(channelId, session.userId)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function createChannelAction(formData: FormData): Promise<{
  ok: boolean
  channelId?: string
  message?: string
}> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  const name = String(formData.get("name") ?? "").trim()
  const kind = String(formData.get("kind") ?? "group") as ChatChannelKind
  const description = (formData.get("description") as string) || undefined
  const memberIdsRaw = formData.getAll("memberIds") as string[]

  if (!name) return { ok: false, message: "Nombre requerido" }

  try {
    const channel = await createChannel(session.studioId, session.userId, {
      kind,
      name,
      description,
      memberUserIds: memberIdsRaw,
    })
    revalidatePath("/chat")
    return { ok: true, channelId: channel.id }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}
