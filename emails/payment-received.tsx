import {
  Heading,
  Text,
  Section,
  Hr,
  Row,
  Column,
} from "@react-email/components"
import { BaseEmail } from "./base"

interface PaymentReceivedEmailProps {
  clientName: string
  studioName: string
  studioLogoUrl?: string
  invoiceNumber: string
  amount: number
  currency: string
  remainingBalance: number
  paymentMethod: string
  paidAt: string
}

export function PaymentReceivedEmail({
  clientName,
  studioName,
  studioLogoUrl,
  invoiceNumber,
  amount,
  currency,
  remainingBalance,
  paymentMethod,
  paidAt,
}: PaymentReceivedEmailProps) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("es", { style: "currency", currency }).format(n)

  const METHOD_LABELS: Record<string, string> = {
    CASH: "Efectivo",
    BANK_TRANSFER: "Transferencia bancaria",
    CREDIT_CARD: "Tarjeta de crédito",
    DEBIT_CARD: "Tarjeta de débito",
    PAYPAL: "PayPal",
    STRIPE: "Stripe",
    OTHER: "Otro",
  }

  return (
    <BaseEmail
      preview={`Pago recibido — ${fmt(amount)} para factura ${invoiceNumber}`}
      studioName={studioName}
      studioLogoUrl={studioLogoUrl}
    >
      <div style={{ textAlign: "center", marginBottom: "24px" }}>
        <div
          style={{
            width: "56px",
            height: "56px",
            background: "#dcfce7",
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "24px",
          }}
        >
          ✅
        </div>
      </div>

      <Heading className="text-2xl font-bold text-gray-900 mb-2 mt-0 text-center">
        ¡Pago confirmado!
      </Heading>
      <Text className="text-gray-600 mt-0 text-center">
        Hola {clientName}, hemos registrado tu pago correctamente.
      </Text>

      <Section className="border border-gray-200 rounded-xl overflow-hidden my-4">
        <Row className="bg-green-50 px-5 py-4">
          <Column>
            <Text className="text-xs text-green-700 m-0 uppercase tracking-wide">Monto pagado</Text>
            <Text className="text-2xl font-bold text-green-700 m-0">{fmt(amount)}</Text>
          </Column>
          <Column align="right">
            <Text className="text-xs text-gray-500 m-0 uppercase tracking-wide">Factura</Text>
            <Text className="text-sm font-bold text-gray-900 m-0">{invoiceNumber}</Text>
          </Column>
        </Row>

        <Section className="px-5 py-4 space-y-2">
          <Row>
            <Column>
              <Text className="text-sm text-gray-500 m-0">Método de pago</Text>
            </Column>
            <Column align="right">
              <Text className="text-sm font-medium text-gray-900 m-0">
                {METHOD_LABELS[paymentMethod] ?? paymentMethod}
              </Text>
            </Column>
          </Row>
          <Row>
            <Column>
              <Text className="text-sm text-gray-500 m-0">Fecha</Text>
            </Column>
            <Column align="right">
              <Text className="text-sm font-medium text-gray-900 m-0">
                {new Date(paidAt).toLocaleDateString("es")}
              </Text>
            </Column>
          </Row>
          {remainingBalance > 0 && (
            <Row>
              <Column>
                <Text className="text-sm text-amber-600 m-0">Saldo pendiente</Text>
              </Column>
              <Column align="right">
                <Text className="text-sm font-bold text-amber-600 m-0">{fmt(remainingBalance)}</Text>
              </Column>
            </Row>
          )}
        </Section>
      </Section>

      {remainingBalance === 0 && (
        <Section className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 my-4 text-center">
          <Text className="text-green-800 font-semibold m-0">🎉 Factura completamente pagada</Text>
        </Section>
      )}

      <Hr className="border-gray-100 my-6" />
      <Text className="text-xs text-gray-400 m-0">
        Guarda este correo como comprobante de tu pago. {studioName} tiene el registro de esta transacción.
      </Text>
    </BaseEmail>
  )
}

export default PaymentReceivedEmail
