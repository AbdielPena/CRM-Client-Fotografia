/**
 * Instrucciones para el cliente en la pantalla de selección de impresiones.
 * Texto pensado para una clienta no técnica (mamá / quinceañera, RD). Se muestra
 * de forma DINÁMICA según lo que incluye el plan (marcos / portada / impresiones
 * manuales o automáticas). Copia elegida por panel de jueces.
 */

export const PRINT_INSTRUCTIONS = {
  intro:
    "Estas son tus fotos ya editadas, listas para imprimir. Aquí eliges tú misma tus favoritas para cada tipo de impresión que trae tu plan. Tranquila, es bien sencillo y te vamos llevando pasito a paso 💛",
  steps: [
    "Toca una de las categorías de arriba para empezar (los botones con nombres, como “Marco 12x18” o “Portada de álbum”).",
    "Fíjate cuántas fotos te pide esa categoría y toca tus favoritas; cada foto que elijas se marca con un check. Si cambias de idea, tócala otra vez y se quita.",
    "Cuando la tengas lista, toca “Enviar selección de impresión” y nos llega enseguida.",
    "Haz lo mismo con cada categoría que te aparezca, hasta terminarlas todas.",
  ],
  frameHint:
    "Para tu marco eliges 1 sola foto, la que más te enamore. Si tu plan trae varios marcos, escoges una para cada uno con toda calma.",
  coverHint:
    "Esta será la foto de la portada de tu álbum, la primera que se ve al abrirlo. Elige solo 1, tu preferida.",
  printManualHint:
    "Aquí eliges tú misma {n} fotos para imprimir en tamaño {size}. Ve tocando tus favoritas hasta llegar a {n} y quedas lista.",
  printAutoHint:
    "Aquí no tienes que elegir nada: imprimimos todas tus fotos entregadas en tamaño {size}. Ya te quedan listas.",
  submitHint:
    "Al enviar, nos llega tu selección y empezamos a preparar tus impresiones. Si después cambias de idea, no hay problema: vuelve a entrar, ajusta las fotos y toca enviar de nuevo.",
} as const

export type PrintHintCategory = {
  type: "album_cover" | "frame" | "print"
  spec: string | null
  allowed: number
  mode: "manual" | "auto"
}

const fill = (tpl: string, vars: Record<string, string>): string =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "")

/** ¿El cliente tiene algo que ELEGIR (marco / portada / impresión manual)? */
export function hasSelectableCategories(cats: PrintHintCategory[]): boolean {
  return cats.some((c) => !(c.type === "print" && c.mode === "auto"))
}

/** Pistas específicas según las categorías del plan (en orden de lectura). */
export function buildPrintHints(cats: PrintHintCategory[]): string[] {
  const hints: string[] = []
  if (cats.some((c) => c.type === "album_cover")) hints.push(PRINT_INSTRUCTIONS.coverHint)
  if (cats.some((c) => c.type === "frame")) hints.push(PRINT_INSTRUCTIONS.frameHint)
  for (const c of cats) {
    if (c.type === "print" && c.mode === "manual") {
      hints.push(
        fill(PRINT_INSTRUCTIONS.printManualHint, {
          n: String(c.allowed),
          size: c.spec ?? "",
        }),
      )
    }
  }
  for (const c of cats) {
    if (c.type === "print" && c.mode === "auto") {
      hints.push(fill(PRINT_INSTRUCTIONS.printAutoHint, { size: c.spec ?? "" }))
    }
  }
  return hints
}
