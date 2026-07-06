'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { Loader2, Upload, X } from 'lucide-react'

/**
 * Redimensiona la imagen en el navegador y la devuelve como data URL (JPEG),
 * para guardarla en `form_responses.data` sin necesidad de un bucket ni de un
 * endpoint público de subida. Pensado para el cuestionario público /f/[token].
 */
async function fileToDataUrl(file: File, maxDim = 1000, quality = 0.82): Promise<string> {
  const readerUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('read'))
    reader.readAsDataURL(file)
  })
  return new Promise<string>((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas'))
      // Fondo blanco por si la imagen tiene transparencia (JPEG no la soporta).
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error('img'))
    img.src = readerUrl
  })
}

export function ImageUploadInput({
  value,
  onChange,
  accept = 'image/*',
}: {
  value: string
  onChange: (v: string) => void
  accept?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErr('El archivo debe ser una imagen')
      return
    }
    setErr(null)
    setBusy(true)
    try {
      onChange(await fileToDataUrl(file))
    } catch {
      setErr('No se pudo procesar la imagen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Vista previa"
            className="max-h-56 w-auto rounded-lg border border-border object-contain"
          />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"
            aria-label="Quitar imagen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {value ? 'Cambiar imagen' : 'Subir imagen'}
      </button>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <input ref={inputRef} type="file" accept={accept} hidden onChange={onPick} />
    </div>
  )
}
