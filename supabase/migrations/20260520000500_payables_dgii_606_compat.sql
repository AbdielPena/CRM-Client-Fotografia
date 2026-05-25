-- ============================================================================
-- F4 V2 — Habilitar reporte 606 DGII desde fin_payables
-- ============================================================================
-- Agrega columnas NCF proveedor + clasificación bienes/servicios necesarias
-- para generar el reporte 606 (Compras) que DGII exige mensualmente.
--
-- Requiere: F5 finance_init (que crea fin_payables). Esta migration es
-- IDEMPOTENTE — usa IF NOT EXISTS para que se pueda re-aplicar sin error.
--
-- Si fin_payables NO existe todavía (F5 no aplicado), la migration falla
-- en el primer ALTER TABLE. Aplicar F5 primero.
-- ============================================================================

-- 1) Columnas DGII en fin_payables
ALTER TABLE public.fin_payables
  ADD COLUMN IF NOT EXISTS ncf_proveedor text,
  ADD COLUMN IF NOT EXISTS ncf_modificado text,
  ADD COLUMN IF NOT EXISTS rnc_proveedor text,
  ADD COLUMN IF NOT EXISTS provider_name text,
  ADD COLUMN IF NOT EXISTS tipo_bienes_servicios text,
  ADD COLUMN IF NOT EXISTS monto_servicios numeric(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_bienes numeric(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itbis_facturado numeric(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itbis_retenido numeric(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencion_renta numeric(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forma_pago text DEFAULT '01';

-- 2) Comentarios para devs/DBA
COMMENT ON COLUMN public.fin_payables.ncf_proveedor IS
  'NCF del comprobante del proveedor (formato 11 chars: B01XXXXXXXX). Requerido si el gasto va al reporte 606 DGII.';
COMMENT ON COLUMN public.fin_payables.ncf_modificado IS
  'Si este NCF reemplaza/modifica uno anterior (ej. nota de débito o crédito), aquí va el NCF original.';
COMMENT ON COLUMN public.fin_payables.rnc_proveedor IS
  'RNC (9 dígitos) o Cédula (11 dígitos) del proveedor. Sin guiones.';
COMMENT ON COLUMN public.fin_payables.provider_name IS
  'Razón social o nombre del proveedor (para deducir tipo identificación si rnc_proveedor falta).';
COMMENT ON COLUMN public.fin_payables.tipo_bienes_servicios IS
  'Código DGII 01-18 del tipo de gasto. Ver tabla oficial:
   01=Gastos de personal, 02=Gastos por trabajos suministros y servicios,
   03=Arrendamientos, 04=Gastos de Activos Fijos, 05=Gastos de Representación,
   06=Otras Deducciones Admitidas, 07=Gastos financieros, 08=Gastos extraordinarios,
   09=Compras y Gastos que formarán parte del Costo de Venta,
   10=Adquisiciones de Activos, 11=Gastos de Seguros, 12-18=Categorías adicionales';
COMMENT ON COLUMN public.fin_payables.monto_servicios IS
  'Monto del gasto si es servicio (DGII 606 columna 7).';
COMMENT ON COLUMN public.fin_payables.monto_bienes IS
  'Monto del gasto si es bien (DGII 606 columna 8).';
COMMENT ON COLUMN public.fin_payables.itbis_facturado IS
  'ITBIS pagado al proveedor (18% sobre monto_total cuando aplica).';
COMMENT ON COLUMN public.fin_payables.itbis_retenido IS
  'ITBIS retenido al proveedor (cuando aplica retención al 30%, 75% o 100%).';
COMMENT ON COLUMN public.fin_payables.retencion_renta IS
  'Retención de ISR al proveedor (cuando aplica 10% personas físicas o 27% jurídicas).';
COMMENT ON COLUMN public.fin_payables.forma_pago IS
  'Forma de pago DGII: 01=Efectivo, 02=Cheques/Transferencias/Depósito,
   03=Tarjeta Débito/Crédito, 04=Compra a Crédito, 05=Permuta,
   06=Nota de Crédito, 07=Otras formas de venta.';

-- 3) Index para queries del 606 por studio+periodo
-- NOTA: fin_payables no tiene paid_at; usamos fecha_emision para filtrar por periodo DGII
CREATE INDEX IF NOT EXISTS idx_fin_payables_dgii_606
  ON public.fin_payables (studio_id, fecha_emision)
  WHERE ncf_proveedor IS NOT NULL AND deleted_at IS NULL;

-- 4) Constraint suave: si ncf_proveedor está set, rnc_proveedor también debería estarlo
--    (no hard constraint porque hay casos legítimos de proveedores informales;
--    el reporte 606 los excluirá por el filtro ncf IS NOT NULL).

-- 5) Sample SQL para insertar un payable con NCF (referencia para devs):
--    INSERT INTO fin_payables (studio_id, amount, currency, ..., ncf_proveedor, rnc_proveedor, tipo_bienes_servicios, monto_servicios, itbis_facturado, forma_pago)
--    VALUES ('<studio>', 11800, 'DOP', ..., 'B0100000123', '101000010', '02', 10000, 1800, '02');
