-- ============================================================================
-- Inventory — schema completo del módulo (port de inventario-app)
--
-- Tablas con prefijo `inv_` para evitar colisión con CRM existente.
-- Multi-tenant: cada tabla con `studio_id` NOT NULL + RLS via is_studio_member.
-- Reuso del CRM: `clients` existente (no se crea inv_clients).
-- Reuso de auth: NO se portan tablas users/roles/permissions — todo va a
-- auth.users + studio_members (rol gobierna acceso).
--
-- Tablas:
--   • inv_categories, inv_subcategories, inv_locations (taxonomía)
--   • inv_items, inv_item_units, inv_item_images, inv_item_documents (catálogo)
--   • inv_internal_responsibles (personas internas del studio, FK opcional a auth.users)
--   • inv_loans, inv_loan_items (préstamos internos)
--   • inv_rentals, inv_rental_items, inv_rental_payments (alquileres a clients)
--   • inv_reservations, inv_reservation_items
--   • inv_maintenance_records
--   • inv_penalties
--   • inv_stock_movements (ledger universal 13 tipos)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ============================================================================
-- ENUMS (prefijo inv_)
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE inv_item_kind AS ENUM ('serialized', 'bulk');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inv_unit_status AS ENUM (
    'disponible','reservado','prestado','rentado',
    'mantenimiento','danado','perdido','retirado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inv_loan_status AS ENUM (
    'activo','devuelto','parcial','vencido','perdido','danado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inv_rental_status AS ENUM (
    'cotizada','reservada','activa','devuelta','vencida',
    'cancelada','con_deuda','con_dano','perdida'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inv_reservation_status AS ENUM (
    'pendiente','confirmada','cancelada',
    'convertida_prestamo','convertida_renta','vencida'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inv_maintenance_type AS ENUM (
    'preventivo','correctivo','limpieza','revision',
    'reparacion','calibracion','cambio_pieza'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inv_maintenance_status AS ENUM (
    'pendiente','en_proceso','completado','cancelado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inv_movement_type AS ENUM (
    'entrada','salida','prestamo','devolucion_prestamo',
    'renta','devolucion_renta','mantenimiento','ajuste',
    'transferencia','baja','perdida','dano','reparacion'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inv_payment_method AS ENUM (
    'efectivo','tarjeta','transferencia','cheque','deposito','otro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inv_penalty_type AS ENUM ('atraso','dano','perdida','otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inv_responsible_entity AS ENUM ('client','responsible');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- TAXONOMÍA — categorías, subcategorías, ubicaciones
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inv_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id     UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  code          VARCHAR(20) NOT NULL,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (studio_id, name),
  UNIQUE (studio_id, code)
);

CREATE TABLE IF NOT EXISTS public.inv_subcategories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id     UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  category_id   UUID NOT NULL REFERENCES public.inv_categories(id) ON DELETE RESTRICT,
  name          VARCHAR(100) NOT NULL,
  code          VARCHAR(20) NOT NULL,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (studio_id, category_id, name),
  UNIQUE (studio_id, category_id, code)
);

CREATE TABLE IF NOT EXISTS public.inv_locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id     UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  type          VARCHAR(50),
  address       TEXT,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (studio_id, name)
);

-- ============================================================================
-- RESPONSABLES INTERNOS (personas del studio que reciben préstamos)
-- Opcionalmente FK a auth.users.id si el responsable tiene cuenta en el monolito.
-- Si user_id es NULL → persona externa registrada solo para tracking.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inv_internal_responsibles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id     UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name     VARCHAR(255) NOT NULL,
  position      VARCHAR(100),
  department    VARCHAR(100),
  phone         VARCHAR(50),
  email         VARCHAR(255),
  document_id   VARCHAR(50),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_inv_responsibles_studio
  ON public.inv_internal_responsibles(studio_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_inv_responsibles_user_studio
  ON public.inv_internal_responsibles(studio_id, user_id) WHERE user_id IS NOT NULL;

-- ============================================================================
-- ITEMS (catálogo) e ITEM_UNITS (unidades serializadas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inv_items (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id                     UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  kind                          inv_item_kind NOT NULL,
  name                          VARCHAR(255) NOT NULL,
  category_id                   UUID REFERENCES public.inv_categories(id),
  subcategory_id                UUID REFERENCES public.inv_subcategories(id),
  brand                         VARCHAR(100),
  model                         VARCHAR(100),
  description                   TEXT,
  internal_code                 VARCHAR(100),
  default_purchase_price        NUMERIC(14,2),
  default_estimated_value       NUMERIC(14,2),
  default_rental_price_per_day  NUMERIC(14,2),
  provider                      VARCHAR(255),
  quantity_total                INTEGER NOT NULL DEFAULT 0,
  quantity_reserved             INTEGER NOT NULL DEFAULT 0,
  quantity_loaned               INTEGER NOT NULL DEFAULT 0,
  quantity_rented               INTEGER NOT NULL DEFAULT 0,
  quantity_maintenance          INTEGER NOT NULL DEFAULT 0,
  quantity_damaged              INTEGER NOT NULL DEFAULT 0,
  quantity_lost                 INTEGER NOT NULL DEFAULT 0,
  min_stock                     INTEGER NOT NULL DEFAULT 0,
  max_stock                     INTEGER,
  default_location_id           UUID REFERENCES public.inv_locations(id),
  notes                         TEXT,
  is_active                     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                    TIMESTAMPTZ,
  CONSTRAINT chk_inv_items_kind_qty CHECK (
    (kind = 'serialized' AND quantity_total = 0) OR
    (kind = 'bulk' AND quantity_total >= 0)
  ),
  CONSTRAINT chk_inv_items_qty_consistency CHECK (
    quantity_reserved + quantity_loaned + quantity_rented +
    quantity_maintenance + quantity_damaged + quantity_lost
    <= quantity_total
  )
);
CREATE INDEX IF NOT EXISTS ix_inv_items_studio_kind ON public.inv_items(studio_id, kind) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_inv_items_category ON public.inv_items(category_id);
CREATE INDEX IF NOT EXISTS ix_inv_items_search ON public.inv_items USING gin (
  to_tsvector('simple',
    coalesce(name,'') || ' ' || coalesce(brand,'') || ' ' ||
    coalesce(model,'') || ' ' || coalesce(internal_code,'')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_inv_items_studio_internal_code
  ON public.inv_items(studio_id, internal_code) WHERE internal_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.inv_item_units (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id                   UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  item_id                     UUID NOT NULL REFERENCES public.inv_items(id) ON DELETE RESTRICT,
  serial_number               VARCHAR(255),
  internal_code               VARCHAR(100),
  qr_code                     VARCHAR(255),
  barcode                     VARCHAR(255),
  status                      inv_unit_status NOT NULL DEFAULT 'disponible',
  physical_condition          VARCHAR(50),
  operational_condition       VARCHAR(50),
  current_location_id         UUID REFERENCES public.inv_locations(id),
  current_responsible_id      UUID,                    -- polymorphic: client.id o inv_internal_responsibles.id
  current_responsible_type    inv_responsible_entity,
  purchase_date               DATE,
  purchase_price              NUMERIC(14,2),
  estimated_value             NUMERIC(14,2),
  warranty_expiry             DATE,
  provider                    VARCHAR(255),
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_inv_units_item ON public.inv_item_units(item_id);
CREATE INDEX IF NOT EXISTS ix_inv_units_studio_status ON public.inv_item_units(studio_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_inv_units_location ON public.inv_item_units(current_location_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_inv_units_studio_serial
  ON public.inv_item_units(studio_id, item_id, serial_number) WHERE serial_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_inv_units_studio_internal_code
  ON public.inv_item_units(studio_id, internal_code) WHERE internal_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_inv_units_studio_qr
  ON public.inv_item_units(studio_id, qr_code) WHERE qr_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.inv_item_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id     UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  item_id       UUID REFERENCES public.inv_items(id) ON DELETE CASCADE,
  item_unit_id  UUID REFERENCES public.inv_item_units(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  storage_key   TEXT,                              -- key en Supabase Storage para cleanup
  caption       TEXT,
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (item_id IS NOT NULL OR item_unit_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_inv_item_images_item ON public.inv_item_images(item_id);
CREATE INDEX IF NOT EXISTS ix_inv_item_images_unit ON public.inv_item_images(item_unit_id);

CREATE TABLE IF NOT EXISTS public.inv_item_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id     UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  item_id       UUID REFERENCES public.inv_items(id) ON DELETE CASCADE,
  item_unit_id  UUID REFERENCES public.inv_item_units(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  storage_key   TEXT,
  name          VARCHAR(255),
  doc_type      VARCHAR(50),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (item_id IS NOT NULL OR item_unit_id IS NOT NULL)
);

-- ============================================================================
-- PRÉSTAMOS INTERNOS (responsable interno saca equipo)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inv_loans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id             UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  code                  VARCHAR(30) NOT NULL,
  responsible_id        UUID NOT NULL REFERENCES public.inv_internal_responsibles(id),
  status                inv_loan_status NOT NULL DEFAULT 'activo',
  start_date            TIMESTAMPTZ NOT NULL,
  expected_return_date  TIMESTAMPTZ NOT NULL,
  actual_return_date    TIMESTAMPTZ,
  notes                 TEXT,
  signature_url         TEXT,
  registered_by         UUID NOT NULL REFERENCES auth.users(id),
  -- Asociación opcional a un booking/project del CRM (correlación cross-módulo)
  booking_id            UUID REFERENCES public.booking_requests(id) ON DELETE SET NULL,
  project_id            UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expected_return_date > start_date),
  UNIQUE (studio_id, code)
);
CREATE INDEX IF NOT EXISTS ix_inv_loans_studio_status ON public.inv_loans(studio_id, status);
CREATE INDEX IF NOT EXISTS ix_inv_loans_responsible ON public.inv_loans(responsible_id);
CREATE INDEX IF NOT EXISTS ix_inv_loans_dates ON public.inv_loans(start_date, expected_return_date);
CREATE INDEX IF NOT EXISTS ix_inv_loans_booking ON public.inv_loans(booking_id) WHERE booking_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.inv_loan_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id           UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  loan_id             UUID NOT NULL REFERENCES public.inv_loans(id) ON DELETE CASCADE,
  item_id             UUID REFERENCES public.inv_items(id),
  item_unit_id        UUID REFERENCES public.inv_item_units(id),
  quantity            INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  condition_out       VARCHAR(50),
  condition_in        VARCHAR(50),
  photos_out          JSONB NOT NULL DEFAULT '[]'::jsonb,
  photos_in           JSONB NOT NULL DEFAULT '[]'::jsonb,
  returned_quantity   INTEGER NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),
  returned_at         TIMESTAMPTZ,
  status              inv_loan_status NOT NULL DEFAULT 'activo',
  notes               TEXT,
  CHECK (item_unit_id IS NOT NULL OR item_id IS NOT NULL),
  CHECK (returned_quantity <= quantity)
);
CREATE INDEX IF NOT EXISTS ix_inv_loan_items_loan ON public.inv_loan_items(loan_id);
CREATE INDEX IF NOT EXISTS ix_inv_loan_items_unit ON public.inv_loan_items(item_unit_id);
CREATE INDEX IF NOT EXISTS ix_inv_loan_items_item ON public.inv_loan_items(item_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_inv_active_loan_unit
  ON public.inv_loan_items(item_unit_id)
  WHERE item_unit_id IS NOT NULL
    AND status IN ('activo','parcial','vencido');

-- ============================================================================
-- RENTAS (alquileres a clients del CRM)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inv_rentals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id             UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  code                  VARCHAR(30) NOT NULL,
  client_id             UUID NOT NULL REFERENCES public.clients(id),
  status                inv_rental_status NOT NULL DEFAULT 'cotizada',
  start_date            TIMESTAMPTZ NOT NULL,
  end_date              TIMESTAMPTZ NOT NULL,
  actual_return_date    TIMESTAMPTZ,
  days                  INTEGER GENERATED ALWAYS AS (
    GREATEST(1, CEIL(EXTRACT(EPOCH FROM (end_date - start_date)) / 86400)::INT)
  ) STORED,
  subtotal              NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount              NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax                   NUMERIC(14,2) NOT NULL DEFAULT 0,
  deposit               NUMERIC(14,2) NOT NULL DEFAULT 0,
  total                 NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance               NUMERIC(14,2) GENERATED ALWAYS AS (total - paid_amount) STORED,
  contract_url          TEXT,
  signature_url         TEXT,
  notes                 TEXT,
  registered_by         UUID NOT NULL REFERENCES auth.users(id),
  -- Asociación opcional a project del CRM
  project_id            UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date > start_date),
  CHECK (paid_amount >= 0),
  CHECK (paid_amount <= total + 0.01),
  UNIQUE (studio_id, code)
);
CREATE INDEX IF NOT EXISTS ix_inv_rentals_studio_status ON public.inv_rentals(studio_id, status);
CREATE INDEX IF NOT EXISTS ix_inv_rentals_client ON public.inv_rentals(client_id);
CREATE INDEX IF NOT EXISTS ix_inv_rentals_dates ON public.inv_rentals(start_date, end_date);

CREATE TABLE IF NOT EXISTS public.inv_rental_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id           UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  rental_id           UUID NOT NULL REFERENCES public.inv_rentals(id) ON DELETE CASCADE,
  item_id             UUID REFERENCES public.inv_items(id),
  item_unit_id        UUID REFERENCES public.inv_item_units(id),
  quantity            INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price_per_day       NUMERIC(14,2) NOT NULL,
  line_total          NUMERIC(14,2) NOT NULL,
  condition_out       VARCHAR(50),
  condition_in        VARCHAR(50),
  photos_out          JSONB NOT NULL DEFAULT '[]'::jsonb,
  photos_in           JSONB NOT NULL DEFAULT '[]'::jsonb,
  returned_quantity   INTEGER NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),
  returned_at         TIMESTAMPTZ,
  status              inv_rental_status NOT NULL DEFAULT 'activa',
  notes               TEXT,
  CHECK (item_unit_id IS NOT NULL OR item_id IS NOT NULL),
  CHECK (returned_quantity <= quantity)
);
CREATE INDEX IF NOT EXISTS ix_inv_rental_items_rental ON public.inv_rental_items(rental_id);
CREATE INDEX IF NOT EXISTS ix_inv_rental_items_unit ON public.inv_rental_items(item_unit_id);
CREATE INDEX IF NOT EXISTS ix_inv_rental_items_item ON public.inv_rental_items(item_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_inv_active_rental_unit
  ON public.inv_rental_items(item_unit_id)
  WHERE item_unit_id IS NOT NULL
    AND status IN ('activa','vencida','con_deuda','con_dano');

CREATE TABLE IF NOT EXISTS public.inv_rental_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  rental_id       UUID NOT NULL REFERENCES public.inv_rentals(id) ON DELETE RESTRICT,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  method          inv_payment_method NOT NULL,
  reference       VARCHAR(100),
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT,
  registered_by   UUID REFERENCES auth.users(id),
  -- F5: cuando esto se conecte a Finance, se crea fin_transaction idempotente
  fin_transaction_id UUID,                          -- FK soft a public.fin_transactions (creado en F5)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_inv_rental_payments_rental ON public.inv_rental_payments(rental_id);

-- ============================================================================
-- RESERVAS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inv_reservations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id                   UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  code                        VARCHAR(30) NOT NULL,
  client_id                   UUID REFERENCES public.clients(id),
  responsible_id              UUID REFERENCES public.inv_internal_responsibles(id),
  status                      inv_reservation_status NOT NULL DEFAULT 'pendiente',
  start_date                  TIMESTAMPTZ NOT NULL,
  end_date                    TIMESTAMPTZ NOT NULL,
  reason                      TEXT,
  expires_at                  TIMESTAMPTZ,
  converted_to_loan_id        UUID REFERENCES public.inv_loans(id),
  converted_to_rental_id      UUID REFERENCES public.inv_rentals(id),
  registered_by               UUID NOT NULL REFERENCES auth.users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date > start_date),
  CHECK (client_id IS NOT NULL OR responsible_id IS NOT NULL),
  UNIQUE (studio_id, code)
);
CREATE INDEX IF NOT EXISTS ix_inv_reservations_studio_status ON public.inv_reservations(studio_id, status);
CREATE INDEX IF NOT EXISTS ix_inv_reservations_dates ON public.inv_reservations(start_date, end_date);

CREATE TABLE IF NOT EXISTS public.inv_reservation_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  reservation_id  UUID NOT NULL REFERENCES public.inv_reservations(id) ON DELETE CASCADE,
  item_id         UUID REFERENCES public.inv_items(id),
  item_unit_id    UUID REFERENCES public.inv_item_units(id),
  quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  CHECK (item_unit_id IS NOT NULL OR item_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_inv_reservation_items_res ON public.inv_reservation_items(reservation_id);
CREATE INDEX IF NOT EXISTS ix_inv_reservation_items_unit ON public.inv_reservation_items(item_unit_id);

-- ============================================================================
-- MANTENIMIENTO
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inv_maintenance_records (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id               UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  code                    VARCHAR(30) NOT NULL,
  item_unit_id            UUID REFERENCES public.inv_item_units(id),
  item_id                 UUID REFERENCES public.inv_items(id),
  type                    inv_maintenance_type NOT NULL,
  status                  inv_maintenance_status NOT NULL DEFAULT 'pendiente',
  description             TEXT,
  start_date              TIMESTAMPTZ,
  end_date                TIMESTAMPTZ,
  technician              VARCHAR(255),
  cost                    NUMERIC(14,2) NOT NULL DEFAULT 0,
  parts_used              JSONB NOT NULL DEFAULT '[]'::jsonb,
  photos                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_maintenance_date   DATE,
  notes                   TEXT,
  registered_by           UUID REFERENCES auth.users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (item_unit_id IS NOT NULL OR item_id IS NOT NULL),
  UNIQUE (studio_id, code)
);
CREATE INDEX IF NOT EXISTS ix_inv_maint_studio_status ON public.inv_maintenance_records(studio_id, status);
CREATE INDEX IF NOT EXISTS ix_inv_maint_unit ON public.inv_maintenance_records(item_unit_id);

-- ============================================================================
-- PENALIDADES (cargos por atraso/daño/perdida)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inv_penalties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  rental_id       UUID REFERENCES public.inv_rentals(id),
  loan_id         UUID REFERENCES public.inv_loans(id),
  type            inv_penalty_type NOT NULL,
  amount          NUMERIC(14,2) NOT NULL,
  description     TEXT,
  is_charged      BOOLEAN NOT NULL DEFAULT FALSE,
  registered_by   UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (rental_id IS NOT NULL OR loan_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_inv_penalties_rental ON public.inv_penalties(rental_id);
CREATE INDEX IF NOT EXISTS ix_inv_penalties_loan ON public.inv_penalties(loan_id);

-- ============================================================================
-- LEDGER UNIVERSAL DE MOVIMIENTOS (13 tipos)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inv_stock_movements (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id                 UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  item_id                   UUID REFERENCES public.inv_items(id),
  item_unit_id              UUID REFERENCES public.inv_item_units(id),
  type                      inv_movement_type NOT NULL,
  quantity                  INTEGER NOT NULL DEFAULT 1,
  reason                    TEXT,
  prev_status               VARCHAR(50),
  new_status                VARCHAR(50),
  prev_location_id          UUID REFERENCES public.inv_locations(id),
  new_location_id           UUID REFERENCES public.inv_locations(id),
  prev_responsible_id       UUID,
  new_responsible_id        UUID,
  loan_id                   UUID REFERENCES public.inv_loans(id),
  rental_id                 UUID REFERENCES public.inv_rentals(id),
  reservation_id            UUID REFERENCES public.inv_reservations(id),
  maintenance_id            UUID REFERENCES public.inv_maintenance_records(id),
  registered_by             UUID REFERENCES auth.users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (item_id IS NOT NULL OR item_unit_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_inv_mov_studio_date ON public.inv_stock_movements(studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_inv_mov_unit_date ON public.inv_stock_movements(item_unit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_inv_mov_item_date ON public.inv_stock_movements(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_inv_mov_type ON public.inv_stock_movements(type);

-- ============================================================================
-- TRIGGERS updated_at (todos usan public.set_updated_at ya definida)
-- ============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inv_categories','inv_subcategories','inv_locations',
    'inv_internal_responsibles','inv_items','inv_item_units',
    'inv_loans','inv_rentals','inv_reservations','inv_maintenance_records'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', t, t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- RLS — habilitar + policy member_all en TODAS las tablas inv_*
-- ============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inv_categories','inv_subcategories','inv_locations',
    'inv_internal_responsibles','inv_items','inv_item_units',
    'inv_item_images','inv_item_documents',
    'inv_loans','inv_loan_items',
    'inv_rentals','inv_rental_items','inv_rental_payments',
    'inv_reservations','inv_reservation_items',
    'inv_maintenance_records','inv_penalties','inv_stock_movements'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_member_all ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY %I_member_all ON public.%I FOR ALL USING (public.is_studio_member(studio_id)) WITH CHECK (public.is_studio_member(studio_id));',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- Comentario final
-- ============================================================================
COMMENT ON TABLE public.inv_items IS
  'Catálogo de equipos del studio (cámaras, lentes, props). Multi-tenant via studio_id. Quantity columns mantienen estado agregado; sub-units en inv_item_units cuando kind=serialized.';
COMMENT ON TABLE public.inv_stock_movements IS
  'Ledger universal de movimientos (13 tipos enum). Append-only — la fuente de verdad histórica. Cada operación de loan/rental/maintenance/reservation inserta aquí.';
