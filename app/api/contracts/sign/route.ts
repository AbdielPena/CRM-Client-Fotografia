import { NextRequest, NextResponse } from "next/server"
import { signContract } from "@/server/services/contract.service"

/**
 * Endpoint público de firma de contratos.
 * Captura evidencia legal: IP del firmante, user-agent y email cuando está
 * disponible. Todo se almacena en la fila `contracts` del Supabase.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const token: string | undefined = body?.token
    const signerName: string | undefined = body?.signerName
    const signerEmail: string | undefined = body?.signerEmail

    if (!token || !signerName?.trim()) {
      return NextResponse.json(
        { error: "Token y nombre son requeridos" },
        { status: 400 }
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
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al procesar la firma"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
