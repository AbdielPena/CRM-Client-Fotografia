"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useDropzone, type FileRejection } from "react-dropzone"
import { Upload, CheckCircle, Loader2, AlertCircle, RotateCw } from "lucide-react"
import { toast } from "sonner"

/**
 * Subidor de fotos de galería.
 *
 * Pensado para tandas grandes (2.000+ fotos en una sola sesión). Las reglas que
 * lo mantienen vivo hasta el final:
 *
 *  1. NINGUNA petición espera para siempre. Cada paso tiene tiempo límite y,
 *     durante la subida del archivo, un detector de "conexión sin avanzar":
 *     si deja de moverse, se corta y se reintenta.
 *  2. Reintentos automáticos con espera creciente ante fallos de red, cortes
 *     del servidor (deploy, reinicio) y errores 5xx/429.
 *  3. Cola con trabajadores fijos en vez de lotes: una foto lenta ya NO frena
 *     a las demás (antes un `Promise.all` por lote paraba todo el proceso).
 *  4. El estado por foto vive en un ref y la pantalla se refresca a intervalos:
 *     con 1.800 fotos, redibujar en cada cambio dejaba el navegador pegado.
 *  5. Aviso al cerrar la pestaña y wake lock para que el sistema no duerma la
 *     página a mitad de una subida larga.
 */

type UploadStatus = "pending" | "uploading" | "processing" | "done" | "error"

interface UploadFile {
  id: string
  file: File
  status: UploadStatus
  progress: number
  error?: string
  attempt: number
  /** Carpeta destino elegida cuando se soltó el archivo (no cuando se sube). */
  setId: string | null
  deliveryTrack: "social" | "high_quality" | null
}

/** Target opcional: set/carpeta destino con su pista de entrega asociada. */
export interface UploadTarget {
  id: string
  name: string
  deliveryTrack: "social" | "high_quality" | null
}

interface AssetUploaderProps {
  galleryId: string
  studioId: string
  /**
   * Para galerías de ENTREGA FINAL: lista de carpetas destino. El uploader
   * exige elegir una antes de subir y manda el set_id + delivery_track al
   * endpoint. Omitir para galerías de selección (comportamiento legacy).
   */
  targets?: UploadTarget[]
}

// ── Parámetros de resistencia ────────────────────────────────────────────────
/** Subidas en paralelo. Más de esto satura el navegador y el storage. */
const WORKERS = 4
/** Intentos por foto antes de darla por fallida. */
const MAX_ATTEMPTS = 4
/** Tiempo límite de las llamadas cortas al CRM (preparar / confirmar). */
const API_TIMEOUT_MS = 45_000
/** Piso de tiempo para subir un archivo, por si la conexión es lenta. */
const PUT_MIN_TIMEOUT_MS = 120_000
/** Velocidad mínima asumida para calcular el tiempo límite: 25 KB/s. */
const MIN_BYTES_PER_SEC = 25 * 1024
/** Si la subida no avanza ni un byte en este tiempo, se corta y se reintenta. */
const STALL_MS = 60_000

class UploadError extends Error {
  retriable: boolean
  constructor(message: string, retriable: boolean) {
    super(message)
    this.name = "UploadError"
    this.retriable = retriable
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 4xx = culpa nuestra (no reintentar). Red, 408, 425, 429 y 5xx = reintentar. */
function statusIsRetriable(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

async function fetchJsonWithTimeout(
  url: string,
  body: unknown,
  ms: number,
): Promise<Record<string, unknown>> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
  } catch {
    // Abortado por tiempo límite o caída de red: siempre vale reintentar.
    throw new UploadError("El servidor no respondió", true)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    throw new UploadError(
      `El servidor respondió ${res.status}`,
      statusIsRetriable(res.status),
    )
  }
  return (await res.json()) as Record<string, unknown>
}

/**
 * PUT del binario con progreso real y corte por inactividad. Se usa XHR (y no
 * fetch) porque es la única forma de saber cuánto lleva subido: sin eso, una
 * conexión trabada es indistinguible de una lenta.
 */
function putFileWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let settled = false
    let stallTimer: ReturnType<typeof setTimeout> | null = null

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      if (stallTimer) clearTimeout(stallTimer)
      fn()
    }
    const armStall = () => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = setTimeout(() => {
        finish(() => {
          xhr.abort()
          reject(new UploadError("La conexión dejó de avanzar", true))
        })
      }, STALL_MS)
    }

    xhr.open("PUT", url, true)
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream")
    xhr.timeout = Math.max(
      PUT_MIN_TIMEOUT_MS,
      Math.ceil((file.size / MIN_BYTES_PER_SEC) * 1000),
    )
    xhr.upload.onprogress = (e) => {
      armStall()
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(88, Math.round((e.loaded / e.total) * 88)))
      }
    }
    xhr.onload = () =>
      finish(() => {
        if (xhr.status >= 200 && xhr.status < 300) resolve()
        else
          reject(
            new UploadError(
              `Almacenamiento respondió ${xhr.status}`,
              statusIsRetriable(xhr.status),
            ),
          )
      })
    xhr.onerror = () =>
      finish(() => reject(new UploadError("Fallo de red al subir", true)))
    xhr.ontimeout = () =>
      finish(() => reject(new UploadError("La subida tardó demasiado", true)))

    armStall()
    xhr.send(file)
  })
}

export function AssetUploader({ galleryId, studioId, targets }: AssetUploaderProps) {
  void studioId // el servidor lo resuelve de la sesión; se mantiene por compatibilidad

  const hasTargets = Array.isArray(targets) && targets.length > 0
  const [targetId, setTargetId] = useState<string | null>(
    hasTargets && targets!.length === 1 ? targets![0].id : null,
  )
  const activeTarget = hasTargets ? targets!.find((t) => t.id === targetId) ?? null : null

  // El estado por foto vive fuera de React: con 1.800 archivos, un setState por
  // cada cambio de progreso congelaba la pestaña.
  const filesRef = useRef<UploadFile[]>([])
  const queueRef = useRef<UploadFile[]>([])
  const runningRef = useRef(0)
  const dirtyRef = useRef(false)
  const [, setTick] = useState(0)
  const [isUploading, setIsUploading] = useState(false)

  const touch = () => {
    dirtyRef.current = true
  }

  // Refresco de pantalla a ritmo fijo mientras haya trabajo.
  useEffect(() => {
    if (!isUploading) return
    const id = setInterval(() => {
      if (dirtyRef.current) {
        dirtyRef.current = false
        setTick((t) => t + 1)
      }
    }, 200)
    return () => clearInterval(id)
  }, [isUploading])

  // Evita cerrar la pestaña por accidente a mitad de una subida.
  useEffect(() => {
    if (!isUploading) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [isUploading])

  // Mantiene la pantalla despierta: si el equipo suspende, la subida muere.
  useEffect(() => {
    if (!isUploading) return
    let lock: { release: () => Promise<void> } | null = null
    let cancelled = false
    const nav = navigator as Navigator & {
      wakeLock?: {
        request: (t: "screen") => Promise<{ release: () => Promise<void> }>
      }
    }
    nav.wakeLock
      ?.request("screen")
      .then((l) => {
        if (cancelled) void l.release()
        else lock = l
      })
      .catch(() => {
        /* el navegador puede negarlo; no es crítico */
      })
    return () => {
      cancelled = true
      void lock?.release().catch(() => {})
    }
  }, [isUploading])

  /**
   * Reintenta UN paso, no la foto entera. Es la diferencia entre recuperarse de
   * un corte y duplicar la foto: si se reintentara todo el proceso, un
   * "confirmar" que en realidad sí funcionó (pero cuya respuesta se perdió)
   * volvería a pasar por "preparar" y crearía una segunda copia en la galería.
   */
  const withRetry = async <T,>(
    item: UploadFile,
    label: string,
    step: () => Promise<T>,
  ): Promise<T> => {
    let lastError: unknown
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      item.attempt = attempt
      try {
        return await step()
      } catch (err) {
        lastError = err
        const retriable = err instanceof UploadError ? err.retriable : true
        if (!retriable || attempt === MAX_ATTEMPTS) break
        const message = err instanceof Error ? err.message : "Error desconocido"
        item.error = `${label}: ${message} · reintentando (${attempt}/${MAX_ATTEMPTS})`
        touch()
        // Espera creciente con algo de azar para no reintentar todos a la vez.
        await sleep(
          Math.min(20_000, 1_000 * 2 ** (attempt - 1)) + Math.random() * 500,
        )
      }
    }
    throw lastError
  }

  /** Sube una foto completa: preparar → PUT → confirmar. */
  const runOne = async (item: UploadFile) => {
    item.status = "uploading"
    item.progress = 0
    item.error = undefined
    touch()

    const prepare = async () => {
      const prep = await fetchJsonWithTimeout(
        "/api/galleries/upload/prepare",
        {
          galleryId,
          filename: item.file.name,
          mimeType: item.file.type,
          fileSize: item.file.size,
          setId: item.setId,
          deliveryTrack: item.deliveryTrack,
        },
        API_TIMEOUT_MS,
      )
      const assetId = String(prep.assetId ?? "")
      const signedUrl = String(prep.signedUrl ?? "")
      if (!assetId || !signedUrl) {
        throw new UploadError("El servidor no devolvió el destino", true)
      }
      return { assetId, signedUrl }
    }

    try {
      let { assetId, signedUrl } = await withRetry(item, "Preparando", prepare)

      // El PUT se reintenta contra la MISMA dirección (sobrescribe el mismo
      // archivo, nunca duplica). Solo si el permiso de subida caducó se pide
      // uno nuevo.
      try {
        await withRetry(item, "Subiendo", () =>
          putFileWithProgress(signedUrl, item.file, (pct) => {
            item.progress = pct
            touch()
          }),
        )
      } catch (err) {
        const expired =
          err instanceof UploadError &&
          /respondió (400|401|403)/.test(err.message)
        if (!expired) throw err
        const fresh = await withRetry(item, "Preparando de nuevo", prepare)
        assetId = fresh.assetId
        signedUrl = fresh.signedUrl
        await withRetry(item, "Subiendo", () =>
          putFileWithProgress(signedUrl, item.file, (pct) => {
            item.progress = pct
            touch()
          }),
        )
      }

      item.progress = 92
      touch()

      // Confirmar es idempotente (marca esa misma foto como "procesando"),
      // así que reintentarlo por su cuenta es seguro.
      await withRetry(item, "Confirmando", () =>
        fetchJsonWithTimeout(
          "/api/galleries/upload/confirm",
          { assetId, galleryId },
          API_TIMEOUT_MS,
        ),
      )

      item.status = "processing"
      item.progress = 100
      item.error = undefined
      touch()
    } catch (err) {
      item.status = "error"
      item.error = err instanceof Error ? err.message : "Error desconocido"
      touch()
    }
  }

  const finishRun = () => {
    setIsUploading(false)
    setTick((t) => t + 1)
    const all = filesRef.current
    const ok = all.filter(
      (f) => f.status === "processing" || f.status === "done",
    ).length
    const bad = all.filter((f) => f.status === "error").length
    if (bad === 0) {
      toast.success(`${ok} foto(s) subidas y procesándose`)
    } else {
      toast.error(
        `${bad} foto(s) no se pudieron subir. Usá "Reintentar las que fallaron".`,
      )
    }
  }

  /** Cola con trabajadores fijos: una foto lenta no frena a las demás. */
  const pump = useCallback(() => {
    while (runningRef.current < WORKERS && queueRef.current.length > 0) {
      const item = queueRef.current.shift()!
      runningRef.current += 1
      void runOne(item).finally(() => {
        runningRef.current -= 1
        if (queueRef.current.length > 0) pump()
        else if (runningRef.current === 0) finishRun()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId])

  const enqueue = (items: UploadFile[]) => {
    if (items.length === 0) return
    queueRef.current.push(...items)
    setIsUploading(true)
    setTick((t) => t + 1)
    pump()
  }

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejected: FileRejection[]) => {
      if (rejected.length > 0) {
        toast.error(
          `${rejected.length} archivo(s) no se aceptaron (formato no soportado o más de 50MB)`,
        )
      }
      // Si la galería requiere elegir carpeta destino y no hay ninguna seleccionada,
      // no permitimos el drop — los archivos quedarían sin clasificar.
      if (hasTargets && !activeTarget) {
        toast.error("Elegí primero a qué carpeta van las fotos")
        return
      }

      // Salta las que ya están en la galería. Así, si una subida se corta, se
      // vuelve a soltar la carpeta ENTERA y solo entran las que faltan.
      let toUpload = acceptedFiles
      try {
        const res = await fetch(`/api/galleries/${galleryId}/asset-names`)
        if (res.ok) {
          const { names } = (await res.json()) as { names?: string[] }
          const existing = new Set(names ?? [])
          // También evita repetidas dentro de esta misma tanda.
          const enCola = new Set(filesRef.current.map((f) => f.file.name))
          const filtered = acceptedFiles.filter(
            (f) => !existing.has(f.name) && !enCola.has(f.name),
          )
          const skipped = acceptedFiles.length - filtered.length
          if (skipped > 0) {
            toast.info(`${skipped} foto(s) ya estaban en la galería — se saltan`)
          }
          toUpload = filtered
        }
      } catch {
        // Si no se pudo consultar, se sube todo (comportamiento anterior).
      }
      if (toUpload.length === 0) {
        toast.success("La galería ya tiene todas esas fotos")
        return
      }

      const stamp = Date.now()
      const newFiles: UploadFile[] = toUpload.map((file, i) => ({
        id: `${file.name}-${stamp}-${i}`,
        file,
        status: "pending",
        progress: 0,
        attempt: 0,
        // La carpeta queda fijada al soltar: si la cambia a mitad de camino,
        // las fotos ya encoladas no se desvían.
        setId: activeTarget?.id ?? null,
        deliveryTrack: activeTarget?.deliveryTrack ?? null,
      }))
      filesRef.current = [...filesRef.current, ...newFiles]
      enqueue(newFiles)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [galleryId, hasTargets, activeTarget?.id],
  )

  const retryFailed = () => {
    const failed = filesRef.current.filter((f) => f.status === "error")
    if (failed.length === 0) return
    for (const f of failed) {
      f.status = "pending"
      f.progress = 0
      f.error = undefined
      f.attempt = 0
    }
    enqueue(failed)
  }

  const dropDisabled = hasTargets && !activeTarget
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: dropDisabled,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "image/heic": [".heic"],
    },
    multiple: true,
    maxSize: 50 * 1024 * 1024, // 50MB per file
  })

  const files = filesRef.current
  const done = files.filter(
    (f) => f.status === "done" || f.status === "processing",
  ).length
  const errors = files.filter((f) => f.status === "error").length
  const inFlight = files.filter((f) => f.status === "uploading").length

  return (
    <div className="space-y-3">
      {/* Selector de carpeta destino (sólo galerías de entrega final) */}
      {hasTargets && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            ¿A qué carpeta van estas fotos?
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {targets!.map((t) => {
              const selected = t.id === targetId
              const isSocial = t.deliveryTrack === "social"
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTargetId(t.id)}
                  disabled={isUploading}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                    selected
                      ? "border-brand bg-brand/5 ring-2 ring-brand/20"
                      : "border-border bg-background hover:border-border-strong"
                  }`}
                >
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                    {isSocial ? "📱" : "💎"} {t.name}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {isSocial
                      ? "Versiones ya comprimidas para Instagram/Facebook"
                      : "JPG full quality — para imprimir y archivar"}
                  </p>
                </button>
              )
            })}
          </div>
          {dropDisabled && (
            <p className="mt-2 text-[11.5px] text-amber-700 dark:text-amber-300">
              ↑ Seleccioná una carpeta para habilitar la subida.
            </p>
          )}
        </div>
      )}

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
          dropDisabled
            ? "cursor-not-allowed border-border bg-muted/40 opacity-50"
            : isDragActive
              ? "cursor-pointer border-blue-400 bg-brand-soft"
              : "cursor-pointer border-border bg-muted hover:border-border-strong hover:bg-muted"
        }`}
      >
        <input {...getInputProps()} />
        <Upload
          className={`h-8 w-8 mx-auto mb-3 ${isDragActive ? "text-brand" : "text-muted-foreground"}`}
        />
        <p className="text-sm font-medium text-foreground">
          {dropDisabled
            ? "Elegí una carpeta destino arriba"
            : isDragActive
              ? "Suelta las fotos aquí"
              : activeTarget
                ? `Subir a "${activeTarget.name}" — arrastrá o hacé click`
                : "Arrastra fotos o haz clic para seleccionar"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          JPG, PNG, WebP, HEIC · Máximo 50MB por foto · Subida múltiple permitida
        </p>
      </div>

      {/* Upload progress */}
      {files.length > 0 && (
        <div className="bg-card rounded-xl border border-border divide-y divide-gray-50">
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-foreground">
              {done}/{files.length} fotos
              {inFlight > 0 && (
                <span className="text-muted-foreground"> · {inFlight} subiendo</span>
              )}
              {errors > 0 && <span className="text-danger"> · {errors} con error</span>}
            </p>
            <div className="flex items-center gap-3">
              {errors > 0 && !isUploading && (
                <button
                  onClick={retryFailed}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  Reintentar las que fallaron
                </button>
              )}
              {!isUploading && (
                <button
                  onClick={() => {
                    filesRef.current = []
                    setTick((t) => t + 1)
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {isUploading && (
            <div className="px-4 py-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-brand transition-all"
                  style={{
                    width: `${Math.round(((done + errors) / files.length) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                No cierres esta pestaña. Si una foto falla, se reintenta sola.
              </p>
            </div>
          )}

          <div className="max-h-48 overflow-y-auto">
            {files.slice(-20).map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-shrink-0">
                  {f.status === "done" || f.status === "processing" ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  ) : f.status === "error" ? (
                    <AlertCircle className="h-4 w-4 text-danger" />
                  ) : f.status === "uploading" ? (
                    <Loader2 className="h-4 w-4 text-brand animate-spin" />
                  ) : (
                    <div className="h-4 w-4 border-2 border-border rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {f.file.name}
                  </p>
                  {f.status === "uploading" && (
                    <>
                      <div className="w-full bg-muted rounded-full h-1 mt-1">
                        <div
                          className="bg-brand h-1 rounded-full transition-all"
                          style={{ width: `${f.progress}%` }}
                        />
                      </div>
                      {f.error && (
                        <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                          {f.error}
                        </p>
                      )}
                    </>
                  )}
                  {f.status === "error" && (
                    <p className="text-xs text-danger">{f.error}</p>
                  )}
                  {f.status === "processing" && (
                    <p className="text-xs text-muted-foreground">Procesando variantes…</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {(f.file.size / 1024 / 1024).toFixed(1)}MB
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
