// server.js — Entry point para cPanel Node.js Selector
//
// cPanel necesita un archivo .js como "Application startup file".
// Este wrapper arranca Next.js en producción usando el $PORT que
// le asigna cPanel automáticamente.
//
// Equivalente a `next start -p $PORT`.

const { createServer } = require("http")
const next = require("next")

const env = process["env"]
const port = parseInt(env["PORT"] || "3000", 10)
const hostname = env["HOST"] || "0.0.0.0"
const dev = env["NODE_ENV"] !== "production"

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app
  .prepare()
  .then(() => {
    createServer((req, res) => {
      handle(req, res).catch((err) => {
        console.error("Request handler error:", err)
        res.statusCode = 500
        res.end("Internal Server Error")
      })
    }).listen(port, hostname, (err) => {
      if (err) {
        console.error("Failed to start server:", err)
        process.exit(1)
      }
      console.log(`> StudioFlow ready on http://${hostname}:${port}`)
    })
  })
  .catch((err) => {
    console.error("Failed to prepare Next.js app:", err)
    process.exit(1)
  })
