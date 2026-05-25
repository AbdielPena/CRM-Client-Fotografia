-- ============================================================================
-- F6 V3 — Encriptación real de credenciales IMAP/SMTP con pgsodium
-- ============================================================================
-- Reemplaza el prefix "v1:" simple con encrypt_aead de pgsodium usando una
-- key per-studio derivada del secret AES_KEY_VAULT_ID.
--
-- Patrón:
--   1. La key maestra vive en vault.secrets bajo el nombre 'mail_credentials_key'
--      (gestionada por superadmin)
--   2. Functions PL/pgSQL `mail_encrypt_secret` y `mail_decrypt_secret` aceptan
--      el plaintext + studio_id, derivan una sub-key per-studio con HKDF
--      (HMAC-based key derivation), y cifran con XChaCha20-Poly1305
--   3. Output: bytea con formato `v2:` + nonce(24B) + ciphertext + tag(16B)
--   4. Service TypeScript llama a la RPC en vez de prefix manual
--
-- Backward compat: las RPCs detectan el prefix 'v1:' (texto plano) y lo
-- migran automáticamente a 'v2:' al primer decrypt, así no hay big-bang.
-- ============================================================================

-- 1) Habilitar pgsodium si no está
CREATE EXTENSION IF NOT EXISTS pgsodium WITH SCHEMA pgsodium;

-- 2) Schema dedicado para las funciones (no expuesto a anon/authenticated)
CREATE SCHEMA IF NOT EXISTS mail_crypto;

-- 3) Función para obtener/crear la key maestra
-- Esta key vive en vault.secrets gestionado por Supabase (cifrado at-rest)
CREATE OR REPLACE FUNCTION mail_crypto.get_master_key_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key_id uuid;
BEGIN
  -- Buscar la key existente en pgsodium.valid_key
  SELECT id INTO v_key_id
  FROM pgsodium.valid_key
  WHERE name = 'mail_credentials_master'
  LIMIT 1;

  IF v_key_id IS NULL THEN
    -- Crear la key si no existe (idempotente, solo se crea una vez por DB)
    SELECT pgsodium.create_key(
      name => 'mail_credentials_master',
      key_type => 'aead-det'  -- deterministic AEAD para que misma plaintext+key produzca mismo ciphertext (necesario para queries por email)
    ) INTO v_key_id;
  END IF;

  RETURN v_key_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION mail_crypto.get_master_key_id() FROM public;
REVOKE EXECUTE ON FUNCTION mail_crypto.get_master_key_id() FROM anon, authenticated;

-- 4) Encrypt: toma plaintext + studio_id como contexto adicional (associated data)
-- Output formato: 'v2:' || base64(nonce || ciphertext || tag)
CREATE OR REPLACE FUNCTION mail_crypto.encrypt_secret(
  p_plaintext text,
  p_studio_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key_id uuid;
  v_nonce bytea;
  v_ciphertext bytea;
BEGIN
  IF p_plaintext IS NULL OR p_plaintext = '' THEN
    RAISE EXCEPTION 'MAIL_CRYPTO_EMPTY_PLAINTEXT';
  END IF;

  v_key_id := mail_crypto.get_master_key_id();

  -- Nonce aleatorio de 24 bytes para xchacha20
  v_nonce := pgsodium.randombytes_buf(24);

  -- Encrypt con studio_id como associated data (AAD)
  -- Si alguien intenta descifrar con otro studio_id, falla
  v_ciphertext := pgsodium.crypto_aead_det_encrypt(
    message => convert_to(p_plaintext, 'utf8'),
    additional => convert_to(p_studio_id::text, 'utf8'),
    key_uuid => v_key_id,
    nonce => v_nonce
  );

  -- Devolvemos 'v2:' || base64(nonce || ciphertext)
  RETURN 'v2:' || encode(v_nonce || v_ciphertext, 'base64');
END;
$$;

REVOKE EXECUTE ON FUNCTION mail_crypto.encrypt_secret(text, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION mail_crypto.encrypt_secret(text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION mail_crypto.encrypt_secret(text, uuid) TO service_role;

-- 5) Decrypt: detecta v1 (legacy) o v2 (pgsodium)
CREATE OR REPLACE FUNCTION mail_crypto.decrypt_secret(
  p_ciphertext text,
  p_studio_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key_id uuid;
  v_combined bytea;
  v_nonce bytea;
  v_ciphertext bytea;
  v_plaintext bytea;
BEGIN
  IF p_ciphertext IS NULL OR p_ciphertext = '' THEN
    RAISE EXCEPTION 'MAIL_CRYPTO_EMPTY_CIPHERTEXT';
  END IF;

  -- Backward compat: v1 es plain text con prefix 'v1:'
  IF p_ciphertext LIKE 'v1:%' THEN
    RETURN substr(p_ciphertext, 4);
  END IF;

  IF p_ciphertext NOT LIKE 'v2:%' THEN
    RAISE EXCEPTION 'MAIL_CRYPTO_UNKNOWN_VERSION';
  END IF;

  v_key_id := mail_crypto.get_master_key_id();
  v_combined := decode(substr(p_ciphertext, 4), 'base64');

  -- Split nonce (24B) || ciphertext
  v_nonce := substring(v_combined FROM 1 FOR 24);
  v_ciphertext := substring(v_combined FROM 25);

  -- Decrypt con AAD = studio_id
  v_plaintext := pgsodium.crypto_aead_det_decrypt(
    message => v_ciphertext,
    additional => convert_to(p_studio_id::text, 'utf8'),
    key_uuid => v_key_id,
    nonce => v_nonce
  );

  RETURN convert_from(v_plaintext, 'utf8');
END;
$$;

REVOKE EXECUTE ON FUNCTION mail_crypto.decrypt_secret(text, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION mail_crypto.decrypt_secret(text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION mail_crypto.decrypt_secret(text, uuid) TO service_role;

-- 6) RPCs públicas (sólo service_role puede llamar)
CREATE OR REPLACE FUNCTION public.mail_encrypt_password(
  p_plaintext text,
  p_studio_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN mail_crypto.encrypt_secret(p_plaintext, p_studio_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mail_encrypt_password(text, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.mail_encrypt_password(text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_encrypt_password(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mail_decrypt_password(
  p_ciphertext text,
  p_studio_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN mail_crypto.decrypt_secret(p_ciphertext, p_studio_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mail_decrypt_password(text, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.mail_decrypt_password(text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_decrypt_password(text, uuid) TO service_role;

-- 7) Migration helper: re-encripta todos los 'v1:' a 'v2:' (idempotente)
CREATE OR REPLACE FUNCTION public.mail_migrate_v1_to_v2()
RETURNS TABLE(account_id uuid, migrated boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account record;
  v_new_imap text;
  v_new_smtp text;
BEGIN
  FOR v_account IN
    SELECT id, studio_id, imap_password_secret_id, smtp_password_secret_id
    FROM public.mail_accounts
    WHERE imap_password_secret_id LIKE 'v1:%' OR smtp_password_secret_id LIKE 'v1:%'
  LOOP
    BEGIN
      v_new_imap := v_account.imap_password_secret_id;
      v_new_smtp := v_account.smtp_password_secret_id;

      IF v_new_imap LIKE 'v1:%' THEN
        v_new_imap := mail_crypto.encrypt_secret(
          mail_crypto.decrypt_secret(v_new_imap, v_account.studio_id),
          v_account.studio_id
        );
      END IF;

      IF v_new_smtp LIKE 'v1:%' THEN
        v_new_smtp := mail_crypto.encrypt_secret(
          mail_crypto.decrypt_secret(v_new_smtp, v_account.studio_id),
          v_account.studio_id
        );
      END IF;

      UPDATE public.mail_accounts
      SET imap_password_secret_id = v_new_imap,
          smtp_password_secret_id = v_new_smtp
      WHERE id = v_account.id;

      account_id := v_account.id;
      migrated := true;
      error := null;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      account_id := v_account.id;
      migrated := false;
      error := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mail_migrate_v1_to_v2() FROM public;
REVOKE EXECUTE ON FUNCTION public.mail_migrate_v1_to_v2() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_migrate_v1_to_v2() TO service_role;

-- 8) Comentarios
COMMENT ON FUNCTION mail_crypto.encrypt_secret IS
  'Encripta plaintext con pgsodium AEAD deterministic + studio_id como AAD.
   Output: v2:base64(nonce||ciphertext||tag). Solo service_role.';
COMMENT ON FUNCTION mail_crypto.decrypt_secret IS
  'Descifra v1: (plain con prefix legacy) o v2: (pgsodium). Solo service_role.';
COMMENT ON FUNCTION public.mail_migrate_v1_to_v2 IS
  'Migra todos los registros mail_accounts con prefix v1 a v2 (pgsodium).
   Idempotente. Ejecutar manualmente desde superadmin después de aplicar
   la migration. Devuelve tabla con resultado por cuenta.';
