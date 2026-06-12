/**
 * Render de PREVISUALIZACIÓN de contratos (cliente-safe, sin server-only).
 *
 * Reemplaza los {{placeholders}} con valores de EJEMPLO para que el usuario vea
 * cómo quedará el contrato mientras edita la plantilla. No se guarda nada; los
 * valores reales se inyectan al generar el contrato del proyecto.
 */

function sampleVars(): Record<string, string> {
  const today = new Intl.DateTimeFormat("es", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date())
  return {
    // Cliente
    cliente_nombre: "María Pérez",
    client_name: "María Pérez",
    nombre_firmante: "María Pérez",
    signed_name: "María Pérez",
    cliente_direccion: "Calle Principal #10, Santo Domingo",
    client_address: "Calle Principal #10, Santo Domingo",
    cliente_email: "maria@correo.com",
    client_email: "maria@correo.com",
    cliente_telefono: "809-555-1234",
    client_phone: "809-555-1234",
    cliente_ciudad: "Santo Domingo",
    cliente_pais: "RD",
    // Estudio
    estudio_nombre: "AbbyPixel",
    studio_name: "AbbyPixel",
    estudio_email: "soporte@abbypixel.com",
    estudio_telefono: "809-251-1729",
    estudio_direccion: "Calle Rafael Ramos #32",
    // Plan / paquete
    paquete_nombre: "Plan Luxury XV",
    package_name: "Plan Luxury XV",
    paquete_precio: "25,000.00",
    package_price: "DOP 25,000.00",
    // Montos
    precio_total: "DOP 25,000.00",
    total_price: "DOP 25,000.00",
    valor_total: "DOP 25,000.00",
    anticipo: "DOP 12,500.00",
    deposit_amount: "DOP 12,500.00",
    monto_anticipo: "DOP 12,500.00",
    saldo_reserva: "DOP 12,500.00",
    balance_amount: "DOP 12,500.00",
    monto_restante: "DOP 12,500.00",
    saldo_pendiente: "DOP 12,500.00",
    remaining_balance: "DOP 12,500.00",
    monto_pagado: "DOP 0.00",
    amount_paid: "DOP 0.00",
    moneda: "DOP",
    currency: "DOP",
    // Evento
    evento_tipo: "Quinceañera",
    event_type: "Quinceañera",
    evento_fecha: "15 de agosto de 2026",
    event_date: "15 de agosto de 2026",
    evento_hora: "04:00 p. m.",
    evento_locacion: "Jardín Botánico",
    evento_lugar: "Jardín Botánico",
    event_location: "Jardín Botánico",
    proyecto_nombre: "Quinceañera de María",
    project_name: "Quinceañera de María",
    // Fechas
    hoy: today,
    fecha: today,
    fecha_contrato: today,
    contract_date: today,
    today,
    firma_cliente: today,
    signed_at: today,
  }
}

function signatureBox(label: string): string {
  return `<div style="margin:14px 0;padding:22px 16px;border:1px dashed #d4d4d8;border-radius:10px;text-align:center;color:#a1a1aa;font-size:13px">✍️ ${label} — pendiente de firma</div>`
}

/** Sustituye placeholders por valores de ejemplo y las firmas por cajas "pendiente". */
export function renderContractPreview(body: string): string {
  const vars = sampleVars()
  let html = body
    .replace(/\{\{\s*signature_client\s*\}\}/g, signatureBox("Firma del cliente"))
    .replace(/\{\{\s*signature_image\s*\}\}/g, signatureBox("Firma del cliente"))
    .replace(/\{\{\s*signature_studio\s*\}\}/g, signatureBox("Firma del estudio"))
  html = html.replace(
    /\{\{\s*([\w-]+)(?:\s*\|\s*([^}]+))?\s*\}\}/g,
    (_m, key: string, fb?: string) => {
      if (vars[key] !== undefined) return vars[key]
      if (fb) return fb.trim()
      return `[${key}]`
    },
  )
  return html
}
