"use client"

import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { Upload, X, CheckCircle, Loader2, AlertCircle } from "lucide-react"
import { toast } from "sonner"

interface UploadFile {
  id: string
  file: File
  status: "pending" | "uploading" | "processing" | "done" | "error"
  progress: number
  error?: string
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

export function AssetUploader({ galleryId, studioId, targets }: AssetUploaderProps) {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const hasTargets = Array.isArray(targets) && targets.length > 0
  const [targetId, setTargetId] = useState<string | null>(
    hasTargets && targets!.length === 1 ? targets![0].id : null,
  )
  const activeTarget = hasTargets ? targets!.find((t) => t.id === targetId) ?? null : null

  const updateFile = (id: string, updates: Partial<UploadFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)))
  }

  const uploadFile = async (uploadFile: UploadFile) => {
    try {
      updateFile(uploadFile.id, { status: "uploading", progress: 0 })

      // Step 1: Get presigned upload URL
      const prepRes = await fetch("/api/galleries/upload/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          galleryId,
          filename: uploadFile.file.name,
          mimeType: uploadFile.file.type,
          fileSize: uploadFile.file.size,
          setId: activeTarget?.id ?? null,
          deliveryTrack: activeTarget?.deliveryTrack ?? null,
        }),
      })

      if (!prepRes.ok) throw new Error("Error preparando la subida")
      const { assetId, signedUrl } = await prepRes.json()

      // Step 2: Upload directly to storage (Supabase signed URL o /api/local-direct
      // según STORAGE_DRIVER en el server).
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        body: uploadFile.file,
        headers: { "Content-Type": uploadFile.file.type },
      })

      if (!uploadRes.ok) throw new Error("Error subiendo el archivo")
      updateFile(uploadFile.id, { progress: 90 })

      // Step 3: Confirm upload → triggers processing
      const confirmRes = await fetch("/api/galleries/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, galleryId }),
      })

      if (!confirmRes.ok) throw new Error("Error confirmando la subida")

      updateFile(uploadFile.id, { status: "processing", progress: 100 })
    } catch (err) {
      updateFile(uploadFile.id, {
        status: "error",
        error: err instanceof Error ? err.message : "Error desconocido",
      })
    }
  }

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      // Si la galería requiere elegir carpeta destino y no hay ninguna seleccionada,
      // no permitimos el drop — los archivos quedarían sin clasificar.
      if (hasTargets && !activeTarget) {
        toast.error("Elegí primero a qué carpeta van las fotos")
        return
      }
      const newFiles: UploadFile[] = acceptedFiles.map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        status: "pending",
        progress: 0,
      }))

      setFiles((prev) => [...prev, ...newFiles])
      setIsUploading(true)

      // Upload concurrently in batches of 3
      const BATCH = 3
      for (let i = 0; i < newFiles.length; i += BATCH) {
        const batch = newFiles.slice(i, i + BATCH)
        await Promise.all(batch.map(uploadFile))
      }

      setIsUploading(false)
      const errors = newFiles.filter((f) => f.status === "error").length
      if (errors === 0) {
        toast.success(`${newFiles.length} foto(s) subidas y procesándose`)
      } else {
        toast.error(`${errors} foto(s) fallaron`)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [galleryId, hasTargets, activeTarget?.id],
  )

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

  const done = files.filter((f) => f.status === "done" || f.status === "processing").length
  const errors = files.filter((f) => f.status === "error").length

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
        <Upload className={`h-8 w-8 mx-auto mb-3 ${isDragActive ? "text-brand" : "text-muted-foreground"}`} />
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
          <div className="px-4 py-3 flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">
              {done}/{files.length} fotos · {errors > 0 && <span className="text-danger">{errors} errores</span>}
            </p>
            {!isUploading && (
              <button
                onClick={() => setFiles([])}
                className="text-xs text-muted-foreground hover:text-muted-foreground"
              >
                Limpiar
              </button>
            )}
          </div>

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
                  <p className="text-xs font-medium text-foreground truncate">{f.file.name}</p>
                  {f.status === "uploading" && (
                    <div className="w-full bg-muted rounded-full h-1 mt-1">
                      <div
                        className="bg-brand h-1 rounded-full transition-all"
                        style={{ width: `${f.progress}%` }}
                      />
                    </div>
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
