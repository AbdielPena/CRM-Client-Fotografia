/**
 * Capa WhatsApp — Fase 1 (gratis, sin API). Genera enlaces wa.me con mensajes
 * predeterminados ya escritos, en formato de número dominicano. La "Fase 2"
 * (Cloud API: auto-envío + bot con botones) reusará estas mismas plantillas.
 */

/** Normaliza un teléfono a dígitos con código de país RD (1) para wa.me. */
export function formatDoPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = raw.replace(/\D/g, "")
  if (d.length === 0) return null
  // Quita 00 internacional
  if (d.startsWith("00")) d = d.slice(2)
  // Local RD de 10 dígitos (809/829/849…) → anteponer 1
  if (d.length === 10) return "1" + d
  // Ya con código país RD
  if (d.length === 11 && d.startsWith("1")) return d
  // Otro formato internacional ya válido
  return d
}

/** Construye el enlace wa.me con el mensaje pre-cargado. */
export function waLink(phone: string | null | undefined, message: string): string | null {
  const p = formatDoPhone(phone)
  if (!p) return null
  return `https://wa.me/${p}?text=${encodeURIComponent(message)}`
}

export interface WaVars {
  clienteNombre?: string | null
  estudioNombre?: string | null
  fecha?: string | null
  hora?: string | null
  lugar?: string | null
  monto?: string | null
  saldo?: string | null
  factura?: string | null
  link?: string | null
}

export interface WaTemplate {
  key: string
  label: string
  /** vars que DEBEN existir (no vacías) para que la plantilla aplique. */
  needs: (keyof WaVars)[]
  build: (v: WaVars) => string
}

const nombre = (v: WaVars) => (v.clienteNombre || "").split(" ")[0] || "Hola"

export const WA_TEMPLATES: WaTemplate[] = [
  {
    key: "recordar_reserva",
    label: "Recordar reserva (apartar fecha)",
    needs: [],
    build: (v) =>
      `¡Hola ${nombre(v)}! 👋 Para apartar oficialmente tu fecha${v.fecha ? ` del ${v.fecha}` : ""}, ` +
      `necesitamos el pago de la reserva${v.monto ? ` (${v.monto})` : ""}. ` +
      `Cuando lo hagas, avísame por aquí 🙌. ¡Gracias!`,
  },
  {
    key: "recordar_pago",
    label: "Recordar pago pendiente",
    needs: [],
    build: (v) =>
      `¡Hola ${nombre(v)}! 👋 Te recuerdo el pago pendiente${v.factura ? ` de la factura ${v.factura}` : ""}` +
      `${v.saldo ? ` (saldo: ${v.saldo})` : ""}.${v.link ? ` Puedes verla aquí: ${v.link}` : ""} ¡Gracias! 🙏`,
  },
  {
    key: "recordar_balance",
    label: "Recordar balance antes del evento",
    needs: [],
    build: (v) =>
      `¡Hola ${nombre(v)}! 👋 Tu sesión${v.fecha ? ` del ${v.fecha}` : ""} está cerca. ` +
      `Te recuerdo el balance pendiente${v.saldo ? ` (${v.saldo})` : ""} antes del evento. ¡Gracias! 🙌`,
  },
  {
    key: "recordar_sesion",
    label: "Recordar sesión próxima",
    needs: ["fecha"],
    build: (v) =>
      `¡Hola ${nombre(v)}! 📸 Te recuerdo tu sesión el ${v.fecha}` +
      `${v.hora ? ` a las ${v.hora}` : ""}${v.lugar ? ` en ${v.lugar}` : ""}. ` +
      `¡Nos vemos! Cualquier duda, por aquí estoy 😊`,
  },
  {
    key: "contrato_pendiente",
    label: "Contrato pendiente de firma",
    needs: ["link"],
    build: (v) =>
      `¡Hola ${nombre(v)}! 👋 Te falta firmar el contrato de tu sesión. ` +
      `Aquí el enlace (toma 2 min): ${v.link} ¡Gracias! ✍️`,
  },
  {
    key: "formulario_pendiente",
    label: "Formulario pendiente",
    needs: ["link"],
    build: (v) =>
      `¡Hola ${nombre(v)}! 📝 Para preparar tu sesión, completa este formulario rápido: ${v.link} ¡Gracias!`,
  },
  {
    key: "galeria_seleccion",
    label: "Pedir selección de la galería",
    needs: ["link"],
    build: (v) =>
      `¡Hola ${nombre(v)}! ✨ Tu galería está lista. Envíame tu selección de fotos aquí: ${v.link} ¡Gracias!`,
  },
  {
    key: "entrega_lista",
    label: "Avisar entrega lista",
    needs: [],
    build: (v) =>
      `¡Hola ${nombre(v)}! 🎉 ¡Tus fotos ya están listas!${v.link ? ` Aquí tu galería: ${v.link}` : ""} ` +
      `Espero que te encanten 💛`,
  },
  {
    key: "pedir_resena",
    label: "Pedir reseña",
    needs: [],
    build: (v) =>
      `¡Hola ${nombre(v)}! 😊 Espero que hayas amado tus fotos. ` +
      `¿Me ayudarías con una reseña? Significa muchísimo para mí 🙏${v.link ? ` ${v.link}` : ""}`,
  },
  {
    key: "bienvenida",
    label: "Bienvenida tras reservar",
    needs: [],
    build: (v) =>
      `¡Hola ${nombre(v)}! 🎉 Gracias por reservar${v.estudioNombre ? ` con ${v.estudioNombre}` : ""}. ` +
      `Te iré guiando en cada paso. Cualquier duda, por aquí estoy 😊`,
  },
  {
    key: "aniversario",
    label: "Aniversario (re-booking)",
    needs: [],
    build: (v) =>
      `¡Hola ${nombre(v)}! 🎉 Hace un año hicimos tu sesión. ` +
      `¿Te animas a una nueva este año? Tengo fechas disponibles 📸`,
  },
]

export function templatesFor(vars: WaVars): WaTemplate[] {
  const has = (k: keyof WaVars) => {
    const val = vars[k]
    return typeof val === "string" && val.trim().length > 0
  }
  return WA_TEMPLATES.filter((t) => t.needs.every(has))
}
