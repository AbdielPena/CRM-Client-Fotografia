import {
  Button,
  Heading,
  Text,
  Section,
  Hr,
  Row,
  Column,
} from "@react-email/components"
import { BaseEmail } from "./base"

interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
}

interface InvoiceSentEmailProps {
  clientName: string
  studioName: string
  studioLogoUrl?: string
  invoiceNumber: string
  invoiceUrl: string
  dueDate: string
  total: number
  currency: string
  items: InvoiceItem[]
}

export function InvoiceSentEmail({
  clientName,
  studioName,
  studioLogoUrl,
  invoiceNumber,
  invoiceUrl,
  dueDate,
  total,
  currency,
  items,
}: InvoiceSentEmailProps) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("es", { style: "currency", currency }).format(n)

  return (
    <BaseEmail
      preview={`Factura ${invoiceNumber} de ${studioName} — ${fmt(total)}`}
      studioName={studioName}
      studioLogoUrl={studioLogoUrl}
    >
      <Heading className="text-2xl font-bold text-gray-900 mb-2 mt-0">
        Nueva factura 🧾
      </Heading>
      <Text className="text-gray-600 mt-0">
        Hola {clientName}, {studioName} te ha enviado una nueva factura.
      </Text>

      <Section className="border border-gray-200 rounded-xl overflow-hidden my-4">
        <Row className="bg-gray-50 px-5 py-3">
          <Column>
            <Text className="text-xs text-gray-500 m-0 uppercase tracking-wide">Factura</Text>
            <Text className="text-sm font-bold text-gray-900 m-0">{invoiceNumber}</Text>
          </Column>
          <Column align="right">
            <Text className="text-xs text-gray-500 m-0 uppercase tracking-wide">Vence el</Text>
            <Text className="text-sm font-bold text-gray-900 m-0">
              {new Date(dueDate).toLocaleDateString("es")}
            </Text>
          </Column>
        </Row>

        <Section className="px-5 py-4">
          {items.map((item, i) => (
            <Row key={i} className="py-1.5">
              <Column>
                <Text className="text-sm text-gray-700 m-0">{item.description}</Text>
                <Text className="text-xs text-gray-400 m-0">
                  {item.quantity} × {fmt(item.unitPrice)}
                </Text>
              </Column>
              <Column align="right">
                <Text className="text-sm font-medium text-gray-900 m-0">
                  {fmt(item.quantity * item.unitPrice)}
                </Text>
              </Column>
            </Row>
          ))}
        </Section>

        <Row className="bg-gray-900 px-5 py-4">
          <Column>
            <Text className="text-sm font-bold text-white m-0">Total</Text>
          </Column>
          <Column align="right">
            <Text className="text-lg font-bold text-white m-0">{fmt(total)}</Text>
          </Column>
        </Row>
      </Section>

      <Button
        href={invoiceUrl}
        className="bg-gray-900 text-white font-semibold text-sm px-6 py-3 rounded-lg no-underline block text-center w-full"
      >
        Ver y pagar factura
      </Button>

      <Hr className="border-gray-100 my-6" />
      <Text className="text-xs text-gray-400 m-0">
        Si tienes algún problema con esta factura, contacta directamente a {studioName}.
      </Text>
    </BaseEmail>
  )
}

export default InvoiceSentEmail
