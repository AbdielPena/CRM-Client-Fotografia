import { Globe, CheckCircle2, XCircle, Clock, Copy, Trash2, Star } from 'lucide-react'

import { AppTopbar } from '@/components/layout/app-topbar'
import { requireStudioAuth } from '@/server/middleware/auth'
import { countUnreadNotifications } from '@/server/services/notification.service'
import {
  listDomainsForStudio,
  getDnsInstructions,
  type StudioDomain,
} from '@/server/services/domain.service'
import {
  addDomainAction,
  removeDomainAction,
  verifyDomainAction,
  setPrimaryDomainAction,
} from '@/server/actions/domain.actions'

export default async function DomainSettingsPage() {
  const session = await requireStudioAuth()
  const [domains, unread] = await Promise.all([
    listDomainsForStudio(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Dominio personalizado"
        description="Conecta tu propio dominio para tus links públicos de paquetes y galerías."
        unreadNotifications={unread}
      />

      <div className="px-6 py-6 lg:px-8 lg:py-8 space-y-6 max-w-4xl">
        {/* Add new */}
        <section className="sf-card p-6">
          <h2 className="font-display text-xl text-foreground mb-1">Añadir dominio</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Ej: <code className="bg-muted/60 px-1.5 py-0.5 rounded">reservas.miestudio.com</code>{' '}
            o <code className="bg-muted/60 px-1.5 py-0.5 rounded">miestudio.com</code>
          </p>
          <form action={addDomainAction} className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Dominio
              </label>
              <input
                type="text"
                name="domain"
                required
                placeholder="reservas.miestudio.com"
                className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
            >
              Añadir
            </button>
          </form>
        </section>

        {/* List */}
        {domains.length === 0 ? (
          <div className="sf-card p-10 text-center">
            <Globe className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Aún no has añadido dominios. El primero será el principal.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {domains.map((d) => (
              <DomainCard key={d.id} domain={d} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function DomainCard({ domain }: { domain: StudioDomain }) {
  const dns = getDnsInstructions(domain)
  const isActive = domain.status === 'active'
  const isPending = domain.status === 'pending' || domain.status === 'verifying'
  const isFailed = domain.status === 'failed'

  return (
    <div className="sf-card p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium text-foreground truncate">{domain.domain}</h3>
            {domain.isPrimary && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5">
                <Star className="h-2.5 w-2.5 fill-current" /> Principal
              </span>
            )}
          </div>
          <StatusPill domain={domain} />
          {domain.lastError && (
            <p className="text-xs text-red-600 mt-2">{domain.lastError}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isActive && !domain.isPrimary && (
            <form action={setPrimaryDomainAction}>
              <input type="hidden" name="domainId" value={domain.id} />
              <button
                type="submit"
                title="Marcar como principal"
                className="px-3 py-1.5 text-xs font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors"
              >
                Hacer principal
              </button>
            </form>
          )}
          {!isActive && (
            <form action={verifyDomainAction}>
              <input type="hidden" name="domainId" value={domain.id} />
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors"
              >
                Verificar ahora
              </button>
            </form>
          )}
          {!domain.isPrimary && (
            <form action={removeDomainAction}>
              <input type="hidden" name="domainId" value={domain.id} />
              <button
                type="submit"
                title="Eliminar"
                className="p-1.5 text-muted-foreground hover:text-red-600 border border-transparent hover:border-red-100 rounded-lg transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </form>
          )}
        </div>
      </div>

      {(isPending || isFailed) && (
        <div className="border-t border-border/60 pt-4">
          <p className="text-xs font-semibold text-foreground mb-3">
            Añade estos registros DNS en tu proveedor (GoDaddy, Cloudflare, Namecheap…):
          </p>

          <DnsRow
            label="1. Verificación (TXT)"
            type="TXT"
            host={dns.txtHost}
            value={dns.txtValue}
          />

          <DnsRow
            label={domain.type === 'subdomain' ? '2. Apunte (CNAME)' : '2. Apunte (CNAME)'}
            type="CNAME"
            host={dns.cnameHost}
            value={dns.cnameTarget}
          />

          <p className="text-[11px] text-muted-foreground mt-3">
            Tras propagación (suele tardar 5–30 min), presiona “Verificar ahora”.
            Después emitiremos el certificado SSL automáticamente.
          </p>
        </div>
      )}

      {isActive && (
        <div className="border-t border-border/60 pt-4 text-xs text-muted-foreground">
          Verificado {domain.verifiedAt ? new Date(domain.verifiedAt).toLocaleDateString('es') : ''}
          {domain.sslStatus && (
            <>
              {' · '}SSL: <span className="font-medium text-foreground">{domain.sslStatus}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function StatusPill({ domain }: { domain: StudioDomain }) {
  if (domain.status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
        <CheckCircle2 className="h-3 w-3" /> Activo
      </span>
    )
  }
  if (domain.status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
        <Clock className="h-3 w-3" /> Pendiente DNS
      </span>
    )
  }
  if (domain.status === 'verifying') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
        <Clock className="h-3 w-3 animate-pulse" /> Verificando
      </span>
    )
  }
  if (domain.status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-100 rounded-full px-2 py-0.5">
        <XCircle className="h-3 w-3" /> Falló verificación
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground/80 bg-muted/60 rounded-full px-2 py-0.5">
      {domain.status}
    </span>
  )
}

function DnsRow({
  label,
  type,
  host,
  value,
}: {
  label: string
  type: string
  host: string
  value: string
}) {
  return (
    <div className="mb-2 last:mb-0">
      <p className="text-[11px] font-medium text-muted-foreground mb-1">{label}</p>
      <div className="grid grid-cols-[60px_1fr] gap-2 text-xs font-mono bg-muted/30 border border-border/60 rounded-lg p-2.5">
        <div>
          <span className="text-muted-foreground text-[10px] uppercase font-sans font-semibold block">
            Tipo
          </span>
          <span className="text-foreground">{type}</span>
        </div>
        <div className="min-w-0">
          <span className="text-muted-foreground text-[10px] uppercase font-sans font-semibold block">
            Host
          </span>
          <span className="text-foreground break-all">{host}</span>
        </div>
        <div className="col-span-2">
          <span className="text-muted-foreground text-[10px] uppercase font-sans font-semibold block">
            Valor
          </span>
          <span className="text-foreground break-all flex items-center gap-2">
            {value}
            <Copy className="h-3 w-3 text-muted-foreground" />
          </span>
        </div>
      </div>
    </div>
  )
}
