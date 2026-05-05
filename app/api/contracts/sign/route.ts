import { NextRequest, NextResponse } from "next/server"
import { signContract, markContractViewed } from "@/server/services/contract.service"

/**
 * Endpoint público de firma de contratos.
 * - POST: persiste la firma con evidencia legal (IP, user-agent, hash)
 * - PUT:  marca el contrato como "visto" cuando el cliente abre la página
 */
export async function POST(req: NextRequest) {
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
