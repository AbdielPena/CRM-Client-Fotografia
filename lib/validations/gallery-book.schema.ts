import { z } from "zod"

/**
 * Config del "Luxury Book Experience" (Abby XV Gallery) por galería.
 * Aditivo: si enabled=false / displayMode='classic', la galería se ve como hoy.
 */
export const galleryBookConfigSchema = z.object({
  enabled: z.boolean().optional(),
  displayMode: z.enum(["classic", "book", "both"]).optional(),
  templateId: z
    .union([z.enum(["luxury_xv", "luxury_wedding"]), z.literal(""), z.null()])
    .optional(),
  coverImage: z
    .union([z.string().url("URL inválida"), z.literal(""), z.null()])
    .optional(),
  settings: z
    .object({
      title: z.string().max(120),
      subtitle: z.string().max(160),
      quinceaneraName: z.string().max(120),
      eventDate: z.string().max(60),
      accent: z.string().max(20),
      bgColor: z.string().max(20),
      font: z.string().max(40),
      showLogo: z.boolean(),
      // Fase 1: diseño de páginas del álbum (organización manual de fotos).
      pages: z
        .array(
          z.object({
            id: z.string().max(64),
            layout: z.enum(["single", "full", "duo", "trio", "collage", "magazine"]),
            assetIds: z.array(z.string().max(64)).max(4),
          }),
        )
        .max(400)
        .optional(),
    })
    .partial()
    .optional(),
})

export type GalleryBookConfigInput = z.infer<typeof galleryBookConfigSchema>
