import Link from 'next/link'
import { Globe, CheckCircle2, XCircle, Clock } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { listAllDomains, type DomainStatus } from '@/server/services/domain.service'

type SearchParams = { q?: string; status?: string }

const STATUS_META: Record<DomainStatus, { label: string; icon: any; cls: string }> = {
  pending: {
    label: 'Pendiente',
    icon: Clock,
    cls: 'text-amber-700 bg-amber-50 border-amber-100',
  },
  verifying: {
    label: 'Verificando',
    icon: Clock,
    cls: 'text-blue-700 bg-blue-50 border-blue-100',
  },
  active: {
    label: 'Activo',
    icon: CheckCircle2,
    cls: 'text-emerald-700 bg-emerald-50 border-emerald-100',
  },
  failed: {
    label: 'Falló',
    icon: XCircle,
    cls: 'text-red-700 bg-red-50 border-red-100',
  },
  disabled: {
    label: 'Deshabilitado',
    icon: XCircle,
    cls: 'text-gray-600 bg-gray-100 border-gray-200',
  },
}

export default async function PlatformDomainsPage({
  searchParams,
}: {
  searchParams?: SearchParams
}) {
  const q = searchParams?.q?.trim() || undefined
  const statusParam = searchParams?.status
  const validStatuses: DomainStatus[] = [
    'pending',
    'verifying',
    'active',
    'failed',
    'disabled',
  ]
  const status = (validStatuses.includes(statusParam as DomainStatus)
    ? (statusParam as DomainStatus)
    : null)

  const domains = await listAllDomains({ search: q, status })

  return (
    <div>
      <PageHeader
        title="Dominios"
        description={`${domains.length} dominio${domains.length === 1 ? '' : 's'} en todos los studios`}
        display
      />

      <div className="p-8 space-y-4">
        <form className="flex items-center gap-3 flex-wrap">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Buscar dominio…"
            className="flex-1 min-w-[240px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
          />
          <select
            name="status"
            defaultValue={statusParam ?? ''}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
          >
            <option value="">Todos los estados</option>
            <option value="pending">Pendientes</option>
            <option value="verifying">Verificando</option>
            <option value="active">Activos</option>
            <option value="failed">Fallidos</option>
            <option value="disabled">Deshabilitados</option>
          </select>
          <button
            type="submit"
            className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
          >
            Filtrar
          </button>
        </form>

        <div className="sf-card overflow-hidden">
          {domains.length === 0 ? (
            <div className="p-10 text-center">
              <Globe className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                No hay dominios registrados todavía.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5">Dominio</th>
                  <th className="px-4 py-2.5">Studio</th>
                  <th className="px-4 py-2.5">Tipo</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5">Verificado</th>
                  <th className="px-4 py-2.5">Último check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {domains.map((d) => {
                  const meta = STATUS_META[d.status]
                  const Icon = meta.icon
                  return (
                    <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Globe className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                          <span className="font-medium text-gray-900 truncate">
                            {d.domain}
                          </span>
                          {d.isPrimary && (
                            <span className="text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5">
                              Principal
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/platform/studios/${d.studioId}`}
                          className="text-gray-700 hover:text-violet-700 truncate inline-block max-w-[200px]"
                        >
                          {d.studioName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-600 capitalize">{d.type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium border rounded-full px-2 py-0.5 ${meta.cls}`}
                        >
                          <Icon className="h-3 w-3" /> {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {d.verifiedAt
                          ? new Date(d.verifiedAt).toLocaleDateString('es')
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {d.lastCheckAt
                          ? new Date(d.lastCheckAt).toLocaleString('es')
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
