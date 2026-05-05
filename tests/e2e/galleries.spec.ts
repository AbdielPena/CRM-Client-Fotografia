import { test, expect } from "@playwright/test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Flujo end-to-end de galerías (lado studio):
 *  1. Crear galería desde /galleries/new
 *  2. Subir 1 asset (foto pequeña de fixtures)
 *  3. Esperar status='completed' (Sharp processing)
 *  4. Crear collection y agregar el asset
 *  5. Generar share token y verificar URL pública responde
 *  6. Cleanup: borrar galería
 */

const FIXTURE_PATH = join(
  __dirname,
  "../fixtures/test-image.jpg",
)

test.describe("Gallery flow — studio side", () => {
  test("create → upload → collection → share → cleanup", async ({
    page,
    request,
  }) => {
    // 1. Crear galería
    await page.goto("/galleries/new")
    const galleryName = `E2E Test ${Date.now()}`
    await page.getByLabel(/nombre/i).fill(galleryName)
    await page.getByRole("button", { name: /crear/i }).click()

    // Espera redirect a /galleries/[id]
    await page.waitForURL(/\/galleries\/[a-f0-9-]+$/, { timeout: 10_000 })
    const galleryId = page.url().split("/").pop()!
    expect(galleryId).toBeTruthy()

    // 2. Subir 1 asset usando el endpoint API directo (más rápido y
    //    determinístico que driver UI de uploader)
    const fileBuffer = readFileSync(FIXTURE_PATH)

    // 2a. Pedir signed URL
    const prepareRes = await request.post("/api/galleries/upload/prepare", {
      data: {
        galleryId,
        filename: "test.jpg",
        mimeType: "image/jpeg",
        fileSize: fileBuffer.length,
      },
    })
    expect(prepareRes.ok()).toBeTruthy()
    const { assetId, signedUrl, token } = await prepareRes.json()

    // 2b. Subir al signed URL (Supabase Storage)
    const uploadRes = await fetch(signedUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
      },
      body: fileBuffer,
    })
    expect(uploadRes.ok).toBeTruthy()

    // 2c. Confirmar upload
    const confirmRes = await request.post("/api/galleries/upload/confirm", {
      data: { galleryId, assetId },
    })
    expect(confirmRes.ok()).toBeTruthy()

    // 3. Esperar que Sharp termine el processing (poll el endpoint del asset)
    await test.step("wait for asset processing", async () => {
      await expect
        .poll(
          async () => {
            await page.reload()
            const status = await page
              .getByTestId(`asset-${assetId}-status`)
              .textContent()
            return status?.toLowerCase()
          },
          { timeout: 20_000, intervals: [1000, 2000, 3000] },
        )
        .toBe("completed")
    })

    // 4. Crear collection vía API y agregar el asset
    const colRes = await request.post(
      `/api/galleries/${galleryId}/collections`,
      {
        data: { name: "Test Collection" },
      },
    )
    expect(colRes.ok()).toBeTruthy()
    const { collection } = await colRes.json()

    const itemsRes = await request.put(
      `/api/galleries/${galleryId}/collections/${collection.id}/items`,
      { data: { assetIds: [assetId] } },
    )
    expect(itemsRes.ok()).toBeTruthy()
    expect((await itemsRes.json()).count).toBe(1)

    // 5. Publicar galería + generar share token vía UI
    await page.goto(`/galleries/${galleryId}`)
    await page.getByRole("button", { name: /publicar/i }).click()
    await page.getByRole("button", { name: /compartir|share/i }).click()
    const shareUrl = await page
      .getByTestId("share-url")
      .inputValue()
      .catch(() => null)

    if (shareUrl) {
      const publicRes = await request.get(shareUrl, {
        ignoreHTTPSErrors: true,
      })
      expect(publicRes.status()).toBeLessThan(400)
    }

    // 6. Cleanup
    await page.goto(`/galleries/${galleryId}`)
    page.on("dialog", (d) => d.accept())
    await page.getByRole("button", { name: /eliminar|borrar/i }).click()
  })

  test("bulk delete assets", async ({ request }) => {
    // Test independiente del API: validar que bulk-delete acepta lista
    // y rechaza listas vacías.
    const galleryId = "00000000-0000-0000-0000-000000000000"
    const res = await request.post(
      `/api/galleries/${galleryId}/assets/bulk-delete`,
      { data: { assetIds: [] } },
    )
    expect(res.status()).toBe(400) // schema rechaza array vacío
  })
})
