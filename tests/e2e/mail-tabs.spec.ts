import { test, expect } from "@playwright/test"

/**
 * Smoke tests del módulo Mail (F6 V2) — bandejas Inbox/Sent/Drafts.
 *
 * No envía emails reales (no requiere Mailcow conectado) pero verifica que
 * las páginas cargan sin error y los tabs navegan correctamente.
 *
 * Si el studio no tiene cuenta Mailcow configurada, las páginas muestran
 * EmptyState con CTA a /settings/mail — los tests verifican ese fallback.
 */

test.describe("Mail bandejas", () => {
  test("tabs Inbox/Sent/Drafts navegan entre sí", async ({ page }) => {
    await page.goto("/mail/inbox")

    // El page renderiza algo (CTA setup o lista)
    const inboxHeader = page.getByRole("heading", {
      name: /Bandeja de entrada|Sin cuentas/,
    })
    await expect(inboxHeader).toBeVisible({ timeout: 10_000 })

    // Si hay setup pendiente, los tabs no aparecen (early return) — skip
    const tabsVisible = await page
      .getByRole("link", { name: /^Enviados$/i })
      .isVisible()
      .catch(() => false)
    test.skip(!tabsVisible, "No hay cuentas Mailcow configuradas — saltando")

    // Sent tab
    await page.getByRole("link", { name: /^Enviados$/i }).click()
    await page.waitForURL(/\/mail\/sent/, { timeout: 5_000 })
    await expect(
      page.getByRole("heading", { name: /Enviados/ }),
    ).toBeVisible()

    // Drafts tab
    await page.getByRole("link", { name: /^Borradores$/i }).click()
    await page.waitForURL(/\/mail\/drafts/, { timeout: 5_000 })
    await expect(
      page.getByRole("heading", { name: /Borradores/ }),
    ).toBeVisible()

    // Back to Inbox
    await page.getByRole("link", { name: /^Bandeja$/i }).click()
    await page.waitForURL(/\/mail\/inbox/, { timeout: 5_000 })
  })

  test("compose page renderiza form si hay cuenta", async ({ page }) => {
    await page.goto("/mail/compose")
    const visible = await page
      .getByRole("heading", { name: /Redactar/i })
      .isVisible()
      .catch(() => false)
    test.skip(!visible, "No hay cuentas Mailcow")

    await expect(page.getByLabel(/De|Account/i).first()).toBeVisible()
    await expect(page.getByLabel(/Para|To/i).first()).toBeVisible()
    await expect(page.getByLabel(/Asunto|Subject/i).first()).toBeVisible()
  })
})
