-- ============================================================================
-- LIMPIEZA: tablas con RLS habilitado pero SIN policy (advisor rls_enabled_no_policy).
-- Se les agrega una policy explícita de denegación a anon/authenticated
-- (el service_role salta RLS para los escritos internos).
--      - audit_logs            (histórico; usado por el hub vía service_role)
--      - stripe_webhook_events (para webhooks de Stripe)
--
-- ⚠️ CORRECCIÓN: una versión previa de esta migración TAMBIÉN eliminaba
-- (DROP TABLE) external_systems / integration_mappings / cross_system_events /
-- sync_jobs creyéndolas "muertas". ERROR: esas tablas pertenecen al repo
-- `studio-hub` (el HUB las usa en runtime para enrutar/SSO a los sistemas), y
-- la base Supabase es COMPARTIDA entre varios repos (studioflow, studio-hub,
-- finanzapp, inventario). Eliminarlas rompió hub.abbypixel.com
-- ("Sistema no disponible"). Los DROP fueron removidos y las tablas
-- restauradas en 20260606000400_restore_hub_external_systems_tables.sql.
-- ============================================================================

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
