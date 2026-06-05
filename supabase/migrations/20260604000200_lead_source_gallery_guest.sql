-- Nuevo origen de lead: invitados que vieron una galería y dejaron su email.
ALTER TYPE public.lead_source ADD VALUE IF NOT EXISTS 'gallery_guest';
