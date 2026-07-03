-- Dedicatoria de la madre a la quinceañera, mostrada en la ENTREGA final.
-- Editable por el estudio (config de la galería) y por la madre vía link público.
alter table public.galleries
  add column if not exists mother_message text,
  add column if not exists mother_message_from text;

comment on column public.galleries.mother_message is
  'Dedicatoria (mensaje de la madre a la quinceañera) mostrada en la entrega. Editable por el estudio y por la madre vía link público /g/[token]/dedicatoria.';
comment on column public.galleries.mother_message_from is
  'Firma de la dedicatoria (ej. nombre de la madre). Prellenado con projects.mother_name.';
