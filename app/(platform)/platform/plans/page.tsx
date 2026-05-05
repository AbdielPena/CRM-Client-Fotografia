import { Check, X, Package2 } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { listPlatformPlans } from '@/server/services/platform-admin.service'
import { formatCurrency } from '@/lib/utils/currency'

export default async function PlatformPlansPage() {
  const plans = await listPlatformPlans()

  // Union de todos los feature_keys para mostrar columna por plan
  const allFeatures = new Set<string>()
  for (const p of plans) {
    for (const f of p.features) allFeatures.add(f.featureKey)
  }
  const featureList = Array.from(allFeatures).sort()

  return (
    <div>
      <PageHeader
        title="Planes y features"
        description="Estructura de precios y features por plan."
        display
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((p) => (
            <div
              key={p.id}
              className="sf-card p-5 flex flex-col"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display text-2xl text-foreground leading-none">
                  {p.name}
                </h3>
                {p.isActive ? (
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                    Activo
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                    Inactivo
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-4 line-clamp-2 min-h-[32px]">
                {p.description ?? '—'}
              </p>

              <div className="mb-4">
                <p className="font-display text-3xl text-foreground tabular-nums leading-none">
                  {p.priceMonthlyDop
                    ? formatCurrency(p.priceMonthlyDop, 'DOP')
                    : 'Gratis'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {p.priceYearlyDop
                    ? `${formatCurrency(p.priceYearlyDop, 'DOP')} / año`
                    : 'Sin costo'}
                </p>
              </div>

              <dl className="space-y-1.5 text-xs border-t border-border pt-3">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Trial</dt>
                  <dd className="tabular-nums text-foreground">{p.trialDays}d</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Studios</dt>
                  <dd className="tabular-nums text-foreground">{p.studiosCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Público</dt>
                  <dd className="text-foreground">{p.isPublic ? 'Sí' : 'No'}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>

        <section className="sf-card overflow-hidden">
          <header className="px-6 py-4 border-b border-border">
            <h2 className="font-display text-xl text-foreground">Matriz de features</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Todas las flags configuradas por plan. Las celdas vacías significan no
              definida.
            </p>
          </header>

          {featureList.length === 0 ? (
            <div className="p-10 text-center">
              <Package2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Aún no hay features configuradas.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Feature
                    </th>
                    {plans.map((p) => (
                      <th
                        key={p.id}
                        className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                      >
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {featureList.map((key) => (
                    <tr key={key} className="hover:bg-muted transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground">
                        {key}
                      </td>
                      {plans.map((p) => {
                        const f = p.features.find((x) => x.featureKey === key)
                        return (
                          <td key={p.id} className="px-4 py-2.5 text-center">
                            {!f ? (
                              <span className="text-muted-foreground text-xs">—</span>
                            ) : f.isEnabled ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 text-xs">
                                <Check className="h-3.5 w-3.5" />
                                {f.limitValue !== null && (
                                  <span className="tabular-nums">{f.limitValue}</span>
                                )}
                              </span>
                            ) : (
                              <X className="h-3.5 w-3.5 text-danger inline" />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
