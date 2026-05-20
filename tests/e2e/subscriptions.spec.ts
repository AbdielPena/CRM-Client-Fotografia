import { test, expect } from "@playwright/test"

/**
 * Smoke flow del módulo Finance / Suscripciones (F5 V2).
 *
 * Flow:
 *   1. Navega a /finance/subscriptions
 *   2. Click "Nueva suscripción"
 *   3. Llena form: nombre + monto + frecuencia + proxima_fecha
 *   4. Submit → redirect a detalle
 *   5. Pausar → check state
 *   6. Vuelve a la lista, verifica que está en "Todas (incluye pausadas)"
 */

test.describe("Finance subscriptions", () => {
  test("crear y pausar una suscripción", async ({ page }) => {
    await page.goto("/finance/subscriptions")
    await expect(
      page.getByRole("heading", { name: /Suscripciones/ }),
    ).toBeVisible()

    // Click "Nueva suscripción"
    await page
      .getByRole("link", { name: /Nueva suscripción|Primera suscripción/i })
      .first()
      .click()
    await page.waitForURL(/\/finance\/subscriptions\/new/, {
      timeout: 10_000,
    })

    // Llenar form
    const subName = `Adobe CC E2E ${Date.now()}`
    await page.getByLabel(/Nombre/i).first().fill(subName)
    await page.getByLabel(/^Monto/i).fill("1899.00")

    // Frecuencia: mensual (default)
    await page.locator('select[name="frecuencia"]').selectOption("mensual")

    // Próxima fecha: hoy
    const today = new Date().toISOString().slice(0, 10)
    await page.locator('input[name="proximaFecha"]').fill(today)

    // Submit
    await page.getByRole("button", { name: /Crear suscripción/i }).click()
    await page.waitForURL(/\/finance\/subscriptions\/[a-f0-9-]+/, {
      timeout: 15_000,
    })

    // Verificar presencia en detalle
    await expect(page.getByText(subName).first()).toBeVisible()
    await expect(page.getByText(/Activa · próximo cobro/)).toBeVisible()

    // Pausar (con confirm dialog)
    page.once("dialog", (d) => void d.accept())
    await page.getByRole("button", { name: /Pausar suscripción/i }).click()

    // Esperar que aparezca el state pausada
    await expect(page.getByText(/Pausada/)).toBeVisible({ timeout: 5_000 })

    // Volver a la lista en modo "Todas"
    await page.goto("/finance/subscriptions?active=all")
    await expect(page.getByText(subName).first()).toBeVisible()
  })
})
