const { spawn, exec } = require("child_process")
const http = require("http")
const path = require("path")

const PORT = 3000
const URL = `http://localhost:${PORT}`
const isDev = process.argv.includes("--dev")

// ─── Find Edge or Chrome ───────────────────────────────────────────────────────
function findBrowser() {
  const paths = [
    process.env["ProgramFiles(x86)"] + "\\Microsoft\\Edge\\Application\\msedge.exe",
    process.env["ProgramFiles"] + "\\Microsoft\\Edge\\Application\\msedge.exe",
    process.env.LOCALAPPDATA + "\\Microsoft\\Edge\\Application\\msedge.exe",
    process.env["ProgramFiles"] + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env["ProgramFiles(x86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
  ]
  const fs = require("fs")
  for (const p of paths) {
    if (p && fs.existsSync(p)) return p
  }
  return null
}

// ─── Kill process on port ──────────────────────────────────────────────────────
function killPort(port) {
  return new Promise((resolve) => {
    exec(`powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`, () => resolve())
  })
}

// ─── Wait for server ───────────────────────────────────────────────────────────
function waitForServer(url, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode < 500) resolve()
        else retry()
      }).on("error", retry)
    }
    const retry = () => {
      if (Date.now() - start > timeout) reject(new Error("Server timeout"))
      else setTimeout(check, 500)
    }
    check()
  })
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const projectDir = path.join(__dirname, "..")

  console.log("🚀 StudioFlow — starting...")

  // Kill any existing process on port
  await killPort(PORT)
  await new Promise((r) => setTimeout(r, 1000))

  // Start Next.js server
  const cmd = isDev ? "dev" : "start"
  console.log(`   Starting ${isDev ? "dev" : "production"} server on port ${PORT}...`)

  const server = spawn("npm", ["run", cmd], {
    cwd: projectDir,
    stdio: "pipe",
    shell: true,
  })

  server.stdout.on("data", (d) => {
    const msg = d.toString()
    if (msg.includes("Ready") || msg.includes("✓")) {
      process.stdout.write("   ✓ Server ready\n")
    }
  })

  server.stderr.on("data", (d) => {
    const msg = d.toString()
    if (!msg.includes("ExperimentalWarning")) process.stderr.write(msg)
  })

  server.on("error", (err) => {
    console.error("Failed to start server:", err.message)
    process.exit(1)
  })

  // Wait for server to be ready
  try {
    await waitForServer(URL)
  } catch {
    console.error("   ✗ Server did not start in time")
    server.kill()
    process.exit(1)
  }

  // Find and open browser in app mode
  const browser = findBrowser()
  if (!browser) {
    console.log(`   Open manually: ${URL}`)
    return
  }

  const browserName = browser.includes("Edge") ? "Edge" : "Chrome"
  console.log(`   Opening in ${browserName} app mode...`)
  console.log("")
  console.log("   ┌─────────────────────────────────────┐")
  console.log("   │  StudioFlow is running               │")
  console.log("   │  Press Ctrl+C here to stop           │")
  console.log("   └─────────────────────────────────────┘")
  console.log("")

  const app = spawn(browser, [
    `--app=${URL}/login`,
    "--new-window",
    "--window-size=1400,900",
    "--disable-extensions",
    "--disable-session-crashed-bubble",
    `--user-data-dir=${path.join(require("os").tmpdir(), "studioflow-app")}`,
  ], { detached: true, stdio: "ignore" })

  app.unref()

  // Handle shutdown
  const shutdown = () => {
    console.log("\n   Shutting down StudioFlow...")
    server.kill()
    process.exit(0)
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

main().catch((err) => {
  console.error("Error:", err.message)
  process.exit(1)
})
