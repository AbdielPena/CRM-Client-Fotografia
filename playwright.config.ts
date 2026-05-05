import { defineConfig, devices } from "@playwright/test"

/**
 * Configuración E2E para StudioFlow.
 *
 * Estrategia:
 *  - Tests apuntan a una instancia local (default localhost:3000) o a la
 *    URL definida en E2E_BASE_URL (staging / preview deploys de PR).
 *  - Auth: para tests autenticados se usa storageState pre-grabado por
 *    el setup project (`auth.setup.ts`) usando un usuario de test.
 *  - El run de CI debería ejecutar `npm run build && npm run start` antes
 *    de Playwright; localmente puede usarse `npm run dev`.
 *
 * Para correr:
 *   npm run test:e2e            (todos)
 *   npm run test:e2e:ui         (modo interactivo)
 *   npm run test:e2e -- gallery (solo tests que match "gallery")
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: process.env["CI"] ? 1 : undefined,
  reporter: process.env["CI"] ? [["github"], ["html"]] : "list",

  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "es-ES",
    timezoneId: "America/Santo_Domingo",
  },

  projects: [
    // Auth setup: hace login y guarda storage state
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/owner.json",
      },
      dependencies: ["setup"],
    },
    // Tests públicos (sin auth) — galería pública vía token
    {
      name: "public",
      testMatch: /.*\.public\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: process.env["E2E_BASE_URL"]
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env["CI"],
        timeout: 120_000,
      },
})
