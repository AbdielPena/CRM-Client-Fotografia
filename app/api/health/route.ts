import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/server/supabase/server"

export async function GET() {
  try {
    const supabase = createSupabaseServerClient()
    // Ping liviano: leer una sola fila de una tabla pública con RLS
    const { error } = await supabase.from("studios").select("id").limit(1)
    if (error) throw error
    return NextResponse.json({
      status: "ok",
      db: "ok",
      timestamp: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json(
      { status: "error", db: "error", timestamp: new Date().toISOString() },
      { status: 503 },
    )
  }
}
