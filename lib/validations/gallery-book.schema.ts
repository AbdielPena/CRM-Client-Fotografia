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
      // Fase 2: portada premium (modelo + tipografía + estilo del nombre + ajustes).
      cover: z
        .object({
          model: z
            .enum([
              "editorial", "fine_art", "minimal", "royal", "princess",
              "elegant", "modern", "classic", "floral", "fashion",
            ])
            .optional(),
          font: z
            .enum([
              "cormorant", "playfair", "bodoni", "garamond", "italiana",
              "tenor", "montserrat", "josefin", "pinyon", "greatvibes",
            ])
            .optional(),
          nameStyle: z
            .enum([
              "gold", "foil", "white", "engraved", "embossed",
              "shadow", "spaced", "editorial", "script",
            ])
            .optional(),
          textPosition: z.enum(["top", "center", "bottom"]).optional(),
          textScale: z.number().min(0.5).max(2).optional(),
          letterSpacing: z.number().min(0).max(0.6).optional(),
          margin: z.number().min(0).max(30).optional(),
          overlay: z.number().min(0).max(1).optional(),
          shadow: z.boolean().optional(),
          phrase: z.string().max(200).optional(),
        })
        .optional(),
      // Música de fondo del álbum (opcional). El estudio pega una URL a un
      // MP3/audio público; el flipbook la reproduce con un botón play/pausa.
      music: z
        .object({
          url: z
            .union([z.string().url("URL inválida"), z.literal(""), z.null()])
            .optional(),
          autoplay: z.boolean().optional(),
          volume: z.number().min(0).max(1).optional(),
        })
        .optional(),
    })
    .partial()
    .optional(),
})

export type GalleryBookConfigInput = z.infer<typeof galleryBookConfigSchema>
