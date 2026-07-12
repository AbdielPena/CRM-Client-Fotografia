-- Cuando el cliente hace VARIAS rondas de selección (163 → 71 → 42…), el estudio
-- elige cuál ronda es la SELECCIÓN FINAL/oficial. `final_selection_gallery_id`
-- apunta a la galería (ronda) cuya selección cuenta para la validación de entrega
-- (y cálculos derivados). null = la selección de la propia galería.
alter table galleries
  add column if not exists final_selection_gallery_id uuid;
