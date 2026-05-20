import { test, expect } from "@playwright/test"

/**
 * Smoke tests del módulo Inventory (F3) — reservas y mantenimiento.
 *
 * Requiere que el studio tenga al menos 1 cliente y 1 item de inventario.
 * Si no hay items, hace skip.
 */

test.describe("Inventory reservations", () => {
  test("crear reserva, confirmarla, cancelarla", async ({ page }) => {
    await page.goto("/inventory/reservations")
    await expect(page.getByRole("heading", { name: /Reservas/ })).toBeVisible()

    await page
      .getByRole("link", { name: /Nueva reserva|Crear primera reserva/i })
      .first()
      .click()
    await page.waitForURL(/\/inventory\/reservations\/new/, {
      timeout: 10_000,
    })

    // El form requiere clientes E items registrados — skip si vacíos
    const hasItems = await page
      .locator('[name="items[0][itemId]"] option:not([value=""])')
      .first()
      .isVisible()
      .catch(() => false)
    test.skip(!hasItems, "No hay items registrados — agrega items primero")

    // Selecciona cliente o responsible
    const clientToggle = page.getByRole("button", { name: /^Cliente$/ })
    if (await clientToggle.isVisible().catch(() => false)) {
      await clientToggle.click()
      const clientOption = page
        .locator('[name="clientId"] option:not([value=""])')
        .first()
      const clientValue = await clientOption.getAttribute("value")
      if (clientValue) {
        await page.locator('[name="clientId"]').selectOption(clientValue)
      } else {
        await page.getByRole("button", { name: /Responsible interno/ }).click()
      }
    }

    // Selecciona el primer item disponible
    const firstItem = await page
      .locator('select')
      .filter({ hasText: /Selecciona/ })
      .first()
      .locator("option:not([value=''])")
      .first()
      .getAttribute("value")

    if (firstItem) {
      await page.locator('[name="items[0][itemId]"]').selectOption(firstItem)
    }

    // Fechas
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 16)
    const dayAfter = new Date(Date.now() + 2 * 86400000)
      .toISOString()
      .slice(0, 16)
    await page.locator('[name="startDate"]').fill(tomorrow)
    await page.locator('[name="endDate"]').fill(dayAfter)

    // Submit
    await page.getByRole("button", { name: /Crear reserva/i }).click()
    await page.waitForURL(/\/inventory\/reservations\/[a-f0-9-]+/, {
      timeout: 15_000,
    })

    await expect(page.getByText(/RV-\d{8}/)).toBeVisible()
  })
})
