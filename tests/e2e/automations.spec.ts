import { test, expect } from "@playwright/test"

/**
 * Smoke + flow básico del módulo de Automatizaciones.
 *
 * Flow:
 *   1. Navega a /automations
 *   2. Si vacío, click "Crear primera regla"
 *   3. Llena form: trigger=client.created + action=send_notification
 *   4. Verifica redirect a /automations/[id]
 *   5. Verifica que la rule aparece en /automations list
 *   6. Toggle pause → check state
 *   7. Delete → verifica redirect a /automations sin la rule
 */

test.describe("Automations CRUD", () => {
  test("crear regla, pausarla y eliminarla", async ({ page }) => {
    await page.goto("/automations")
    await expect(page.getByRole("heading", { name: /Automatizaciones/ })).toBeVisible()

    // Click "Nueva regla" o "Crear primera regla"
    const nuevaBtn = page
      .getByRole("link", { name: /Nueva regla|Crear primera regla/i })
      .first()
    await nuevaBtn.click()
    await page.waitForURL(/\/automations\/new/, { timeout: 10_000 })

    // Llenar form
    const testName = `E2E test ${Date.now()}`
    await page.getByLabel(/Nombre/i).first().fill(testName)
    await page
      .getByLabel(/Descripción/i)
      .first()
      .fill("Regla de prueba auto-creada por test e2e")

    // Trigger: client.created (default puede ser otro — forzamos)
    await page.locator('select[name="triggerEvent"]').selectOption("client.created")

    // Action: send_notification (default)
    await page
      .locator('select[name="actionKind"]')
      .selectOption("send_notification")

    // Submit
    await page.getByRole("button", { name: /Crear regla/i }).click()
    await page.waitForURL(/\/automations\/[a-f0-9-]+/, { timeout: 15_000 })

    // Verificar que aparece el nombre + status banner activo
    await expect(page.getByText(testName).first()).toBeVisible()
    await expect(page.getByText(/Activa · escuchando eventos/)).toBeVisible()

    // Toggle pause
    await page.getByRole("button", { name: /Pausar regla/i }).click()
    await expect(page.getByText(/Pausada/)).toBeVisible({ timeout: 5_000 })

    // Eliminar (acepta el confirm)
    page.once("dialog", (d) => void d.accept())
    await page.getByRole("button", { name: /Eliminar/i }).click()
    await page.waitForURL(/\/automations(\?|$)/, { timeout: 10_000 })

    // Verificar que la rule ya no aparece
    await expect(page.getByText(testName)).toHaveCount(0)
  })
})
