"use client"

import { useTransition } from "react"
import { Globe, Loader2 } from "lucide-react"

import { setLocaleAction } from "@/server/actions/locale.actions"
import { SUPPORTED_LOCALES } from "@/lib/i18n"

const LOCALE_LABELS: Record<string, string> = {
  "es-DO": "🇩🇴 Español (RD)",
  "es-MX": "🇲🇽 Español (México)",
  "es-ES": "🇪🇸 Español (España)",
  "en-US": "🇺🇸 English",
  "pt-BR": "🇧🇷 Português",
}

export function LocaleSwitcher({ currentLocale }: { currentLocale: string }) {
  const [isPending, startTransition] = useTransition()

  function handleChange(locale: string) {
    startTransition(async () => {
      await setLocaleAction(locale)
      window.location.reload()
    })
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Globe className="size-3.5 text-muted-foreground" />
      {isPending ? (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
      ) : (
        <select
          value={currentLocale}
          onChange={(e) => handleChange(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
        >
          {SUPPORTED_LOCALES.map((loc) => (
            <option key={loc} value={loc}>
              {LOCALE_LABELS[loc] ?? loc}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
