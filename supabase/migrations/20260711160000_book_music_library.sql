-- Biblioteca de música REUTILIZABLE del Luxury Book, por estudio.
-- El estudio sube canciones desde archivos (no links) y quedan guardadas como
-- "predefinidas" para elegirlas en cualquier álbum, en vez de pegar una URL cada
-- vez. Cada entrada del arreglo: { id, name, url } (audio en el bucket
-- público `studio-branding`). Aditivo; sin datos previos (default []).
alter table studio_branding
  add column if not exists book_music_library jsonb not null default '[]'::jsonb;
