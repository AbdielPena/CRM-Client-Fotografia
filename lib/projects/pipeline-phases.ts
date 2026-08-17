/**
 * Bloques del pipeline: agrupan las columnas por PROCESO.
 *
 * El tablero tenía 10 columnas seguidas y todas pesaban igual, así que no se
 * veía dónde termina un proceso y empieza el siguiente. Aquí se agrupan en los
 * bloques con los que el estudio piensa su trabajo:
 *
 *   Reserva · Enviar selección · Edición · Galería final · Enviar impresiones
 *
 * Se agrupa por `auto_intent` y NO por el nombre de la columna, porque el
 * nombre lo puede cambiar el estudio cuando quiera y el bloque se rompería.
 * Una columna sin intent conocido cae en un bloque final para que no
 * desaparezca nunca del tablero.
 */

export interface PipelinePhase {
  id: string
  label: string
  /** Qué pasa en este bloque, en una línea. */
  hint: string
  /** Color de la cinta del bloque. */
  color: string
  intents: string[]
}

export const PIPELINE_PHASES: PipelinePhase[] = [
  {
    id: "reserva",
    label: "Reserva",
    hint: "Desde que escriben hasta que la fecha queda bloqueada",
    color: "#8b7bd8",
    intents: ["consulta", "pendiente_pago", "reservado"],
  },
  {
    id: "seleccion",
    label: "Enviar selección",
    hint: "La sesión ya pasó: le toca elegir sus fotos",
    color: "#4a9fd8",
    intents: ["sesion_realizada", "esperando_seleccion"],
  },
  {
    id: "edicion",
    label: "Edición",
    hint: "Retoque foto por foto",
    color: "#d8a44a",
    intents: ["edicion"],
  },
  {
    id: "entrega",
    label: "Galería final",
    hint: "Entregada al cliente",
    color: "#3fae7a",
    intents: ["entregado"],
  },
  {
    id: "impresion",
    label: "Enviar impresiones",
    hint: "Producción y entrega de lo impreso",
    color: "#d87b6b",
    intents: ["impresion_produccion", "impresion_enviada"],
  },
]

/** Bloque de las columnas que el estudio creó a mano (sin intent). */
export const PHASE_OTROS: PipelinePhase = {
  id: "otros",
  label: "Otros estados",
  hint: "Columnas propias del estudio",
  color: "#8a8a8a",
  intents: [],
}

export function phaseOf(autoIntent: string | null | undefined): PipelinePhase {
  if (autoIntent) {
    const f = PIPELINE_PHASES.find((p) => p.intents.includes(autoIntent))
    if (f) return f
  }
  return PHASE_OTROS
}

/**
 * Reparte las columnas en bloques, respetando el orden en que vienen (que ya es
 * el `position` del estudio). Un bloque sin columnas no se dibuja.
 */
export function groupIntoPhases<T extends { auto_intent?: string | null }>(
  columnas: T[],
): Array<{ phase: PipelinePhase; columns: T[] }> {
  const porFase = new Map<string, T[]>()
  for (const c of columnas) {
    const f = phaseOf(c.auto_intent)
    const lista = porFase.get(f.id) ?? []
    lista.push(c)
    porFase.set(f.id, lista)
  }
  const out: Array<{ phase: PipelinePhase; columns: T[] }> = []
  for (const f of [...PIPELINE_PHASES, PHASE_OTROS]) {
    const cols = porFase.get(f.id)
    if (cols && cols.length > 0) out.push({ phase: f, columns: cols })
  }
  return out
}
