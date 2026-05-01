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

interface AssetUploaderProps {
  galleryId: string
  studioId: string
}

export function AssetUploader({ galleryId, studioId }: AssetUploaderProps) {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isUploading, setIsUploading] = useState(false)

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
        }),
      })

      if (!prepRes.ok) throw new Error("Error preparando la subida")
      const { assetId, uploadUrl } = await prepRes.json()

      // Step 2: Upload directly to S3
      const uploadRes = await fetch(uploadUrl, {
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
    [galleryId]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
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
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          isDragActive
            ? "border-blue-400 bg-blue-50"
            : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className={`h-8 w-8 mx-auto mb-3 ${isDragActive ? "text-blue-500" : "text-gray-400"}`} />
        <p className="text-sm font-medium text-gray-700">
          {isDragActive ? "Suelta las fotos aquí" : "Arrastra fotos o haz clic para seleccionar"}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          JPG, PNG, WebP, HEIC · Máximo 50MB por foto · Subida múltiple permitida
        </p>
      </div>

      {/* Upload progress */}
      {files.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
          <div className="px-4 py-3 flex items-center justify-between">
            <p className="text-xs font-medium text-gray-700">
              {done}/{files.length} fotos · {errors > 0 && <span className="text-red-500">{errors} errores</span>}
            </p>
            {!isUploading && (
              <button
                onClick={() => setFiles([])}
                className="text-xs text-gray-400 hover:text-gray-600"
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
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  ) : f.status === "uploading" ? (
                    <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                  ) : (
                    <div className="h-4 w-4 border-2 border-gray-200 rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">{f.file.name}</p>
                  {f.status === "uploading" && (
                    <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                      <div
                        className="bg-blue-500 h-1 rounded-full transition-all"
                        style={{ width: `${f.progress}%` }}
                      />
                    </div>
                  )}
                  {f.status === "error" && (
                    <p className="text-xs text-red-500">{f.error}</p>
                  )}
                  {f.status === "processing" && (
                    <p className="text-xs text-gray-400">Procesando variantes…</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
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
