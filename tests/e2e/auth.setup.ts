import { test as setup, expect } from "@playwright/test"

const AUTH_FILE = ".auth/owner.json"

/**
 * Login con cuenta de test antes de todos los specs autenticados.
 * Requiere E2E_TEST_EMAIL y E2E_TEST_PASSWORD en el entorno.
 *
 * Si no están configuradas, el setup hace skip — los tests autenticados
 * fallarán pero los públicos seguirán corriendo.
 */
setup("authenticate as studio owner", async ({ page }) => {
  const email = process.env["E2E_TEST_EMAIL"]
  const password = process.env["E2E_TEST_PASSWORD"]
  setup.skip(!email || !password, "E2E_TEST_EMAIL/PASSWORD no configuradas")

  await page.goto("/login")
  await page.getByLabel(/email/i).fill(email!)
  await page.getByLabel(/contraseña|password/i).fill(password!)
  await page.getByRole("button", { name: /iniciar|entrar|sign in/i }).click()

  // Espera el dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 })
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()

  await page.context().storageState({ path: AUTH_FILE })
})
