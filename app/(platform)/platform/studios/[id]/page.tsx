import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Calendar,
  Users,
  BadgeDollarSign,
  Package,
  Mail,
  Phone,
  Clock,
  Trash2,
} from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import {
  getPlatformStudioDetail,
  listPlatformPlans,
} from '@/server/services/platform-admin.service'
import { formatCurrency } from '@/lib/utils/currency'
import {
  changeStudioPlanAction,
  toggleStudioSuspensionAction,
  grantFeatureOverrideAction,
  removeFeatureOverrideAction,
} from '@/server/actions/platform-admin.actions'

export default async function PlatformStudioDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const [studio, plans] = await Promise.all([
    getPlatformStudioDetail(params.id),
    listPlatformPlans(),
  ])

  if (!studio) notFound()

  return (
    <div>
      <PageHeader
        title={studio.name}
        description={
          <span className="flex items-center gap-3 text-xs text-gray-500">
            <span>/{studio.slug}</span>
            <span>·</span>
            <span>Creado {new Date(studio.createdAt).toLocaleDateString('es')}</span>
            {studio.isSuspended && (
              <>
                <span>·</span>
                <span className="text-red-600 font-medium">Suspendido</span>
              </>
            )}
          </span>
        }
        display
        actions={
          <Link
            href="/platform/studios"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" /> Studios
          </Link>
        }
      />

      <div className="p-8 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile icon={<Users className="h-5 w-5" />} label="Miembros" value={studio.stats.members} />
          <StatTile icon={<Calendar className="h-5 w-5" />} label="Bookings" value={studio.stats.bookings} />
          <StatTile icon={<Package className="h-5 w-5" />} label="Clientes" value={studio.stats.clients} />
          <StatTile
            icon={<BadgeDollarSign className="h-5 w-5" />}
            label="Revenue"
            value={formatCurrency(studio.stats.revenueDop, studio.currency)}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Info */}
          <section className="sf-card p-6 lg:col-span-1">
            <h2 className="font-display text-xl text-gray-900 mb-4">Contacto</h2>
            <dl className="space-y-3 text-sm">
              {studio.owner && (
                <div>
                  <dt className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">
                    Owner
                  </dt>
                  <dd className="text-gray-900">
                    {studio.owner.name ?? studio.owner.email ?? 'Sin nombre'}
                  </dd>
                  {studio.owner.email && studio.owner.name && (
                    <dd className="text-xs text-gray-500">{studio.owner.email}</dd>
                  )}
                </div>
              )}
              {studio.email && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Mail className="h-3.5 w-3.5 text-gray-400" />
                  <span>{studio.email}</span>
                </div>
              )}
              {studio.phone && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Phone className="h-3.5 w-3.5 text-gray-400" />
                  <span>{studio.phone}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-gray-700">
                <Clock className="h-3.5 w-3.5 text-gray-400" />
                <span>
                  {studio.timezone} · {studio.currency}
                </span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <span
                  className="w-4 h-4 rounded-full border border-gray-200"
                  style={{ backgroundColor: studio.primaryColor }}
                />
                <span className="text-xs text-gray-500 tabular-nums">
                  {studio.primaryColor}
                </span>
              </div>
            </dl>
          </section>

          {/* Plan + suspension */}
          <section className="sf-card p-6 lg:col-span-2 space-y-6">
            <div>
              <h2 className="font-display text-xl text-gray-900 mb-1">Plan</h2>
              <p className="text-xs text-gray-500 mb-4">
                Cambiar de plan actualiza los features por defecto. Los overrides se
                respetan.
              </p>
              <form
                action={changeStudioPlanAction}
                className="flex items-end gap-3 flex-wrap"
              >
                <input type="hidden" name="studioId" value={studio.id} />
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Plan actual: {studio.plan?.name ?? 'Sin plan'}
                  </label>
                  <select
                    name="planSlug"
                    defaultValue={studio.plan?.slug ?? ''}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
                  >
                    <option value="">— Sin plan —</option>
                    {plans.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.name}
                        {p.priceMonthlyDop
                          ? ` · ${formatCurrency(p.priceMonthlyDop, 'DOP')}/mes`
                          : ' · Gratis'}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
                >
                  Guardar plan
                </button>
              </form>
            </div>

            <div className="pt-6 border-t border-gray-100">
              <h2 className="font-display text-xl text-gray-900 mb-1">
                {studio.isSuspended ? 'Reactivar studio' : 'Suspender studio'}
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                {studio.isSuspended
                  ? 'Este studio está suspendido. Al reactivar podrá volver a operar.'
                  : 'Suspender bloquea el acceso al panel. Los datos y archivos se preservan.'}
              </p>
              <form
                action={toggleStudioSuspensionAction}
                className="flex items-end gap-3 flex-wrap"
              >
                <input type="hidden" name="studioId" value={studio.id} />
                <input
                  type="hidden"
                  name="suspend"
                  value={studio.isSuspended ? '0' : '1'}
                />
                {!studio.isSuspended && (
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Motivo (opcional)
                    </label>
                    <input
                      type="text"
                      name="reason"
                      placeholder="Impago, abuso de términos, etc."
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
                    />
                  </div>
                )}
                <button
                  type="submit"
                  className={
                    studio.isSuspended
                      ? 'px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors'
                      : 'px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors'
                  }
                >
                  {studio.isSuspended ? 'Reactivar' : 'Suspender'}
                </button>
              </form>
            </div>
          </section>
        </div>

        {/* Feature overrides */}
        <section className="sf-card p-6">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="font-display text-xl text-gray-900">Feature overrides</h2>
              <p className="text-xs text-gray-500 mt-1">
                Flags otorgados a este studio por encima de su plan.
              </p>
            </div>
            <span className="text-xs text-gray-500 tabular-nums">
              {studio.overrides.length} override
              {studio.overrides.length === 1 ? '' : 's'}
            </span>
          </div>

          {studio.overrides.length > 0 && (
            <div className="mb-6 overflow-hidden border border-gray-100 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="px-3 py-2">Feature</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Límite</th>
                    <th className="px-3 py-2">Motivo</th>
                    <th className="px-3 py-2">Expira</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {studio.overrides.map((o) => (
                    <tr key={o.id}>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-800">
                        {o.featureKey}
                      </td>
                      <td className="px-3 py-2.5">
                        {o.isEnabled ? (
                          <span className="text-emerald-700 text-xs font-medium">
                            Enabled
                          </span>
                        ) : (
                          <span className="text-red-600 text-xs font-medium">Disabled</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                        {o.limitValue ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[260px] truncate">
                        {o.reason ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {o.expiresAt
                          ? new Date(o.expiresAt).toLocaleDateString('es')
                          : 'Permanente'}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <form action={removeFeatureOverrideAction}>
                          <input type="hidden" name="overrideId" value={o.id} />
                          <input type="hidden" name="studioId" value={studio.id} />
                          <button
                            type="submit"
                            title="Eliminar override"
                            className="text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form
            action={grantFeatureOverrideAction}
            className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
          >
            <input type="hidden" name="studioId" value={studio.id} />
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Feature key
              </label>
              <input
                type="text"
                name="featureKey"
                required
                placeholder="ai_retouch"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Estado
              </label>
              <select
                name="isEnabled"
                defaultValue="1"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
              >
                <option value="1">Enabled</option>
                <option value="0">Disabled</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Límite
              </label>
              <input
                type="number"
                name="limitValue"
                placeholder="—"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Expira
              </label>
              <input
                type="date"
                name="expiresAt"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
              />
            </div>
            <div className="md:col-span-1">
              <button
                type="submit"
                className="w-full px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
              >
                Añadir
              </button>
            </div>
            <div className="md:col-span-6">
              <input
                type="text"
                name="reason"
                placeholder="Motivo (opcional)"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
              />
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
}) {
  return (
    <div className="sf-card p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500 flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="font-display text-2xl text-gray-900 leading-none tabular-nums mt-1">
          {value}
        </p>
      </div>
    </div>
  )
}
