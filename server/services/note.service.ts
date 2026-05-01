import 'server-only'

import { createSupabaseServerClient } from '@/server/supabase/server'

type NoteEntity = 'lead' | 'client' | 'project' | 'booking_request'

export async function createNote(
  studioId: string,
  actorId: string,
  params: {
    content: string
    entityType: NoteEntity
    entityId: string
  },
) {
  const supabase = createSupabaseServerClient()

  const payload: Record<string, unknown> = {
    studio_id: studioId,
    author_id: actorId || null,
    content: params.content,
  }

  if (params.entityType === 'lead') payload.lead_id = params.entityId
  if (params.entityType === 'client') payload.client_id = params.entityId
  if (params.entityType === 'project') payload.project_id = params.entityId
  if (params.entityType === 'booking_request') {
    payload.booking_request_id = params.entityId
  }

  const { data, error } = await supabase
    .from('notes')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(payload as any)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function deleteNote(studioId: string, noteId: string) {
  const supabase = createSupabaseServerClient()

  // Ownership check antes de soft-delete
  const { data: existing } = await supabase
    .from('notes')
    .select('id, studio_id')
    .eq('id', noteId)
    .maybeSingle()
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('NOTE_NOT_FOUND')
  }

  const { error } = await supabase
    .from('notes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', noteId)

  if (error) throw new Error(error.message)
}
