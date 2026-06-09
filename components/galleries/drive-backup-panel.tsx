"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  HardDriveUpload,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Link2,
} from "lucide-react"
import { toast } from "sonner"

import {
  uploadGalleryToDriveAction,
  getDriveBackupStatusAction,
} from "@/server/actions/gallery-drive.actions"
import type { DriveBackupStatus } from "@/lib/galleries/drive-types"
import { connectGoogleDriveAction } from "@/server/actions/google-drive-oauth.actions"

type DriveTrack = "social" | "high_quality" | "both"

const TRACK_LABELS: Record<DriveTrack, string> = {
  both: "Ambas pistas (Redes + Máxima calidad)",
  high_quality: "Solo Máxima calidad (originales)",
  social: "Solo Redes (optimizada)",
}

const ACTIVE = new Set(["pending", "running", "uploading"])

export function DriveBackupPanel({
  galleryId,
  connected,
  driveEmail,
  initialStatus,
}: {
  galleryId: string
  connected: boolean
  needsReconnect: boolean
  driveEmail: string | null
  initialStatus: DriveBackupStatus | null
}) {
  const [status, setStatus] = useState<DriveBackupStatus | null>(initialStatus)
  const [track, setTrack] = useState<DriveTrack>("both")
  const [pending, setPending] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isActive = !!status && ACTIVE.has(status.status)

  const poll = useCallback(async () => {
    const s = await getDriveBackupStatusAction(galleryId)
    setStatus(s)
    if (s && !ACTIVE.has(s.status) && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
      if (s.status === "completed") toast.success("Galería respaldada en Google Drive ✓")
      else if (s.status === "partial") toast.warning("Respaldo parcial: algunos archivos fallaron")
      else if (s.status === "failed") toast.error(s.lastError ?? "Falló el respaldo a Drive")
    }
  }, [galleryId])

  useEffect(() => {
    if (isActive && !pollRef.current) {
      pollRef.current = setInterval(poll, 3000)
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [isActive, poll])

  const start = async () => {
    setPending(true)
    try {
      const r = await uploadGalleryToDriveAction(galleryId, track)
      if (!r.ok) {
        toast.error(r.message ?? "No se pudo iniciar el respaldo")
        return
      }
      toast.info("Subiendo a Google Drive…")
      await poll()
    } finally {
      setPending(false)
    }
  }

  // Card base
  const card =
    "mt-4 rounded-xl border border-border bg-card p-5"

  if (!connected) {
    return (
      <div className={card}>
        <div className="mb-2 flex items-center gap-2">
          <HardDriveUpload className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-foreground">Entrega en Google Drive</h2>
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          Conecta una cuenta de Google Drive para subir las entregas. Puede ser{" "}
          <strong>distinta</strong> a la de tu Calendar (ideal: una con bastante almacenamiento).
        </p>
        <form action={connectGoogleDriveAction}>
          <button
            type="submit"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
          >
            <Link2 className="h-3.5 w-3.5" />
            Conectar Google Drive
          </button>
        </form>
      </div>
    )
  }

  const pct =
    status && status.totalAssets > 0
      ? Math.round((status.uploadedAssets / status.totalAssets) * 100)
      : 0

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HardDriveUpload className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-foreground">Entrega en Google Drive</h2>
        </div>
        {status?.status === "completed" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> Respaldada
          </span>
        )}
        {status?.status === "partial" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            <AlertCircle className="h-3 w-3" /> Parcial
          </span>
        )}
        {status?.status === "failed" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-600 dark:bg-red-500/15 dark:text-red-300">
            <AlertCircle className="h-3 w-3" /> Falló
          </span>
        )}
      </div>

      <p className="mb-3 text-[12px] text-muted-foreground">
        Sube las fotos de esta galería a tu Google Drive ({driveEmail}) en carpetas{" "}
        <code>{"/StudioFlow Entregas/{cliente}/{proyecto}/"}</code>, y comparte el link con el
        cliente. <strong>Máxima calidad</strong> = originales sin compresión; <strong>Redes</strong>{" "}
        = versión web optimizada.
      </p>

      {isActive ? (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
            Subiendo a Drive… {status ? `${status.uploadedAssets}/${status.totalAssets}` : ""}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={track}
            onChange={(e) => setTrack(e.target.value as DriveTrack)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-[12.5px] text-foreground focus:border-brand focus:outline-none"
          >
            {(Object.keys(TRACK_LABELS) as DriveTrack[]).map((t) => (
              <option key={t} value={t}>
                {TRACK_LABELS[t]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={start}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <HardDriveUpload className="h-3.5 w-3.5" />
            )}
            {status?.status === "completed" || status?.status === "partial" || status?.status === "failed"
              ? "Re-subir a Drive"
              : "Subir a Drive"}
          </button>
          {status?.webViewLink && (
            <a
              href={status.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] font-medium text-foreground transition-colors hover:border-border-strong"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir carpeta
            </a>
          )}
        </div>
      )}

      {status?.status === "failed" && status.lastError && (
        <p className="mt-2 text-[11.5px] text-red-600">{status.lastError}</p>
      )}
      {status?.webViewLink && status.sharedWithEmail && status.status === "completed" && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Compartida con <strong>{status.sharedWithEmail}</strong> (lector). Se le envió el link por
          correo.
        </p>
      )}
    </div>
  )
}
