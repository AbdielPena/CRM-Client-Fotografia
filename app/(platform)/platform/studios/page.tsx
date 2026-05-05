import Link from 'next/link'
import { Building2, Search } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { listPlatformStudios } from '@/server/services/platform-admin.service'
import { formatCurrency } from '@/lib/utils/currency'

type SearchParams = {
  q?: string
  plan?: string
  suspended?: string
}

export default async function PlatformStudiosPage({
  searchParams,
}: {
  searchParams?: SearchParams
}) {
  const q = searchParams?.q?.trim() || undefined
  const planSlug = searchParams?.plan || undefined
  const suspendedParam = searchParams?.suspended
  const suspended =
    suspendedParam === '1' ? true : suspendedParam === '0' ? false : null

  const studios = await listPlatformStudios({
    search: q,
    planSlug: planSlug ?? null,
    suspended,
  })

  return (
    <div>
      <PageHeader
        title="Studios"
        description={`${studios.length} resultado${studios.length === 1 ? '' : 's'}`}
        display
      />

      <div className="p-8 space-y-4">
        <form className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ''}
              placeholder="Buscar por nombre o slug…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
            />
          </div>
          <select
            name="plan"
            defaultValue={planSlug ?? ''}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-card focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
          >
            <option value="">Todos los planes</option>
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="studio">Studio</option>
          </select>
          <select
            name="suspended"
            defaultValue={suspendedParam ?? ''}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-card focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
          >
            <option value="">Todos los estados</option>
            <option value="0">Activos</option>
            <option value="1">Suspendidos</option>
          </select>
          <button
            type="submit"
            className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
          >
            Filtrar
          </button>
        </form>

        <div className="sf-card overflow-hidden">
          {studios.length === 0 ? (
            <div className="p-10 text-center">
              <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No hay studios que coincidan con el filtro.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <th className="px-4 py-2.5">Studio</th>
                  <th className="px-4 py-2.5">Plan</th>
                  <th className="px-4 py-2.5 text-right">Miembros</th>
                  <th className="px-4 py-2.5 text-right">Bookings</th>
                  <th className="px-4 py-2.5 text-right">Revenue</th>
                  <th className="px-4 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {studios.map((s) => (
                  <tr key={s.id} className="hover:bg-muted transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/platform/studios/${s.id}`}
                        className="flex items-center gap-3 group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground group-hover:text-violet-700 truncate">
                            {s.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">/{s.slug}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {s.planName ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100">
                          {s.planName}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin plan</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {s.memberCount}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {s.bookingsCount}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                      {formatCurrency(s.revenueDop, 'DOP')}
                    </td>
                    <td className="px-4 py-3">
                      {s.isSuspended ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-danger/10 text-danger border border-red-100">
                          Suspendido
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                          Activo
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
