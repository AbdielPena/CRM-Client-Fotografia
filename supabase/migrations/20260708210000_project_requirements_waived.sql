-- Sesiones antiguas: permitir "eximir" de los requisitos que se agregaron
-- después (hora, colaborador, vestido). Cuando `requirements_waived = true`,
-- el detalle del proyecto NO muestra las marcas de "Falta la hora / Faltan
-- colaboradores / Falta el vestido" ni el badge de "falta colaborador" en la
-- lista. Aditivo; no toca datos ni el flujo de sesiones nuevas.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS requirements_waived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.projects.requirements_waived IS
  'Sesión antigua: no exigir hora/colaborador/vestido (oculta esas marcas de pendiente).';
