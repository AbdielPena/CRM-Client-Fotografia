-- Hardening de seguridad: pasa a SECURITY INVOKER las vistas de StudioFlow que
-- el linter marcó como "Security Definer View" (ERROR). Así respetan las RLS
-- policies del usuario que consulta en vez de bypassearlas.
--
-- Solo las 3 vistas que NO se consultan desde el app code (riesgo nulo).
-- `user_2fa_status` (que se usa en el flujo de login/2FA) se deja pendiente a
-- propósito: aplicar su mismo ALTER tras un smoke-test de login + 2FA.
--
-- Idempotente: ALTER VIEW ... SET es seguro de re-ejecutar. Requiere PG15+.

ALTER VIEW public.automation_rules_active SET (security_invoker = true);
ALTER VIEW public.mail_bounce_recent      SET (security_invoker = true);
ALTER VIEW public.tasks_overdue           SET (security_invoker = true);

-- Pendiente (aplicar con smoke-test de login/2FA):
-- ALTER VIEW public.user_2fa_status SET (security_invoker = true);
