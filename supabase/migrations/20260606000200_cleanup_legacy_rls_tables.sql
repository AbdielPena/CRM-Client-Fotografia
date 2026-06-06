-- ============================================================================
-- LIMPIEZA: tablas con RLS habilitado pero SIN policy (advisor rls_enabled_no_policy).
--
-- 1) Tablas MUERTAS del hub multi-sistema ya decomisionado (F8). Sin referencias
--    en código, sin FKs entrantes, prácticamente vacías. Se eliminan.
--      - cross_system_events (0 filas)
--      - integration_mappings (0 filas)
--      - sync_jobs           (0 filas)
--      - external_systems    (4 filas de config vieja del hub)
-- 2) Tablas SOLO-servicio que conservamos (datos / uso futuro) pero que no deben
--    ser accesibles por clientes. Se les agrega una policy explícita de denegación
--    a anon/authenticated (el service_role salta RLS para los escritos internos).
--      - audit_logs            (403 filas históricas; el app usa activity_log)
--      - stripe_webhook_events (0 filas; para cuando se cableen webhooks de Stripe)
-- ============================================================================

DROP TABLE IF EXISTS public.cross_system_events CASCADE;
DROP TABLE IF EXISTS public.integration_mappings CASCADE;
DROP TABLE IF EXISTS public.sync_jobs CASCADE;
DROP TABLE IF EXISTS public.external_systems CASCADE;

DROP POLICY IF EXISTS audit_logs_no_client_access ON public.audit_logs;
CREATE POLICY audit_logs_no_client_access
  ON public.audit_logs
  AS PERMISSIVE FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS stripe_webhook_events_no_client_access ON public.stripe_webhook_events;
CREATE POLICY stripe_webhook_events_no_client_access
  ON public.stripe_webhook_events
  AS PERMISSIVE FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);
