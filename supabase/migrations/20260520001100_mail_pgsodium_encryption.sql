-- ============================================================================
-- F6 V3 — Encriptación de credenciales IMAP/SMTP (stub v1)
-- ============================================================================
-- NOTA: pgsodium NO está disponible en este proyecto Supabase (free/hobby tier
-- no lo expone). Esta migration aplica un stub v1 (plaintext con prefix) que
-- mantiene la API esperada por el código del módulo Mail (lib/mailcow.ts +
-- server/services/mail-imap-sync.service.ts) sin encriptación real.
--
-- TODO post-deploy: cuando se migre a Pro tier o self-host con pgsodium,
-- reemplazar este stub con la versión AEAD del módulo F6 V3 original.
-- El código TS llama a mail_encrypt_password / mail_decrypt_password — esos
-- nombres se mantienen, solo cambia la implementación.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS mail_crypto;

CREATE OR REPLACE FUNCTION public.mail_encrypt_password(p_plaintext text, p_studio_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_plaintext IS NULL OR p_plaintext = '' THEN
    RAISE EXCEPTION 'MAIL_CRYPTO_EMPTY_PLAINTEXT';
  END IF;
  -- v1 stub: plaintext con prefix. TODO: reemplazar con pgsodium AEAD.
  RETURN 'v1:' || p_plaintext;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mail_encrypt_password(text, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.mail_encrypt_password(text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_encrypt_password(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mail_decrypt_password(p_ciphertext text, p_studio_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_ciphertext IS NULL OR p_ciphertext = '' THEN
    RAISE EXCEPTION 'MAIL_CRYPTO_EMPTY_CIPHERTEXT';
  END IF;
  IF p_ciphertext LIKE 'v1:%' THEN
    RETURN substr(p_ciphertext, 4);
  END IF;
  RAISE EXCEPTION 'MAIL_CRYPTO_V2_NOT_AVAILABLE_INSTALL_PGSODIUM';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mail_decrypt_password(text, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.mail_decrypt_password(text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_decrypt_password(text, uuid) TO service_role;

COMMENT ON FUNCTION public.mail_encrypt_password IS
  'STUB v1 — plaintext con prefix v1: (no encripta). TODO: habilitar pgsodium y reemplazar con AEAD.';
COMMENT ON FUNCTION public.mail_decrypt_password IS
  'STUB v1 — retorna plaintext del prefix v1:. NO soporta v2: (pgsodium) en este proyecto.';
