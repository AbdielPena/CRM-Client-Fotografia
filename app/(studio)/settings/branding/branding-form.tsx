"use client"

import { useRef, useState, useTransition } from "react"
import { useFormState, useFormStatus } from "react-dom"
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Save,
  Globe,
  Palette,
  Languages,
  Mail,
  Share2,
  Image as ImageIcon,
  UploadCloud,
  Lock,
} from "lucide-react"

import {
  updateBrandingAction,
  verifyDomainAction,
  type BrandingActionState,
} from "@/server/actions/studio-branding.actions"
import type { StudioBranding } from "@/server/services/studio-branding.service"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/cn"

const initialState: BrandingActionState = {}

export function BrandingForm({
  branding,
  canCustomDomain,
  canRemoveBranding,
}: {
  branding: StudioBranding
  canCustomDomain: boolean
  canRemoveBranding: boolean
}) {
  const [state, action] = useFormState(
    updateBrandingAction,
    initialState,
  )
  const [isVerifying, startVerify] = useTransition()
  const [verifyResult, setVerifyResult] = useState<{
    ok: boolean
    msg: string
  } | null>(null)

  async function handleVerify() {
    startVerify(async () => {
      const res = await verifyDomainAction()
      setVerifyResult({ ok: res.ok, msg: res.message })
    })
  }

  return (
    <form action={action} className="space-y-5">
      {state.ok === false && state.message && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="size-4" />
          {state.message}
        </div>
      )}
      {state.ok === true && state.message && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 className="size-4" />
          {state.message}
        </div>
      )}

      {/* Logo + colores */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Palette className="mr-1 inline size-3.5" />
          Identidad visual
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LogoField
            name="logo_url"
            label="Logo (fondo claro)"
            hint="PNG, JPG, WEBP o SVG · máx 2 MB. Este logo se usa en todo el ecosistema."
            initialUrl={branding.logo_url}
            variant="light"
          />
          <LogoField
            name="logo_dark_url"
            label="Logo (fondo oscuro)"
            hint="Versión clara/blanca para fondos oscuros (opcional)."
            initialUrl={branding.logo_dark_url}
            variant="dark"
            dark
          />
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Favicon URL
            </label>
            <input
              type="url"
              name="favicon_url"
              defaultValue={branding.favicon_url ?? ""}
              placeholder="https://cdn.tudominio.com/favicon.png"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <LogoField
              name="client_banner_url"
              label="Banner del cliente (contratos y formularios)"
              hint="Foto horizontal (≈1200×400) que aparece arriba de los contratos y formularios del cliente. JPG, PNG o WEBP · máx 2 MB. Sin banner, se usa un degradado de marca con tu logo."
              initialUrl={
                (branding as { client_banner_url?: string | null })
                  .client_banner_url ?? null
              }
              variant="banner"
              cta="Subir banner"
              wide
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Font family
            </label>
            <input
              type="text"
              name="font_family"
              defaultValue={branding.font_family ?? ""}
              placeholder="Inter (default), Poppins, Manrope..."
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Color primario
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                defaultValue={branding.primary_color ?? "#7C3AED"}
                onChange={(e) => {
                  const txt = document.getElementById(
                    "primary_color_text",
                  ) as HTMLInputElement | null
                  if (txt) txt.value = e.target.value
                }}
                className="h-9 w-9 rounded border border-input bg-background"
              />
              <input
                id="primary_color_text"
                type="text"
                name="primary_color"
                defaultValue={branding.primary_color ?? "#7C3AED"}
                placeholder="#7C3AED"
                pattern="^#[0-9a-fA-F]{6}$"
                className="block flex-1 rounded-xl border border-input bg-background px-3 py-2 font-mono text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Color secundario (opcional)
            </label>
            <input
              type="text"
              name="secondary_color"
              defaultValue={branding.secondary_color ?? ""}
              placeholder="#10B981"
              pattern="^#[0-9a-fA-F]{6}$"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 font-mono text-sm"
            />
          </div>
        </div>
      </section>

      {/* Locale */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Languages className="mr-1 inline size-3.5" />
          Idioma, moneda y zona horaria
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Moneda</label>
            <select
              name="currency"
              defaultValue={branding.currency}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="DOP">DOP — Peso Dominicano</option>
              <option value="USD">USD — Dólar EE.UU.</option>
              <option value="EUR">EUR — Euro</option>
              <option value="MXN">MXN — Peso Mexicano</option>
              <option value="COP">COP — Peso Colombiano</option>
              <option value="ARS">ARS — Peso Argentino</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Locale</label>
            <select
              name="locale"
              defaultValue={branding.locale}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="es-DO">Español (RD)</option>
              <option value="es-MX">Español (México)</option>
              <option value="es-ES">Español (España)</option>
              <option value="en-US">English (US)</option>
              <option value="pt-BR">Português (Brasil)</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Timezone
            </label>
            <input
              type="text"
              name="timezone"
              defaultValue={branding.timezone}
              placeholder="America/Santo_Domingo"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Formato fecha
            </label>
            <select
              name="date_format"
              defaultValue={branding.date_format ?? "DD/MM/YYYY"}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="DD/MM/YYYY">DD/MM/YYYY (31/12/2025)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY (12/31/2025)</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD (2025-12-31)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Mail defaults */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Mail className="mr-1 inline size-3.5" />
          Defaults de correo outbound
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              "From" name (display)
            </label>
            <input
              type="text"
              name="from_name"
              defaultValue={branding.from_name ?? ""}
              placeholder="Abby Pixel Studio"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              "From" email
            </label>
            <input
              type="email"
              name="from_email"
              defaultValue={branding.from_email ?? ""}
              placeholder="hola@tudominio.com"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium">
              Reply-to email
            </label>
            <input
              type="email"
              name="reply_to_email"
              defaultValue={branding.reply_to_email ?? ""}
              placeholder="info@tudominio.com"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium">
              Firma HTML (se agrega al final de cada email)
            </label>
            <textarea
              name="email_signature_html"
              rows={5}
              defaultValue={branding.email_signature_html ?? ""}
              placeholder="<p>Saludos,<br/>Abby Peña — Abby Pixel Studio</p>"
              className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 font-mono text-xs"
            />
          </div>
        </div>
      </section>

      {/* Custom domain */}
      <section className="sf-card p-5">
        <h3 className="mb-3 flex items-center justify-between text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <span>
            <Globe className="mr-1 inline size-3.5" />
            Dominio personalizado
          </span>
          {!canCustomDomain && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium normal-case text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <Lock className="size-2.5" />
              Plan Pro+
            </span>
          )}
        </h3>

        {canCustomDomain ? (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Tu dominio (CNAME a my.abbypixel.com)
              </label>
              <input
                type="text"
                name="custom_domain"
                defaultValue={branding.custom_domain ?? ""}
                placeholder="portal.tuestudio.com"
                className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </div>

            {branding.custom_domain && (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-input bg-muted/30 p-3 text-xs">
                <div>
                  Estado:{" "}
                  {branding.custom_domain_verified ? (
                    <span className="text-emerald-600">
                      <CheckCircle2 className="mr-1 inline size-3" />
                      Verificado
                    </span>
                  ) : (
                    <span className="text-amber-600">
                      <AlertCircle className="mr-1 inline size-3" />
                      Pendiente de verificación
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  onClick={handleVerify}
                  disabled={isVerifying}
                  size="sm"
                  variant="outline"
                >
                  {isVerifying ? (
                    <Loader2 className="mr-1 size-3.5 animate-spin" />
                  ) : null}
                  Verificar dominio
                </Button>
              </div>
            )}
            {verifyResult && (
              <div
                className={
                  "mt-2 rounded-lg px-3 py-2 text-xs " +
                  (verifyResult.ok
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300")
                }
              >
                {verifyResult.msg}
              </div>
            )}
            <p className="mt-2 text-[10px] text-muted-foreground">
              Configura el CNAME de tu dominio apuntando a{" "}
              <code className="rounded bg-muted px-1">my.abbypixel.com</code>{" "}
              y luego presiona Verificar.
            </p>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Upgrade a Pro o superior en{" "}
            <a
              href="/settings/billing"
              className="font-semibold underline"
            >
              /settings/billing
            </a>{" "}
            para usar tu propio dominio.
          </div>
        )}
      </section>

      {/* White-label / Branding */}
      <section className="sf-card p-5">
        <h3 className="mb-3 flex items-center justify-between text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <span>
            <ImageIcon className="mr-1 inline size-3.5" />
            White-label
          </span>
          {!canRemoveBranding && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium normal-case text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <Lock className="size-2.5" />
              Plan Pro+
            </span>
          )}
        </h3>

        <label className="flex items-start gap-3 rounded-xl border border-input bg-background p-3">
          <input
            type="checkbox"
            name="hide_studioflow_branding"
            defaultChecked={branding.hide_studioflow_branding}
            disabled={!canRemoveBranding}
            className="mt-0.5 rounded border-input"
          />
          <div>
            <p className="text-sm font-medium">
              Ocultar "Powered by PixelOS"
            </p>
            <p className="text-[10px] text-muted-foreground">
              Quita la marca PixelOS del cliente portal, galerías
              públicas, footer de invoices.
            </p>
          </div>
        </label>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Custom Terms URL
            </label>
            <input
              type="url"
              name="custom_terms_url"
              defaultValue={branding.custom_terms_url ?? ""}
              placeholder="https://tuestudio.com/terms"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Custom Privacy URL
            </label>
            <input
              type="url"
              name="custom_privacy_url"
              defaultValue={branding.custom_privacy_url ?? ""}
              placeholder="https://tuestudio.com/privacy"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium">
              Custom Footer HTML
            </label>
            <textarea
              name="custom_footer_html"
              rows={3}
              defaultValue={branding.custom_footer_html ?? ""}
              placeholder="<p>© 2026 Tu Estudio. Hecho con ❤️.</p>"
              className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 font-mono text-xs"
            />
          </div>
        </div>
      </section>

      {/* Páginas públicas custom copy */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Copy de páginas públicas (HTML editable)
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Bienvenida del portal cliente
            </label>
            <textarea
              name="portal_welcome_html"
              rows={3}
              defaultValue={branding.portal_welcome_html ?? ""}
              placeholder="<h2>¡Bienvenido!</h2><p>Aquí encontrarás tus galerías, contratos y facturas.</p>"
              className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Intro del formulario de reserva pública
            </label>
            <textarea
              name="booking_form_intro_html"
              rows={3}
              defaultValue={branding.booking_form_intro_html ?? ""}
              placeholder="<p>¡Gracias por considerar mis servicios! Llena este formulario y te contacto en 24h.</p>"
              className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Texto al pie del PDF de invoice
            </label>
            <textarea
              name="invoice_footer_text"
              rows={2}
              defaultValue={branding.invoice_footer_text ?? ""}
              placeholder="Gracias por confiar en nosotros. Cualquier consulta: hola@tuestudio.com"
              className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-xs"
            />
          </div>
        </div>
      </section>

      {/* Social + contacto */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Share2 className="mr-1 inline size-3.5" />
          Contacto + redes sociales
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Sitio web
            </label>
            <input
              type="url"
              name="website_url"
              defaultValue={branding.website_url ?? ""}
              placeholder="https://tuestudio.com"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Instagram
            </label>
            <input
              type="url"
              name="instagram_url"
              defaultValue={branding.instagram_url ?? ""}
              placeholder="https://instagram.com/tuestudio"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Facebook
            </label>
            <input
              type="url"
              name="facebook_url"
              defaultValue={branding.facebook_url ?? ""}
              placeholder="https://facebook.com/tuestudio"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              WhatsApp
            </label>
            <input
              type="tel"
              name="whatsapp_phone"
              defaultValue={branding.whatsapp_phone ?? ""}
              placeholder="+18091234567"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Email de contacto
            </label>
            <input
              type="email"
              name="contact_email"
              defaultValue={branding.contact_email ?? ""}
              placeholder="info@tuestudio.com"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Dirección
            </label>
            <input
              type="text"
              name="business_address"
              defaultValue={branding.business_address ?? ""}
              placeholder="Calle 123, Santo Domingo, RD"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <SubmitButton />
      </div>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-1 size-4 animate-spin" />
          Guardando...
        </>
      ) : (
        <>
          <Save className="mr-1 size-4" />
          Guardar cambios
        </>
      )}
    </Button>
  )
}

/**
 * Campo de subida de logo: sube el archivo a /api/studio/branding/logo (bucket
 * público studio-branding) y guarda la URL pública en un input hidden que el
 * form persiste (logo_url / logo_dark_url → espejado a studios.logo_url).
 */
function LogoField({
  name,
  label,
  hint,
  initialUrl,
  variant,
  dark,
  cta = "Subir logo",
  wide,
}: {
  name: string
  label: string
  hint?: string
  initialUrl: string | null
  variant: "light" | "dark" | "favicon" | "banner"
  dark?: boolean
  cta?: string
  wide?: boolean
}) {
  const [url, setUrl] = useState(initialUrl ?? "")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setErr(null)
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("variant", variant)
      const res = await fetch("/api/studio/branding/logo", {
        method: "POST",
        body: fd,
      })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) throw new Error(json.error || "Error al subir")
      setUrl(json.url)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Error al subir")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium">{label}</label>
      <input type="hidden" name={name} value={url} />
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border border-input p-3",
          dark ? "bg-neutral-900" : "bg-background",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-input/60",
            wide ? "h-16 w-44" : "h-12 w-28",
            dark ? "bg-neutral-900" : "bg-muted/30",
          )}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={label}
              className={cn(
                "object-cover",
                wide ? "h-full w-full" : "max-h-10 max-w-[100px] object-contain",
              )}
            />
          ) : (
            <ImageIcon className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <UploadCloud className="size-3.5" />
              )}
              {url ? "Cambiar" : cta}
            </button>
            {url && (
              <button
                type="button"
                onClick={() => setUrl("")}
                className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                Quitar
              </button>
            )}
          </div>
          {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
          {err && <p className="text-[11px] text-red-600">{err}</p>}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={onPick}
      />
    </div>
  )
}
