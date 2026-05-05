"use client"

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
} from "react"
import { Eraser, RotateCcw } from "lucide-react"

export type SignaturePadHandle = {
  /** Devuelve dataURL PNG de la firma o null si está vacía. */
  getDataUrl: () => string | null
  isEmpty: () => boolean
  clear: () => void
}

type Point = { x: number; y: number }

export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { className?: string; onChange?: (empty: boolean) => void }
>(function SignaturePad({ className, onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<Point | null>(null)
  const hasStrokeRef = useRef(false)
  const [empty, setEmpty] = useState(true)

  // Setup canvas con pixel ratio para nitidez en mobile
  const setup = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#0f172a"
    // Re-pintar fondo blanco (canvas transparente por default) para que el PNG
    // exportado se vea bien sobre cualquier background. Se omite si querés
    // transparencia — descomentar las dos líneas siguientes lo deja transparente.
    // ctx.fillStyle = '#ffffff'
    // ctx.fillRect(0, 0, rect.width, rect.height)
  }, [])

  useEffect(() => {
    setup()
    const onResize = () => setup()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [setup])

  const getPoint = (e: PointerEvent | React.PointerEvent): Point => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const start = (e: React.PointerEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    drawingRef.current = true
    lastPointRef.current = getPoint(e)
    hasStrokeRef.current = true
    if (empty) {
      setEmpty(false)
      onChange?.(false)
    }
  }

  const move = (e: React.PointerEvent) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const next = getPoint(e)
    const last = lastPointRef.current ?? next

    // Suavizado simple con curva cuadrática
    const midX = (last.x + next.x) / 2
    const midY = (last.y + next.y) / 2
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.quadraticCurveTo(last.x, last.y, midX, midY)
    ctx.stroke()
    lastPointRef.current = next
  }

  const end = (e: React.PointerEvent) => {
    if (!drawingRef.current) return
    e.preventDefault()
    drawingRef.current = false
    lastPointRef.current = null
  }

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasStrokeRef.current = false
    setEmpty(true)
    onChange?.(true)
  }, [onChange])

  useImperativeHandle(
    ref,
    () => ({
      getDataUrl: () => {
        if (!hasStrokeRef.current) return null
        const canvas = canvasRef.current
        if (!canvas) return null
        return canvas.toDataURL("image/png")
      },
      isEmpty: () => !hasStrokeRef.current,
      clear,
    }),
    [clear],
  )

  return (
    <div className={className}>
      <div className="relative rounded-xl border-2 border-dashed border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          className="block h-44 w-full touch-none"
          style={{ touchAction: "none" }}
        />
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
            Firmá acá con el dedo o el mouse
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between gap-2">
        <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400">
          Tu firma se guarda como imagen junto con la fecha, hora e IP.
        </p>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          <Eraser className="h-3 w-3" />
          Limpiar
        </button>
      </div>
    </div>
  )
})
