/**
 * Catálogo del módulo /status — config estática derivada de la estructura real
 * de PixelOS. Define los MÓDULOS a monitorear, los WORKFLOWS críticos con su
 * checklist de validación, y la lista de SONDAS de la auditoría automática.
 *
 * El estado mutable (checkboxes, notas, errores, pruebas) vive en DB
 * (status.service). Esto es solo el catálogo.
 */

export type ModuleGroup =
  | "Principal"
  | "CRM"
  | "Documentos"
  | "Módulos"
  | "Integraciones"
  | "Infraestructura"

export interface StatusModule {
  key: string
  label: string
  group: ModuleGroup
  route: string | null
  /** key de la sonda de auditoría que determina su salud (opcional). */
  probe?: string
}

export interface ChecklistItem {
  key: string
  label: string
}

export interface StatusWorkflow {
  key: string
  name: string
  description: string
  modules: string[]
  checklist: ChecklistItem[]
}

// ───────────────────────────── MÓDULOS ─────────────────────────────
export const STATUS_MODULES: StatusModule[] = [
  { key: "dashboard", label: "Dashboard", group: "Principal", route: "/dashboard" },
  { key: "bookings", label: "Solicitudes (Booking)", group: "Principal", route: "/bookings", probe: "bookings" },
  { key: "tasks", label: "Tareas", group: "Principal", route: "/tasks" },
  { key: "chat", label: "Chat interno", group: "Principal", route: "/chat" },

  { key: "clients", label: "Clientes", group: "CRM", route: "/clients", probe: "clients" },
  { key: "projects", label: "Proyectos", group: "CRM", route: "/projects", probe: "projects" },
  { key: "calendar", label: "Calendario", group: "CRM", route: "/calendar" },
  { key: "deliveries", label: "Próximas entregas", group: "CRM", route: "/deliveries", probe: "deliveries" },
  { key: "galleries", label: "Galerías", group: "CRM", route: "/galleries" },

  { key: "contracts", label: "Contratos", group: "Documentos", route: "/contracts", probe: "contracts" },
  { key: "forms", label: "Formularios", group: "Documentos", route: "/settings/forms", probe: "forms" },
  { key: "invoices", label: "Facturación", group: "Documentos", route: "/invoices", probe: "invoices" },
  { key: "packages", label: "Paquetes", group: "Documentos", route: "/settings/packages" },

  { key: "finance", label: "Finanzas", group: "Módulos", route: "/finance/transactions" },
  { key: "inventory", label: "Inventario", group: "Módulos", route: "/inventory/items" },
  { key: "mail", label: "Correo", group: "Módulos", route: "/mail/inbox", probe: "mail" },
  { key: "automations", label: "Automatizaciones", group: "Módulos", route: "/automations" },
  { key: "reports", label: "Reportes", group: "Módulos", route: "/reports" },
  { key: "fiscal", label: "Fiscal RD (NCF/ITBIS)", group: "Módulos", route: "/settings/fiscal", probe: "fiscal" },
  { key: "trash", label: "Papelera", group: "Módulos", route: "/trash" },

  { key: "google_calendar", label: "Google Calendar", group: "Integraciones", route: "/settings/integrations/google", probe: "google_calendar" },
  { key: "webhooks", label: "Webhooks salientes", group: "Integraciones", route: "/settings/webhooks" },
  { key: "api", label: "API y tokens", group: "Integraciones", route: "/settings/api", probe: "api" },
  { key: "stripe", label: "Pagos online (Stripe)", group: "Integraciones", route: "/settings/billing", probe: "stripe" },

  { key: "auth", label: "Autenticación", group: "Infraestructura", route: null, probe: "auth" },
  { key: "database", label: "Base de datos", group: "Infraestructura", route: null, probe: "database" },
  { key: "storage", label: "Almacenamiento", group: "Infraestructura", route: null, probe: "storage" },
  { key: "cron", label: "Tareas programadas (cron)", group: "Infraestructura", route: null, probe: "cron" },
]

// ───────────────────────────── WORKFLOWS ───────────────────────────
export const STATUS_WORKFLOWS: StatusWorkflow[] = [
  {
    key: "registro_cuenta",
    name: "Registro de cuenta + Studio",
    description: "Un fotógrafo se registra y se crea su studio (bootstrap).",
    modules: ["auth", "database"],
    checklist: [
      { key: "registro", label: "Registro de usuario completado" },
      { key: "studio_creado", label: "Studio creado (bootstrap_studio)" },
      { key: "miembro_owner", label: "Usuario quedó como owner del studio" },
      { key: "redirect_dashboard", label: "Redirige al dashboard tras setup" },
    ],
  },
  {
    key: "login_2fa",
    name: "Login / 2FA",
    description: "Inicio de sesión, sesión persistente y 2FA opcional.",
    modules: ["auth"],
    checklist: [
      { key: "login_ok", label: "Login con email/password funciona" },
      { key: "sesion", label: "Sesión persiste entre recargas" },
      { key: "2fa", label: "2FA se puede activar y exige código" },
      { key: "logout", label: "Cerrar sesión funciona" },
    ],
  },
  {
    key: "solicitud_booking",
    name: "Solicitud de booking (cliente)",
    description: "El cliente abre el link público del paquete y envía la solicitud.",
    modules: ["bookings", "packages"],
    checklist: [
      { key: "link_publico", label: "Link público del paquete abre (/p/...)" },
      { key: "form_solicitud", label: "Formulario de solicitud se envía" },
      { key: "estado_pending", label: "Solicitud queda en 'pendiente de revisión'" },
      { key: "notif_studio", label: "Studio recibe notificación de la solicitud" },
    ],
  },
  {
    key: "aprobacion_booking",
    name: "Aprobación del booking",
    description: "Admin aprueba → crea cliente, proyecto, contrato y formulario.",
    modules: ["bookings", "clients", "projects", "contracts", "forms"],
    checklist: [
      { key: "cliente_creado", label: "Cliente creado correctamente" },
      { key: "proyecto_creado", label: "Proyecto creado correctamente" },
      { key: "contrato_paquete", label: "Contrato del paquete asignado (no genérico)" },
      { key: "form_paquete", label: "Formulario del paquete asignado" },
      { key: "form_ligado_proyecto", label: "Formulario ligado al proyecto (project_id)" },
      { key: "link_confirmacion", label: "Se genera el link de confirmación al cliente" },
    ],
  },
  {
    key: "wizard_cliente",
    name: "Wizard del cliente (/b/token)",
    description: "El cliente recorre plan → formulario → contrato → pago en un solo diálogo.",
    modules: ["bookings", "forms", "contracts", "invoices"],
    checklist: [
      { key: "paso_plan", label: "Muestra info del plan seleccionado" },
      { key: "paso_form", label: "Muestra y recibe el formulario" },
      { key: "paso_contrato", label: "Muestra el contrato con datos llenos (placeholders)" },
      { key: "firma", label: "El cliente firma el contrato" },
      { key: "paso_pago", label: "Muestra instrucciones de pago y notifica" },
      { key: "sin_refresh", label: "Todo el flujo sin recargar la página" },
    ],
  },
  {
    key: "formulario",
    name: "Formulario (envío y respuestas)",
    description: "El cliente llena el formulario y las respuestas quedan en el proyecto.",
    modules: ["forms", "projects"],
    checklist: [
      { key: "form_enviado", label: "Formulario enviado al cliente" },
      { key: "form_recibido", label: "Formulario recibido/completado" },
      { key: "respuestas_proyecto", label: "Respuestas visibles en el proyecto" },
      { key: "cumple_mapeado", label: "Fecha de cumpleaños mapeada al proyecto" },
    ],
  },
  {
    key: "contrato",
    name: "Contrato (envío y firma)",
    description: "Generación del contrato del paquete, firma y registro en el proyecto.",
    modules: ["contracts", "projects"],
    checklist: [
      { key: "contrato_generado", label: "Contrato generado desde el template del paquete" },
      { key: "placeholders", label: "Placeholders del contrato se llenan (estudio, cliente, fecha…)" },
      { key: "contrato_enviado", label: "Contrato enviado al cliente" },
      { key: "contrato_firmado", label: "Contrato firmado por el cliente" },
      { key: "firma_proyecto", label: "Firma + fechas visibles en el proyecto" },
    ],
  },
  {
    key: "factura",
    name: "Facturación",
    description: "Una factura con plan de 2 cuotas (reserva 50% + balance), editable.",
    modules: ["invoices", "fiscal"],
    checklist: [
      { key: "factura_generada", label: "Factura generada al firmar (1 registro)" },
      { key: "plan_cuotas", label: "Muestra plan de 2 cuotas (reserva + balance)" },
      { key: "editable", label: "Factura editable por el admin" },
      { key: "notif_cliente", label: "Cliente recibe cambios de la factura" },
      { key: "ncf", label: "NCF/ITBIS se asigna si aplica" },
    ],
  },
  {
    key: "pago",
    name: "Pagos y confirmación",
    description: "Registro de reserva + balance en la misma factura; confirma la sesión.",
    modules: ["invoices", "bookings", "calendar"],
    checklist: [
      { key: "pago_reserva", label: "Pago de reserva (50%) registrado → parcial" },
      { key: "pago_balance", label: "Pago de balance registrado → pagada" },
      { key: "sesion_confirmada", label: "Booking pasa a 'confirmado' al pagar" },
      { key: "notif_pago", label: "Cliente recibe confirmación del pago" },
    ],
  },
  {
    key: "entregas",
    name: "Sistema de entregas inteligente",
    description: "Calcula fecha de entrega, prioridad/riesgo y genera recordatorios.",
    modules: ["deliveries", "projects", "calendar"],
    checklist: [
      { key: "delivery_days", label: "Plan tiene 'tiempo de entrega' configurado" },
      { key: "entrega_creada", label: "Entrega creada al confirmar el pago" },
      { key: "fecha_estimada", label: "Fecha estimada calculada (sesión + días)" },
      { key: "prioridad_riesgo", label: "Prioridad y riesgo de retraso correctos" },
      { key: "recordatorio_cumple", label: "Recordatorio 2 días antes del cumpleaños" },
      { key: "en_calendario", label: "Entrega y cumpleaños aparecen en el calendario interno" },
    ],
  },
  {
    key: "galeria",
    name: "Galería y selección",
    description: "Crear galería, compartir con cliente y recibir su selección.",
    modules: ["galleries", "projects"],
    checklist: [
      { key: "galeria_creada", label: "Galería creada y vinculada al proyecto" },
      { key: "compartida", label: "Galería compartida con el cliente (link/código)" },
      { key: "seleccion", label: "Cliente envía su selección" },
      { key: "estado_edicion", label: "Proyecto pasa a 'En edición' tras la selección" },
    ],
  },
  {
    key: "entrega_final",
    name: "Entrega final",
    description: "Marcar la entrega como realizada y cerrar el ciclo.",
    modules: ["deliveries", "galleries"],
    checklist: [
      { key: "lista", label: "Entrega marcada como 'Lista para entregar'" },
      { key: "entregada", label: "Entrega marcada como 'Entregada'" },
      { key: "antes_cumple", label: "Entregada antes del cumpleaños (si aplica)" },
    ],
  },
  {
    key: "seleccion_impresion",
    name: "Selección de impresión (álbum / marcos / prints)",
    description:
      "Al publicar la entrega final, el cliente elige portada de álbum, marcos e impresiones según su plan; el estudio descarga un ZIP organizado por carpetas con los originales.",
    modules: ["galleries", "packages", "deliveries"],
    checklist: [
      { key: "entitlements_plan", label: "El plan define impresos editables (portada, marcos, impresiones)" },
      { key: "habilita_publicar", label: "Al publicar la entrega final se habilita la selección" },
      { key: "email_cliente", label: "El cliente recibe el email para elegir sus impresiones" },
      { key: "seleccion_respeta_plan", label: "El cliente selecciona respetando las cantidades del plan" },
      { key: "limite_categoria", label: "Se respeta el límite por categoría (no excede el plan)" },
      { key: "envio_notifica", label: "El cliente envía su selección y el estudio es notificado" },
      { key: "zip_organizado", label: "El estudio descarga un ZIP organizado por carpetas (originales, máx. calidad)" },
    ],
  },
  {
    key: "correos",
    name: "Correos (cola + envío)",
    description: "Los emails se encolan y se envían vía SMTP/proveedor.",
    modules: ["mail"],
    checklist: [
      { key: "encola", label: "Los emails se encolan (email_queue)" },
      { key: "envia", label: "El worker/SMTP envía los emails" },
      { key: "sin_fallos", label: "No hay fallos recientes en la cola" },
    ],
  },
  {
    key: "calendario_interno",
    name: "Calendario interno",
    description: "Sesiones, entregas y cumpleaños organizados dentro del software.",
    modules: ["calendar", "deliveries"],
    checklist: [
      { key: "sesiones", label: "Sesiones aparecen en el calendario" },
      { key: "entregas_cal", label: "Fechas de entrega aparecen (📦)" },
      { key: "cumple_cal", label: "Cumpleaños aparecen (🎂)" },
      { key: "filtros", label: "Filtros por origen funcionan" },
    ],
  },
  {
    key: "google_calendar",
    name: "Google Calendar (opcional)",
    description: "Conexión OAuth y push de eventos a Google (si se habilita).",
    modules: ["google_calendar"],
    checklist: [
      { key: "oauth", label: "Conexión OAuth completa sin error de redirect" },
      { key: "calendario_activo", label: "Calendario activo seleccionado" },
      { key: "push", label: "Eventos se empujan a Google" },
    ],
  },
  {
    key: "automatizaciones",
    name: "Automatizaciones y webhooks",
    description: "Eventos del sistema disparan automatizaciones y webhooks salientes.",
    modules: ["automations", "webhooks"],
    checklist: [
      { key: "eventos", label: "Los eventos (invoice.paid, etc.) se disparan" },
      { key: "webhook_saliente", label: "Webhooks salientes entregan el payload" },
      { key: "reintentos", label: "Reintentos/registro de fallos funcionan" },
    ],
  },
  {
    key: "papelera",
    name: "Papelera (soft-delete + restauración)",
    description: "Borrado lógico y restauración de entidades.",
    modules: ["trash"],
    checklist: [
      { key: "soft_delete", label: "Eliminar mueve a papelera (deleted_at)" },
      { key: "listado", label: "La papelera lista lo eliminado" },
      { key: "restaurar", label: "Restaurar devuelve la entidad" },
      { key: "hard_delete", label: "Eliminar definitivo funciona" },
    ],
  },
  {
    key: "eliminacion_cliente",
    name: "Eliminación en cascada de cliente",
    description: "Borrar un cliente cascadea proyectos, contratos, facturas, etc.",
    modules: ["clients", "projects", "contracts", "invoices"],
    checklist: [
      { key: "cascade", label: "Cascade borra proyectos/contratos/facturas/pagos" },
      { key: "bookings", label: "Booking_requests asociados se cancelan" },
      { key: "restore", label: "Restaurar cliente recupera la cascada" },
    ],
  },
  {
    key: "fiscal_ncf",
    name: "Fiscal RD (NCF/ITBIS)",
    description: "Emisión de NCF e ITBIS en facturas.",
    modules: ["fiscal", "invoices"],
    checklist: [
      { key: "secuencia", label: "Secuencia NCF configurada y activa" },
      { key: "emision", label: "NCF se asigna atómicamente a la factura" },
      { key: "itbis", label: "ITBIS calculado correctamente" },
    ],
  },
  {
    key: "finanzas",
    name: "Finanzas",
    description: "Registro de transacciones y conciliación con facturas/pagos.",
    modules: ["finance"],
    checklist: [
      { key: "transaccion", label: "Crear ingreso/gasto funciona" },
      { key: "ingreso_pago", label: "Pago de factura genera ingreso (si está integrado)" },
      { key: "reportes", label: "Reportes/saldos cuadran" },
    ],
  },
  {
    key: "inventario",
    name: "Inventario",
    description: "Equipos, préstamos internos y rentas a cliente.",
    modules: ["inventory"],
    checklist: [
      { key: "item", label: "Crear ítem de inventario funciona" },
      { key: "prestamo", label: "Préstamo/renta registra movimiento de stock" },
      { key: "devolucion", label: "Devolución actualiza el stock" },
    ],
  },
  {
    key: "reset_booking",
    name: "Reinicio de booking (pruebas)",
    description: "Botón que borra todo lo generado por una solicitud y la deja en pendiente.",
    modules: ["bookings"],
    checklist: [
      { key: "borra_todo", label: "Borra cliente, proyecto, contrato, factura, pagos" },
      { key: "limpia_notifs", label: "Limpia notificaciones e historial" },
      { key: "vuelve_pending", label: "La solicitud vuelve a 'pendiente'" },
    ],
  },
]

export function getWorkflow(key: string): StatusWorkflow | undefined {
  return STATUS_WORKFLOWS.find((w) => w.key === key)
}
