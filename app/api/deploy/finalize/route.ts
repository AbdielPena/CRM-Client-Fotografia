// /api/deploy/finalize
//
// Endpoint que GitHub Actions invoca después de subir los archivos via FTP
// para arreglar permisos y disparar el restart de Phusion Passenger.
//
// FTP plain no tiene chmod nativo y las carpetas pueden quedar con
// permisos 644 (sin execute), lo que rompe Next.js con EACCES al intentar
// hacer scandir de subcarpetas de .next/.
//
// Este endpoint:
//   1. Valida un Bearer token (DEPLOY_HOOK_TOKEN)
//   2. Recursivamente setea 755 a directorios y 644 a archivos en .next/
//   3. Toca tmp/restart.txt para reiniciar la app
//
// Lo invoca el último step del workflow deploy-web.yml con un POST
// autenticado por Bearer.

import { NextResponse } from "next/server"
import { promises as fs } from "node:fs"
import path from "node:path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const procEnv = process["env"] as Record<string, string | undefined>

// Setea permisos 755 a directorios y 644 a archivos, recursivo.
async function chmodRecursive(target: string): Promise<void> {
  const stat = await fs.stat(target)
  if (stat.isDirectory()) {
    await fs.chmod(target, 0o755)
    const entries = await fs.readdir(target)
    for (const entry of entries) {
      await chmodRecursive(path.join(target, entry))
    }
  } else {
    await fs.chmod(target, 0o644)
  }
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? ""
  const expectedToken = procEnv["DEPLOY_HOOK_TOKEN"]

  if (!expectedToken) {
    return NextResponse.json(
      { error: "DEPLOY_HOOK_TOKEN no configurado en el server" },
      { status: 500 },
    )
  }

  const providedToken = authHeader.replace(/^Bearer\s+/i, "").trim()
  if (providedToken !== expectedToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const projectRoot = process.cwd()
  const nextDir = path.join(projectRoot, ".next")

  try {
    await chmodRecursive(nextDir)
  } catch (err) {
    return NextResponse.json(
      {
        error: "chmod falló",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  const tmpDir = path.join(projectRoot, "tmp")
  const restartFile = path.join(tmpDir, "restart.txt")

  try {
    await fs.mkdir(tmpDir, { recursive: true })
    await fs.writeFile(restartFile, new Date().toISOString() + "\n")
  } catch (err) {
    return NextResponse.json(
      {
        error: "no se pudo tocar tmp/restart.txt",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    status: "ok",
    chmod: "done",
    restart: "scheduled",
    timestamp: new Date().toISOString(),
  })
}
