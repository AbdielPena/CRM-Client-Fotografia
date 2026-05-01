import Link from "next/link"
import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import { AppTopbar } from "@/components/layout/app-topbar"
import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { ContractTemplateEditor } from "@/components/settings/contract-template-editor"

export const metadata: Metadata = { title: "Nueva plantilla de contrato" }

const STARTER_BODY = `<h1>Contrato de servicios fotográficos</h1>

<p>Entre <strong>{{estudio_nombre}}</strong> (el "Fotógrafo") y <strong>{{cliente_nombre}}</strong> (el "Cliente"), con fecha {{hoy}}, se acuerda lo siguiente:</p>

<h2>1. Objeto del contrato</h2>
<p>El Fotógrafo se compromete a cubrir el evento de <strong>{{cliente_nombre}}</strong> el día <strong>{{evento_fecha}}</strong> en <strong>{{evento_locacion}}</strong>, bajo el paquete contratado: <strong>{{paquete_nombre}}</strong>.</p>

<h2>2. Inversión</h2>
<p>El valor total del servicio es de <strong>{{moneda}} {{paquete_precio}}</strong>. La reserva de fecha requiere un depósito inicial no reembolsable.</p>

<h2>3. Entregables</h2>
<p>El Cliente recibirá su galería final vía link privado en un plazo de hasta 45 días hábiles posteriores al evento.</p>

<h2>4. Derechos de imagen</h2>
<p>El Fotógrafo se reserva el derecho de utilizar imágenes seleccionadas del evento para portafolio, redes sociales y material promocional.</p>

<h2>5. Cancelaciones y reprogramaciones</h2>
<p>El depósito no es reembolsable. Cambios de fecha están sujetos a disponibilidad.</p>

<p style="margin-top: 32px;">Firmando este documento, el Cliente acepta los términos aquí descritos.</p>`

export default async function NewContractTemplatePage() {
  const session = await requireStudioAuth()
  const unread = await countUnreadNotifications(session.studioId)

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Nueva plantilla de contrato"
        description="Crea una vez; reutiliza en cada booking"
        unreadNotifications={unread}
        actions={
          <Link
            href="/settings/contracts"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
        }
      />
      <div className="px-6 py-6 lg:px-8 lg:py-8 max-w-4xl">
        <ContractTemplateEditor
          mode="create"
          initial={{
            name: "",
            description: "",
            bodyHtml: STARTER_BODY,
            isDefault: false,
            isActive: true,
            defaultValidityDays: 14,
          }}
        />
      </div>
    </>
  )
}
