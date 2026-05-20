import { test, expect } from "@playwright/test"

/**
 * Smoke tests del dashboard cross-módulo.
 *
 * Verifica que los widgets de módulos aparecen y los links navegan a las
 * páginas correctas. No verifica conteos exactos (varía por studio) pero sí
 * la presencia estructural.
 */

test.describe("Dashboard modules overview", () => {
  test("muestra las 4 cards de módulos", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page.getByText("Tus módulos")).toBeVisible()

    // 4 cards: CRM, Finanzas, Inventario, Correo
    await expect(page.getByRole("heading", { name: /CRM/, level: 3 })).toBeVisible()
    await expect(
      page.getByRole("heading", { name: /Finanzas/, level: 3 }),
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: /Inventario/, level: 3 }),
    ).toBeVisible()
    await expect(page.getByRole("heading", { name: /Correo/, level: 3 })).toBeVisible()
  })

  test("link de CRM navega a /clients", async ({ page }) => {
    await page.goto("/dashboard")
    await page.getByRole("link", { name: /Abrir CRM/i }).click()
    await page.waitForURL(/\/clients/, { timeout: 10_000 })
  })

  test("link de Inventario navega a /inventory", async ({ page }) => {
    await page.goto("/dashboard")
    await page.getByRole("link", { name: /Abrir Inventario/i }).click()
    await page.waitForURL(/\/inventory/, { timeout: 10_000 })
  })

  test("link de Finanzas navega a /finance", async ({ page }) => {
    await page.goto("/dashboard")
    await page.getByRole("link", { name: /Abrir Finanzas/i }).click()
    await page.waitForURL(/\/finance/, { timeout: 10_000 })
  })
})
