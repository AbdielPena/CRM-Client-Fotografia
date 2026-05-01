import {
  Button,
  Heading,
  Text,
  Section,
  Hr,
} from "@react-email/components"
import { BaseEmail } from "./base"

interface ContractSentEmailProps {
  clientName: string
  studioName: string
  studioLogoUrl?: string
  contractTitle: string
  signingUrl: string
  expiresAt?: string
}

export function ContractSentEmail({
  clientName,
  studioName,
  studioLogoUrl,
  contractTitle,
  signingUrl,
  expiresAt,
}: ContractSentEmailProps) {
  return (
    <BaseEmail
      preview={`${studioName} necesita tu firma en "${contractTitle}"`}
      studioName={studioName}
      studioLogoUrl={studioLogoUrl}
    >
      <Heading className="text-2xl font-bold text-gray-900 mb-2 mt-0">
        Contrato para firmar 📄
      </Heading>
      <Text className="text-gray-600 mt-0">
        Hola {clientName}, {studioName} ha preparado un contrato para ti. Por favor, léelo
        cuidadosamente y fírmalo cuando estés listo.
      </Text>

      <Section className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 my-4">
        <Text className="text-xs text-gray-500 m-0 uppercase tracking-wide mb-1">Contrato</Text>
        <Text className="text-base font-semibold text-gray-900 m-0">{contractTitle}</Text>
        {expiresAt && (
          <Text className="text-sm text-amber-600 mt-2 m-0">
            ⚠️ Este enlace expira el {new Date(expiresAt).toLocaleDateString("es")}
          </Text>
        )}
      </Section>

      <Button
        href={signingUrl}
        className="bg-gray-900 text-white font-semibold text-sm px-6 py-3 rounded-lg no-underline block text-center w-full"
      >
        Revisar y firmar contrato
      </Button>

      <Hr className="border-gray-100 my-6" />
      <Text className="text-sm text-gray-500">
        Al hacer clic en el enlace, podrás leer el contrato completo y firmar digitalmente con tu
        nombre. Tu firma quedará registrada junto con la fecha y dirección IP.
      </Text>
      <Text className="text-xs text-gray-400 m-0">
        ¿Preguntas? Contacta directamente a {studioName}.
      </Text>
    </BaseEmail>
  )
}

export default ContractSentEmail
