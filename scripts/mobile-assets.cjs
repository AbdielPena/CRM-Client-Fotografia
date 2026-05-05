// Genera los assets fuente para Capacitor (icon + splash) desde el SVG
// del PWA. Output: resources/{icon,icon-only,icon-foreground,splash,splash-dark}.png
//
// Uso: npm run mobile:assets
//
// Después: `npx cap-assets generate` (con @capacitor/assets) propaga
// estos masters a las múltiples densidades requeridas por Android/iOS.

const sharp = require("sharp")
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
const SVG = fs.readFileSync(path.join(ROOT, "public/icons/icon.svg"))
const OUT = path.join(ROOT, "resources")

const BG = { r: 13, g: 14, b: 20, alpha: 1 } // brand dark

async function main() {
  fs.mkdirSync(OUT, { recursive: true })

  const centerLogo = await sharp(SVG, { density: 1024 })
    .resize(700, 700)
    .png()
    .toBuffer()

  await Promise.all([
    sharp(SVG, { density: 2048 })
      .resize(1024, 1024)
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, "icon.png")),

    sharp(SVG, { density: 2048 })
      .resize(1024, 1024)
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, "icon-only.png")),

    sharp(SVG, { density: 2048 })
      .resize(1024, 1024)
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, "icon-foreground.png")),

    sharp({
      create: { width: 2732, height: 2732, channels: 4, background: BG },
    })
      .composite([{ input: centerLogo, gravity: "center" }])
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, "splash.png")),

    sharp({
      create: { width: 2732, height: 2732, channels: 4, background: BG },
    })
      .composite([{ input: centerLogo, gravity: "center" }])
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, "splash-dark.png")),
  ])

  console.log("✓ Assets generados en", OUT)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
