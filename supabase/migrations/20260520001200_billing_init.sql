-- ============================================================================
-- SaaS Billing — Planes, suscripciones, feature gating editables
-- ============================================================================
-- Todo configurable por el platform admin. NO hardcoded.
--
-- Tablas:
--   billing_plans          — catalogo de planes (Free, Pro, Studio, Agency)
--                            con price IDs de Stripe + features JSONB editable
--   billing_subscriptions  — 1 fila por studio con su plan actual + Stripe info
--   billing_invoices       — historial de cobros Stripe (cache para UI)
--   billing_usage_metrics  — uso actual del studio para feature limits
--
-- Patrón de feature gating:
--   plan.features = {
--     "max_clients": 50,
--     "max_users": 3,
--     "modules": ["crm","invoices","galleries"],
--     "max_storage_gb": 10,
--     "custom_domain": false,
--     "api_access": false,
--     "white_label": false,
--     "support_tier": "community"
--   }
--
--   El service requireFeature(studioId, "modules.inventory") consulta
--   la suscripción activa y bloquea si el plan no lo incluye.
-- ============================================================================

-- ============================================================================
-- 1. Enums
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE billing_plan_interval AS ENUM ('month', 'year', 'lifetime');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE billing_subscription_status AS ENUM (
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'incomplete',
    'incomplete_expired',
    'paused'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE billing_invoice_status AS ENUM (
    'draft',
    'open',
    'paid',
    'uncollectible',
    'void'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. billing_plans — catalogo de planes (editable por platform_admins)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Slug interno usado para gating: 'free', 'pro', 'studio', 'agency'
  slug                TEXT NOT NULL UNIQUE,
  -- Display
  name                TEXT NOT NULL,
  description         TEXT,
  tagline             TEXT,
  -- Pricing
  price_monthly       NUMERIC(10, 2),
  price_yearly        NUMERIC(10, 2),
  currency            TEXT NOT NULL DEFAULT 'DOP',
  -- Stripe price IDs (per interval) — editables por el admin
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly  TEXT,
  -- Stripe product id (para Customer Portal)
  stripe_product_id   TEXT,
  -- Features JSONB editable
  features            JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Trial gratuito en días (NULL = sin trial)
  trial_days          INTEGER,
  -- Orden de display
  sort_order          INTEGER NOT NULL DEFAULT 0,
  -- UI
  is_featured         BOOLEAN NOT NULL DEFAULT FALSE,
  badge_text          TEXT,
  badge_color         TEXT,
  -- Estado
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  is_public           BOOLEAN NOT NULL DEFAULT TRUE,
  -- Audit
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_billing_plans_active
  ON public.billing_plans(is_active, sort_order)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.billing_plans IS
  'Planes de precios del SaaS. Editables vía /admin/billing/plans.
   features JSONB controla feature gating per-studio.';

COMMENT ON COLUMN public.billing_plans.features IS
  'Estructura editable:
   { max_clients: 50, max_users: 3, max_storage_gb: 10,
     modules: ["crm","invoices","galleries","inventory","finance","mail"],
     custom_domain: false, api_access: false, white_label: false,
     remove_branding: false, support_tier: "community"|"email"|"priority",
     automations_max_rules: 5, mail_max_accounts: 1
   }';

-- ============================================================================
-- 3. billing_subscriptions — 1 por studio
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id             UUID NOT NULL UNIQUE REFERENCES public.studios(id) ON DELETE CASCADE,
  plan_id               UUID NOT NULL REFERENCES public.billing_plans(id) ON DELETE RESTRICT,
  -- Stripe
  stripe_customer_id    TEXT,
  stripe_subscription_id TEXT UNIQUE,
  -- Estado
  status                billing_subscription_status NOT NULL DEFAULT 'trialing',
  -- Cycle info
  interval              billing_plan_interval NOT NULL DEFAULT 'month',
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  trial_ends_at         TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE,
  canceled_at           TIMESTAMPTZ,
  -- Metadata adicional (couponcodes aplicados, etc.)
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Override de features (admin puede dar features extra a un studio especifico)
  features_override     JSONB,
  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_billing_subscriptions_studio
  ON public.billing_subscriptions(studio_id);

CREATE INDEX IF NOT EXISTS ix_billing_subscriptions_status
  ON public.billing_subscriptions(status, current_period_end);

CREATE INDEX IF NOT EXISTS ix_billing_subscriptions_stripe_sub
  ON public.billing_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON TABLE public.billing_subscriptions IS
  'Suscripción actual del studio. UNIQUE(studio_id) garantiza 1 plan activo
   por studio. features_override permite que el platform_admin desbloquee
   features sin cambiar plan (ej. para enterprise custom).';

-- ============================================================================
-- 4. billing_invoices — cache de invoices Stripe
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id           UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  subscription_id     UUID REFERENCES public.billing_subscriptions(id) ON DELETE SET NULL,
  -- Stripe
  stripe_invoice_id   TEXT NOT NULL UNIQUE,
  -- Amounts
  amount_due          NUMERIC(14, 2) NOT NULL,
  amount_paid         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'USD',
  -- Estado
  status              billing_invoice_status NOT NULL DEFAULT 'draft',
  -- Periodo
  period_start        TIMESTAMPTZ,
  period_end          TIMESTAMPTZ,
  -- Links
  hosted_invoice_url  TEXT,
  invoice_pdf_url     TEXT,
  -- Timestamps
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at             TIMESTAMPTZ,
  due_at              TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_billing_invoices_studio
  ON public.billing_invoices(studio_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS ix_billing_invoices_status
  ON public.billing_invoices(status, due_at);

-- ============================================================================
-- 5. billing_usage_metrics — uso por studio (para gating de limites)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_usage_metrics (
  studio_id           UUID PRIMARY KEY REFERENCES public.studios(id) ON DELETE CASCADE,
  -- Counts cached (refresh via cron diario)
  clients_count       INTEGER NOT NULL DEFAULT 0,
  users_count         INTEGER NOT NULL DEFAULT 0,
  invoices_count      INTEGER NOT NULL DEFAULT 0,
  galleries_count     INTEGER NOT NULL DEFAULT 0,
  storage_bytes       BIGINT NOT NULL DEFAULT 0,
  mail_accounts_count INTEGER NOT NULL DEFAULT 0,
  automation_rules_count INTEGER NOT NULL DEFAULT 0,
  -- Per-month consumption (reset el dia 1)
  emails_sent_month   INTEGER NOT NULL DEFAULT 0,
  api_calls_month     INTEGER NOT NULL DEFAULT 0,
  -- Snapshot timestamp
  refreshed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.billing_usage_metrics IS
  'Métricas de consumo por studio. Refresh diario via cron para evitar
   COUNT() en cada feature check. Reset mensual de emails_sent_month +
   api_calls_month.';

-- ============================================================================
-- 6. RLS
-- ============================================================================
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_usage_metrics ENABLE ROW LEVEL SECURITY;

-- billing_plans: público para signup (planes activos + publicos), full para platform_admin
DROP POLICY IF EXISTS billing_plans_public_read ON public.billing_plans;
CREATE POLICY billing_plans_public_read ON public.billing_plans
  FOR SELECT TO anon, authenticated
  USING (is_active = TRUE AND is_public = TRUE AND deleted_at IS NULL);

DROP POLICY IF EXISTS billing_plans_admin_all ON public.billing_plans;
CREATE POLICY billing_plans_admin_all ON public.billing_plans
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = auth.uid()
    )
  );

-- billing_subscriptions: solo members del studio leen su sub
DROP POLICY IF EXISTS billing_subs_studio_select ON public.billing_subscriptions;
CREATE POLICY billing_subs_studio_select ON public.billing_subscriptions
  FOR SELECT TO authenticated
  USING (public.is_studio_member(studio_id));

-- billing_invoices: solo members leen sus invoices
DROP POLICY IF EXISTS billing_invoices_studio_select ON public.billing_invoices;
CREATE POLICY billing_invoices_studio_select ON public.billing_invoices
  FOR SELECT TO authenticated
  USING (public.is_studio_member(studio_id));

-- billing_usage_metrics: solo members
DROP POLICY IF EXISTS billing_usage_studio_select ON public.billing_usage_metrics;
CREATE POLICY billing_usage_studio_select ON public.billing_usage_metrics
  FOR SELECT TO authenticated
  USING (public.is_studio_member(studio_id));

-- service_role bypass total
DROP POLICY IF EXISTS billing_plans_service_all ON public.billing_plans;
CREATE POLICY billing_plans_service_all ON public.billing_plans
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS billing_subs_service_all ON public.billing_subscriptions;
CREATE POLICY billing_subs_service_all ON public.billing_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS billing_invoices_service_all ON public.billing_invoices;
CREATE POLICY billing_invoices_service_all ON public.billing_invoices
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS billing_usage_service_all ON public.billing_usage_metrics;
CREATE POLICY billing_usage_service_all ON public.billing_usage_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 7. Triggers updated_at
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at_billing_plans ON public.billing_plans';
    EXECUTE 'CREATE TRIGGER set_updated_at_billing_plans
             BEFORE UPDATE ON public.billing_plans
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';

    EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at_billing_subscriptions ON public.billing_subscriptions';
    EXECUTE 'CREATE TRIGGER set_updated_at_billing_subscriptions
             BEFORE UPDATE ON public.billing_subscriptions
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

-- ============================================================================
-- 8. Seed planes default (editables — admin puede modificar/borrar después)
-- ============================================================================
INSERT INTO public.billing_plans (slug, name, description, tagline, price_monthly, price_yearly, currency, features, trial_days, sort_order, is_featured, is_active, is_public)
VALUES
  ('free',  'Free',  'Empieza gratis sin compromiso',         'Para freelancers',
    0, 0, 'USD',
    '{
      "max_clients": 25,
      "max_users": 1,
      "max_storage_gb": 1,
      "modules": ["crm","invoices","galleries"],
      "custom_domain": false,
      "api_access": false,
      "white_label": false,
      "remove_branding": false,
      "support_tier": "community",
      "automations_max_rules": 1,
      "mail_max_accounts": 0
    }'::jsonb,
    null, 0, false, true, true),
  ('pro',   'Pro',   'Todo lo necesario para un photographer profesional', 'Más popular',
    19, 190, 'USD',
    '{
      "max_clients": 250,
      "max_users": 3,
      "max_storage_gb": 50,
      "modules": ["crm","invoices","galleries","inventory","finance"],
      "custom_domain": true,
      "api_access": false,
      "white_label": false,
      "remove_branding": true,
      "support_tier": "email",
      "automations_max_rules": 10,
      "mail_max_accounts": 1
    }'::jsonb,
    14, 1, true, true, true),
  ('studio', 'Studio', 'Para estudios con equipo + inventory + mail unificado', 'Equipo completo',
    49, 490, 'USD',
    '{
      "max_clients": null,
      "max_users": 10,
      "max_storage_gb": 250,
      "modules": ["crm","invoices","galleries","inventory","finance","mail","automations"],
      "custom_domain": true,
      "api_access": true,
      "white_label": true,
      "remove_branding": true,
      "support_tier": "priority",
      "automations_max_rules": 50,
      "mail_max_accounts": 5
    }'::jsonb,
    14, 2, false, true, true),
  ('agency', 'Agency', 'Multi-studio, white-label, API completo', 'Para agencias',
    149, 1490, 'USD',
    '{
      "max_clients": null,
      "max_users": null,
      "max_storage_gb": null,
      "modules": ["crm","invoices","galleries","inventory","finance","mail","automations"],
      "custom_domain": true,
      "api_access": true,
      "white_label": true,
      "remove_branding": true,
      "support_tier": "priority",
      "automations_max_rules": null,
      "mail_max_accounts": null
    }'::jsonb,
    null, 3, false, true, true)
ON CONFLICT (slug) DO NOTHING;
