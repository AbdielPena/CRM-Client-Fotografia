import { test, expect } from "@playwright/test"

/**
 * Tests del flujo público de galería (/g/[token]) — sin auth.
 *
 * Requiere E2E_PUBLIC_TOKEN apuntando a una galería publicada con
 * al menos 1 asset y allow_download=true.
 *
 * Si no está, los tests se skipean.
 */

const TOKEN = process.env["E2E_PUBLIC_TOKEN"]

test.skip(!TOKEN, "E2E_PUBLIC_TOKEN no configurado")

test.describe("Public gallery view", () => {
  test("renders gallery and shows assets", async ({ page }) => {
    await page.goto(`/g/${TOKEN}`)

    // Si requiere password, el test no aplica (skip explícito)
    const passwordGate = await page
      .getByRole("textbox", { name: /contraseña|password/i })
      .count()
    test.skip(passwordGate > 0, "Galería con password — usa otro token")

    // Header con nombre de galería
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()

    // Al menos 1 thumbnail visible
    await expect(page.locator("img").first()).toBeVisible({ timeout: 10_000 })
  })

  test("opens lightbox on thumbnail click", async ({ page }) => {
    await page.goto(`/g/${TOKEN}`)

    const passwordGate = await page
      .getByRole("textbox", { name: /contraseña|password/i })
      .count()
    test.skip(passwordGate > 0, "Galería con password")

    const firstThumb = page.locator("button:has(img)").first()
    await firstThumb.click()

    // El lightbox debe mostrar contador "1 / N"
    await expect(page.getByText(/^\d+\s*\/\s*\d+$/)).toBeVisible()

    // Cerrar con Escape
    await page.keyboard.press("Escape")
  })

  test("favorite toggle is reachable via API", async ({ request }) => {
    const res = await request.post(`/api/galleries/public/${TOKEN}/favorite`, {
      data: { assetId: "00000000-0000-0000-0000-000000000000" },
    })
    // Asset inválido → 400 (no 500). Valida que el endpoint vive.
    expect([400, 404]).toContain(res.status())
  })
})
