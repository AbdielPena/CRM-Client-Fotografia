import { NextRequest, NextResponse } from "next/server"
import { signContract, markContractViewed } from "@/server/services/contract.service"
import {
  rateLimit,
  rateLimitResponse,
  getClientIp,
} from "@/lib/utils/rate-limit"

/**
 * Endpoint público de firma de contratos.
 * - POST: persiste la firma con evidencia legal (IP, user-agent, hash)
 * - PUT:  marca el contrato como "visto" cuando el cliente abre la página
 *
 * Rate limit: 10 firmas / 5 min por IP. Marca de viewed: 60 / min por IP.
 */
export async function POST(req: NextRequest) {
  // Rate limit: 10 attempts per IP en 5 min — protege contra brute-force de tokens
  const ipForLimit = getClientIp(req)
  const limitCheck = rateLimit({
    key: `contract-sign:${ipForLimit}`,
    max: 10,
    windowMs: 5 * 60_000,
  })
  if (limitCheck.blocked) return rateLimitResponse(limitCheck)

  try {
    const body = await req.json()
    const token: string | undefined = body?.token
    const signerName: string | undefined = body?.signerName
    const signerEmail: string | undefined = body?.signerEmail
    const signatureImageDataUrl: string | undefined = body?.signatureImageDataUrl

    if (!token || !signerName?.trim()) {
      return NextResponse.json(
        { error: "Token y nombre son requeridos" },
        { status: 400 },
      )
    }

    // Defensa adicional: limitar tamaño del DataURL de la firma (DoS prevention).
    // Una firma normal es ~10-100KB; cap en 2MB es muy generoso.
    if (signatureImageDataUrl && signatureImageDataUrl.length > 2_000_000) {
      return NextResponse.json(
        { error: "La firma es demasiado grande (max 2MB)" },
        { status: 413 },
      )
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      undefined

    const userAgent = req.headers.get("user-agent") ?? undefined

    await signContract(
      token,
      signerName.trim(),
      signerEmail?.trim() || undefined,
      ip,
      userAgent,
      signatureImageDataUrl,
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al procesar la firma"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get("token")
    if (!token) {
      return NextResponse.json({ error: "Token requerido" }, { status: 400 })
    }
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      undefined
    const userAgent = req.headers.get("user-agent") ?? undefined
    await markContractViewed(token, ip, userAgent)
    return NextResponse.json({ ok: true })
  } catch {
    // Best-effort, no fallar visible al cliente
    return NextResponse.json({ ok: true })
  }
}
