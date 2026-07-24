"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Package, AlertTriangle, Check } from "lucide-react"
import {
  previewProjectPackageChangeAction,
  changeProjectPackageAction,
} from "@/server/actions/project.actions"
import { formatCurrency } from "@/lib/utils/currency"

type PlanOption = { id: string; name: string; price: number | null; currency: string | null }

// Debe coincidir con PackageChangePreview del servicio.
type Preview = {
  ok: boolean
  error?: string
  currentName: string
  from: { name: string | null; price: number | null; deliveryDays: number | null }
  to: { name: string | null; price: number | null; deliveryDays: number | null }
  money: {
    currentTotal: number
    newTotal: number
    diff: number
    amountPaid: number
    newBalance: number
    invoiceNumber: string | null
    invoiceStatus: string | null
  }
  newSessionName: string | null
  categoryChanges: boolean
  warnings: string[]
  applied?: string[]
}

interface Props {
  projectId: string
  currentPackageId: string | null
  currentPackageName: string | null
  packages: PlanOption[]
  currency?: string
}

export function ChangePackageCard({
  projectId,
  currentPackageId,
  currentPackageName,
  packages,
  currency = "DOP",
}: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState("")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [done, setDone] = useState<Preview | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const options = packages.filter((p) => p.id !== currentPackageId)

  const reset = () => {
    setOpen(false); setSelected(""); setPreview(null); setDone(null)
  }

  const loadPreview = (packageId: string) => {
    setSelected(packageId)
    setPreview(null)
    if (!packageId) return
    startTransition(async () => {
      const r = (await previewProjectPackageChangeAction(projectId, packageId)) as Preview
      setPreview(r)
    })
  }

  const confirm = () => {
    if (!selected) return
    startTransition(async () => {
      const r = (await changeProjectPackageAction(projectId, selected)) as Preview
      if (!r.ok) { setPreview(r); return }
      setDone(r)
      router.refresh()
    })
  }

  const money = (n: number) => formatCurrency(n, currency)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Package className="h-3.5 w-3.5" />
        Cambiar plan
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl">
            {done ? (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                    <Check className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold">Plan cambiado</p>
                    <p className="text-[12.5px] text-muted-foreground">
                      {done.from.name ?? "Sin plan"} → {done.to.name}
                    </p>
                  </div>
                </div>
                <ul className="mb-4 space-y-1.5 rounded-xl bg-muted/50 p-3 text-[12.5px]">
                  {(done.applied ?? []).map((a, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground">•</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={reset}
                  className="w-full rounded-lg bg-foreground px-4 py-2 text-[13px] font-medium text-background"
                >
                  Listo
                </button>
              </>
            ) : (
              <>
                <p className="text-[15px] font-semibold">Cambiar el plan de la sesión</p>
                <p className="mb-4 mt-0.5 text-[12.5px] text-muted-foreground">
                  Plan actual: <strong>{currentPackageName ?? "Sin plan"}</strong>. Te muestro
                  qué cambia antes de aplicar.
                </p>

                <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
                  Nuevo plan
                </label>
                <select
                  value={selected}
                  onChange={(e) => loadPreview(e.target.value)}
                  className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px]"
                >
                  <option value="">Elige un plan…</option>
                  {options.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.price != null ? ` — ${money(Number(p.price))}` : ""}
                    </option>
                  ))}
                </select>

                {pending && !preview && (
                  <p className="py-4 text-center text-[12.5px] text-muted-foreground">
                    Calculando el reajuste…
                  </p>
                )}

                {preview && !preview.ok && (
                  <p className="mb-3 rounded-lg bg-danger/10 p-3 text-[12.5px] text-danger">
                    {preview.error}
                  </p>
                )}

                {preview?.ok && (
                  <div className="mb-4 space-y-3">
                    <div className="rounded-xl border border-border p-3">
                      <div className="mb-2 flex items-center gap-2 text-[13px] font-medium">
                        <span>{preview.from.name ?? "Sin plan"}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-primary">{preview.to.name}</span>
                      </div>
                      <dl className="space-y-1 text-[12.5px]">
                        <Row label="Monto de la sesión">
                          <span className="text-muted-foreground line-through">
                            {money(preview.money.currentTotal)}
                          </span>{" "}
                          <strong>{money(preview.money.newTotal)}</strong>
                          {preview.money.diff !== 0 && (
                            <span
                              className={
                                preview.money.diff > 0
                                  ? "ml-1.5 text-amber-600 dark:text-amber-400"
                                  : "ml-1.5 text-emerald-600 dark:text-emerald-400"
                              }
                            >
                              ({preview.money.diff > 0 ? "+" : ""}
                              {money(preview.money.diff)})
                            </span>
                          )}
                        </Row>
                        {preview.money.invoiceNumber && (
                          <>
                            <Row label="Ya pagado">{money(preview.money.amountPaid)}</Row>
                            <Row label="Nuevo saldo">
                              <strong>{money(preview.money.newBalance)}</strong>
                            </Row>
                            <Row label="Factura">
                              {preview.money.invoiceNumber} (se ajusta y se actualiza en
                              Facturación)
                            </Row>
                          </>
                        )}
                        {preview.to.deliveryDays != null && (
                          <Row label="Días de entrega">
                            {preview.from.deliveryDays ?? "—"} → <strong>{preview.to.deliveryDays}</strong>
                          </Row>
                        )}
                        {preview.categoryChanges && (
                          <Row label="Categoría">Se mueve a la del plan nuevo</Row>
                        )}
                        {preview.newSessionName && (
                          <Row label="Nombre">{preview.newSessionName}</Row>
                        )}
                      </dl>
                    </div>

                    <p className="text-[11.5px] text-muted-foreground">
                      Las impresiones incluidas, los colaboradores requeridos y el vestido se
                      toman del plan, así que se ajustan solos.
                    </p>

                    {preview.warnings.length > 0 && (
                      <div className="space-y-1.5 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                        {preview.warnings.map((w, i) => (
                          <p
                            key={i}
                            className="flex gap-2 text-[12px] text-amber-800 dark:text-amber-300"
                          >
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span>{w}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={reset}
                    className="flex-1 rounded-lg border border-border px-4 py-2 text-[13px] font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirm}
                    disabled={!preview?.ok || pending}
                    className="flex-1 rounded-lg bg-foreground px-4 py-2 text-[13px] font-medium text-background disabled:opacity-40"
                  >
                    {pending ? "Aplicando…" : "Confirmar cambio"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}
