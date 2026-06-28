-- Vista compartida de selección: un token de compartir puede mostrar la galería
-- completa ('full') o SOLO los favoritos del cliente ('selection').
alter table public.gallery_share_tokens
  add column if not exists view_mode text not null default 'full';

comment on column public.gallery_share_tokens.view_mode is
  'full = galería completa; selection = solo los favoritos (selección final del cliente)';
