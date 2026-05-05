// /api/deploy/finalize
//
// Deploy atómico desde GitHub Actions:
//   1. El workflow sube el build nuevo a .next.staging/ (NO toca .next/)
//   2. La app sigue corriendo con .next/ vieja durante toda la subida
//   3. Cuando termina el FTP, llama a este endpoint
//   4. El endpoint:
//      a. Valida Bearer token (DEPLOY_HOOK_TOKEN)
//      b. chmod -R 755 sobre .next.staging/ (ya somos owner como sjjxfogj)
//      c. Renombra .next -> .next.old y .next.staging -> .next (atómico)
//      d. Borra .next.old en background
//      e. Toca tmp/restart.txt para que Phusion reinicie
//
// Esto evita el problema de ownership/permisos de la cuenta FTP virtual
// porque el chmod lo ejecuta el user del proceso Node (sjjxfogj), que
// es owner real de los archivos en disco.

import { NextResponse } from "next/server"
import { promises as fs } from "node:fs"
import path from "node:path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const procEnv = process["env"] as Record<string, string | undefined>

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

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
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
  const nextStaging = path.join(projectRoot, ".next.staging")
  const nextOld = path.join(projectRoot, ".next.old")

  // 1. Validar que existe staging
  if (!(await pathExists(nextStaging))) {
    return NextResponse.json(
      {
        error:
          "no existe .next.staging — el FTP no terminó o subió a la ruta equivocada",
      },
      { status: 400 },
    )
  }

  // 2. chmod recursivo en staging (ahora corremos como sjjxfogj, owner real)
  try {
    await chmodRecursive(nextStaging)
  } catch (err) {
    return NextResponse.json(
      {
        error: "chmod falló sobre .next.staging",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  // 3. Switch atómico: .next -> .next.old, .next.staging -> .next
  try {
    // Si quedó un .next.old de un deploy anterior fallido, borrarlo primero
    if (await pathExists(nextOld)) {
      await fs.rm(nextOld, { recursive: true, force: true })
    }
    if (await pathExists(nextDir)) {
      await fs.rename(nextDir, nextOld)
    }
    await fs.rename(nextStaging, nextDir)
  } catch (err) {
    return NextResponse.json(
      {
        error: "swap atómico falló",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  // 4. Toca tmp/restart.txt para que Phusion reinicie
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

  // 5. Borrar .next.old en background (no bloqueamos la response)
  void fs.rm(nextOld, { recursive: true, force: true }).catch(() => {})

  return NextResponse.json({
    status: "ok",
    swap: "done",
    chmod: "done",
    restart: "scheduled",
    timestamp: new Date().toISOString(),
  })
}
