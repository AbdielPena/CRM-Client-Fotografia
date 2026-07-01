import { z } from "zod"

export const createGallerySchema = z.object({
  projectId: z.string().min(1, "Selecciona un proyecto"),
  name: z.string().min(2, "El nombre es requerido").max(150),
  description: z.string().max(1000).optional().or(z.literal("")),
  visibility: z.enum(["PRIVATE", "PASSWORD", "PUBLIC"]).default("PRIVATE"),
  passwordHash: z.string().max(100).optional().or(z.literal("")),
  downloadResolution: z.enum(["WEB", "HIGH", "ORIGINAL"]).default("HIGH"),
  allowDownload: z.boolean().default(true),
  allowProofing: z.boolean().default(false),
  expiresAt: z.string().optional().or(z.literal("")),
  watermarkEnabled: z.boolean().default(false),
})

export const updateGallerySchema = createGallerySchema.partial().omit({ projectId: true })

export type CreateGalleryInput = z.infer<typeof createGallerySchema>
export type UpdateGalleryInput = z.infer<typeof updateGallerySchema>

/**
 * Email opcional del cliente en las rutas PÚBLICAS de galería (favoritos, envío
 * de selección, ZIP, prints, listas). Es tolerante a propósito:
 *
 * - Cuando la galería NO exige email, el front usa el placeholder "anon@guest"
 *   (ver components/public/public-gallery-view.tsx). Ese valor NO pasa un
 *   `z.string().email()`, así que la validación estricta devolvía 422
 *   ("No se pudo guardar") al marcar un favorito o enviar la selección.
 * - Aquí normalizamos: cadena vacía, el placeholder anónimo, o cualquier cosa
 *   que no parezca un email → `undefined`. El servicio lo trata como anónimo
 *   (clave "anon@guest") y NO se captura como lead. Solo un email real se
 *   conserva.
 * - Bonus: rescata a clientes con bundle viejo en caché que aún envían
 *   "anon@guest" — la ruta ya no rompe sin necesidad de recargar.
 */
export const optionalClientEmail = z
  .string()
  .trim()
  .optional()
  .transform((v) => {
    if (!v) return undefined
    const lower = v.toLowerCase()
    if (lower === "anon@guest") return undefined
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower) ? lower : undefined
  })
