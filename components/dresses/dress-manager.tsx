"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Plus,
  Pencil,
  Trash2,
  Store,
  Shirt,
  X,
  ExternalLink,
  MessageCircle,
  Lock,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/cn"
import {
  createStoreAction,
  updateStoreAction,
  deleteStoreAction,
  createDressAction,
  updateDressAction,
  deleteDressAction,
} from "@/server/actions/dress-catalog.actions"

type DressStore = {
  id: string
  name: string
  contact_whatsapp: string | null
  notes: string | null
  dress_count: number
}
type Dress = {
  id: string
  store_id: string
  store_name: string | null
  name: string
  collection: string | null
  image_url: string | null
  rental_price: number | null
  deposit: number | null
  currency: string
  notes: string | null
  is_active: boolean
}
type SelectionDress = {
  name: string
  image: string | null
  rentalPrice: number | null
  deposit: number | null
}
type Selection = {
  token: string
  clientName: string
  clientWhatsapp: string | null
  tentativeDate: string | null
  planInterest: string | null
  createdAt: string
  dresses: SelectionDress[]
  totalRental: number
  totalDeposit: number
  matched: number
}

const rd = (n: number | null | undefined) =>
  n == null ? "—" : "RD$" + Number(n).toLocaleString("es-DO")

const APP = process.env.NEXT_PUBLIC_APP_URL || "https://my.abbypixel.com"
const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-border-strong"

export function DressManager({
  stores,
  dresses,
  selections,
}: {
  stores: DressStore[]
  dresses: Dress[]
  selections: Selection[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<"catalogo" | "selecciones">("catalogo")
  const [storeFilter, setStoreFilter] = useState<string>("all")
  const [isPending, startTransition] = useTransition()

  const [dressDialog, setDressDialog] = useState<Dress | "new" | null>(null)
  const [storeDialog, setStoreDialog] = useState<DressStore | "new" | null>(null)

  const filtered = useMemo(
    () =>
      storeFilter === "all"
        ? dresses
        : dresses.filter((d) => d.store_id === storeFilter),
    [dresses, storeFilter],
  )

  function run(fn: () => Promise<{ success: true } | { error: string }>, okMsg: string) {
    startTransition(async () => {
      const r = await fn()
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success(okMsg)
      setDressDialog(null)
      setStoreDialog(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Aviso de privacidad */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5" />
        Los precios de renta son privados — solo tú los ves aquí y en las selecciones; el cliente nunca los ve.
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {(["catalogo", "selecciones"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "relative px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "catalogo" ? "Catálogo" : `Selecciones de clientes (${selections.length})`}
            {tab === t && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-foreground" />
            )}
          </button>
        ))}
      </div>

      {tab === "catalogo" ? (
        <CatalogoTab
          stores={stores}
          dresses={filtered}
          storeFilter={storeFilter}
          setStoreFilter={setStoreFilter}
          onNewDress={() => setDressDialog("new")}
          onEditDress={(d) => setDressDialog(d)}
          onDeleteDress={(d) =>
            run(() => deleteDressAction(d.id), "Vestido eliminado")
          }
          onNewStore={() => setStoreDialog("new")}
          onEditStore={(s) => setStoreDialog(s)}
          onDeleteStore={(s) =>
            run(() => deleteStoreAction(s.id), "Tienda eliminada")
          }
          isPending={isPending}
        />
      ) : (
        <SeleccionesTab selections={selections} />
      )}

      {dressDialog && (
        <DressDialog
          stores={stores}
          dress={dressDialog === "new" ? null : dressDialog}
          onClose={() => setDressDialog(null)}
          onSave={(payload, id) =>
            run(
              () =>
                id ? updateDressAction(id, payload) : createDressAction(payload),
              id ? "Vestido actualizado" : "Vestido agregado",
            )
          }
          isPending={isPending}
        />
      )}
      {storeDialog && (
        <StoreDialog
          store={storeDialog === "new" ? null : storeDialog}
          onClose={() => setStoreDialog(null)}
          onSave={(payload, id) =>
            run(
              () =>
                id ? updateStoreAction(id, payload) : createStoreAction(payload),
              id ? "Tienda actualizada" : "Tienda agregada",
            )
          }
          onDelete={(id) => run(() => deleteStoreAction(id), "Tienda eliminada")}
          isPending={isPending}
        />
      )}
    </div>
  )
}

// ── Catálogo ─────────────────────────────────────────────────────────────────
function CatalogoTab(props: {
  stores: DressStore[]
  dresses: Dress[]
  storeFilter: string
  setStoreFilter: (v: string) => void
  onNewDress: () => void
  onEditDress: (d: Dress) => void
  onDeleteDress: (d: Dress) => void
  onNewStore: () => void
  onEditStore: (s: DressStore) => void
  onDeleteStore: (s: DressStore) => void
  isPending: boolean
}) {
  const { stores, dresses } = props
  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => props.setStoreFilter("all")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              props.storeFilter === "all"
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Todas ({dressesTotal(stores)})
          </button>
          {stores.map((s) => (
            <span key={s.id} className="group inline-flex items-center">
              <button
                onClick={() => props.setStoreFilter(s.id)}
                className={cn(
                  "rounded-l-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  props.storeFilter === s.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Store className="mr-1 inline h-3 w-3" />
                {s.name} ({s.dress_count})
              </button>
              <button
                onClick={() => props.onEditStore(s)}
                title="Editar tienda"
                className="rounded-r-full border border-l-0 border-border px-1.5 py-1.5 text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={props.onNewStore}>
            <Store className="h-3.5 w-3.5" /> Nueva tienda
          </Button>
          <Button size="sm" onClick={props.onNewDress} disabled={stores.length === 0}>
            <Plus className="h-3.5 w-3.5" /> Nuevo vestido
          </Button>
        </div>
      </div>

      {dresses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {stores.length === 0
            ? "Crea una tienda y luego agrega vestidos con su precio de renta."
            : "No hay vestidos en este filtro."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {dresses.map((d) => (
            <div
              key={d.id}
              className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card"
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
                {d.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.image_url}
                    alt={d.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                    <Shirt className="h-8 w-8" />
                  </div>
                )}
                {d.collection && (
                  <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase text-white backdrop-blur">
                    {d.collection}
                  </span>
                )}
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => props.onEditDress(d)}
                    className="rounded-full bg-black/55 p-1.5 text-white backdrop-blur hover:bg-black/75"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`¿Eliminar "${d.name}"?`)) props.onDeleteDress(d)
                    }}
                    className="rounded-full bg-black/55 p-1.5 text-white backdrop-blur hover:bg-rose-600"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-0.5 p-3">
                <p className="truncate text-sm font-medium text-foreground" title={d.name}>
                  {d.name}
                </p>
                <p className="text-base font-semibold text-foreground">{rd(d.rental_price)}</p>
                <p className="text-[11px] text-muted-foreground">
                  Depósito {rd(d.deposit)}
                  {d.store_name ? ` · ${d.store_name}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function dressesTotal(stores: DressStore[]) {
  return stores.reduce((a, s) => a + s.dress_count, 0)
}

// ── Selecciones ──────────────────────────────────────────────────────────────
function SeleccionesTab({ selections }: { selections: Selection[] }) {
  if (selections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Aún no hay selecciones de clientes. Cuando una clienta arme su selección de vestidos
        en la web, aparecerá aquí con los precios.
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {selections.map((s) => {
        const date = new Date(s.createdAt).toLocaleDateString("es-DO", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
        const waNum = (s.clientWhatsapp || "").replace(/\D/g, "")
        return (
          <div key={s.token} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{s.clientName}</p>
                <p className="text-xs text-muted-foreground">
                  {s.dresses.length} vestidos · {date}
                  {s.planInterest ? ` · ${s.planInterest}` : ""}
                  {s.tentativeDate ? ` · ${s.tentativeDate}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {waNum && (
                  <a
                    href={`https://wa.me/${waNum.length <= 10 ? "1" + waNum : waNum}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                )}
                <a
                  href={`${APP}/vestidos/${s.token}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Ver link
                </a>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {s.dresses.map((d, i) => (
                <div key={i} className="overflow-hidden rounded-lg border border-border bg-background">
                  <div className="aspect-[3/4] w-full overflow-hidden bg-muted">
                    {d.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.image} alt={d.name} loading="lazy" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="truncate text-[11px] font-medium text-foreground" title={d.name}>
                      {d.name}
                    </p>
                    <p className="text-[11px] font-semibold text-foreground">
                      {d.rentalPrice == null ? (
                        <span className="text-muted-foreground">sin precio</span>
                      ) : (
                        rd(d.rentalPrice)
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">
                Depósito total: <span className="font-medium text-foreground">{rd(s.totalDeposit)}</span>
              </span>
              <span className="text-muted-foreground">
                Renta total:{" "}
                <span className="text-base font-semibold text-foreground">{rd(s.totalRental)}</span>
              </span>
              {s.matched < s.dresses.length && (
                <span className="text-[11px] text-amber-600">
                  {s.dresses.length - s.matched} sin precio registrado
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Dialogs ──────────────────────────────────────────────────────────────────
function Overlay({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-auto rounded-2xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function DressDialog({
  stores,
  dress,
  onClose,
  onSave,
  isPending,
}: {
  stores: DressStore[]
  dress: Dress | null
  onClose: () => void
  onSave: (payload: Record<string, unknown>, id?: string) => void
  isPending: boolean
}) {
  const [storeId, setStoreId] = useState(dress?.store_id ?? stores[0]?.id ?? "")
  const [name, setName] = useState(dress?.name ?? "")
  const [collection, setCollection] = useState(dress?.collection ?? "")
  const [imageUrl, setImageUrl] = useState(dress?.image_url ?? "")
  const [rental, setRental] = useState(dress?.rental_price?.toString() ?? "")
  const [deposit, setDeposit] = useState(dress?.deposit?.toString() ?? "")
  const [notes, setNotes] = useState(dress?.notes ?? "")

  function submit() {
    if (!storeId) return toast.error("Elige una tienda")
    if (name.trim().length < 1) return toast.error("Escribe el nombre del vestido")
    onSave(
      {
        storeId,
        name,
        collection: collection || null,
        imageUrl: imageUrl || null,
        rentalPrice: rental === "" ? null : Number(rental),
        deposit: deposit === "" ? null : Number(deposit),
        notes: notes || null,
      },
      dress?.id,
    )
  }

  return (
    <Overlay title={dress ? "Editar vestido" : "Nuevo vestido"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Tienda *">
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className={inputCls}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nombre del vestido *">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Mia" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Precio renta (DOP)">
            <Input
              type="number"
              min="0"
              value={rental}
              onChange={(e) => setRental(e.target.value)}
              placeholder="8000"
            />
          </Field>
          <Field label="Depósito (DOP)">
            <Input
              type="number"
              min="0"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder="2000"
            />
          </Field>
        </div>
        <Field label="Colección">
          <Input
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            placeholder="luxury / vip"
          />
        </Field>
        <Field label="URL de la foto">
          <Input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://abbypixel.com/assets/images/Vestidos/…"
          />
        </Field>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-28 w-auto rounded-lg border border-border object-cover" />
        )}
        <Field label="Notas">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputCls}
          />
        </Field>
        <Button onClick={submit} disabled={isPending} className="w-full">
          {dress ? "Guardar cambios" : "Agregar vestido"}
        </Button>
      </div>
    </Overlay>
  )
}

function StoreDialog({
  store,
  onClose,
  onSave,
  onDelete,
  isPending,
}: {
  store: DressStore | null
  onClose: () => void
  onSave: (payload: Record<string, unknown>, id?: string) => void
  onDelete: (id: string) => void
  isPending: boolean
}) {
  const [name, setName] = useState(store?.name ?? "")
  const [wa, setWa] = useState(store?.contact_whatsapp ?? "")
  const [notes, setNotes] = useState(store?.notes ?? "")
  return (
    <Overlay title={store ? "Editar tienda" : "Nueva tienda"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nombre de la tienda *">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Quinceañeras VIP RD" />
        </Field>
        <Field label="WhatsApp / contacto">
          <Input value={wa} onChange={(e) => setWa(e.target.value)} placeholder="809 000 0000" />
        </Field>
        <Field label="Notas">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
        </Field>
        <Button
          onClick={() => {
            if (name.trim().length < 2) return toast.error("Escribe el nombre de la tienda")
            onSave({ name, contactWhatsapp: wa || null, notes: notes || null }, store?.id)
          }}
          disabled={isPending}
          className="w-full"
        >
          {store ? "Guardar cambios" : "Crear tienda"}
        </Button>
        {store && (
          <button
            onClick={() => {
              if (confirm(`¿Eliminar la tienda "${store.name}" y TODOS sus vestidos?`))
                onDelete(store.id)
            }}
            className="w-full text-center text-xs text-rose-500 hover:underline"
          >
            Eliminar tienda
          </button>
        )}
      </div>
    </Overlay>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
