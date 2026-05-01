import { NextResponse } from "next/server"

const disabled = () =>
  NextResponse.json(
    { error: "La funcionalidad de galerías está deshabilitada temporalmente." },
    { status: 410 },
  )

export const GET = disabled
export const POST = disabled
export const PUT = disabled
export const PATCH = disabled
export const DELETE = disabled
