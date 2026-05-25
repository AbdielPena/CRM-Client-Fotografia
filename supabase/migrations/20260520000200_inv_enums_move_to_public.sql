-- ============================================================================
-- Inventory enums — move from finanzapp to public schema
-- ============================================================================
-- Fix de inconsistencia de schema: el search_path por defecto del proyecto es
-- `finanzapp, public, extensions, inventario`, por lo que CREATE TYPE sin
-- schema prefix caía en `finanzapp` aunque los CREATE TABLE usaban `public.`
-- explícito. Resultado: tablas en public con columnas tipadas como
-- `finanzapp.inv_item_kind` etc., causando que RPCs con `SET search_path = public`
-- no encontraran los tipos.
--
-- Esta migration mueve los 11 enums inv_* de finanzapp → public via
-- ALTER TYPE ... SET SCHEMA (operación que actualiza atomicamente todas las
-- columnas que referenciaban el tipo por OID).
--
-- Aplicar DESPUÉS de inventory_init (que es donde se crean) y ANTES de
-- inv_move_stock_rpc (que necesita los tipos en public).
-- ============================================================================

ALTER TYPE finanzapp.inv_item_kind SET SCHEMA public;
ALTER TYPE finanzapp.inv_unit_status SET SCHEMA public;
ALTER TYPE finanzapp.inv_loan_status SET SCHEMA public;
ALTER TYPE finanzapp.inv_rental_status SET SCHEMA public;
ALTER TYPE finanzapp.inv_reservation_status SET SCHEMA public;
ALTER TYPE finanzapp.inv_maintenance_type SET SCHEMA public;
ALTER TYPE finanzapp.inv_maintenance_status SET SCHEMA public;
ALTER TYPE finanzapp.inv_movement_type SET SCHEMA public;
ALTER TYPE finanzapp.inv_payment_method SET SCHEMA public;
ALTER TYPE finanzapp.inv_penalty_type SET SCHEMA public;
ALTER TYPE finanzapp.inv_responsible_entity SET SCHEMA public;
