import {
  Button,
  Heading,
  Text,
  Hr,
} from "@react-email/components"
import { BaseEmail } from "./base"

interface ResetPasswordEmailProps {
  userName: string
  studioName: string
  studioLogoUrl?: string
  resetUrl: string
}

export function ResetPasswordEmail({
  userName,
  studioName,
  studioLogoUrl,
  resetUrl,
}: ResetPasswordEmailProps) {
  return (
    <BaseEmail
      preview="Restablece tu contraseña de StudioFlow"
      studioName={studioName}
      studioLogoUrl={studioLogoUrl}
    >
      <Heading className="text-2xl font-bold text-gray-900 mb-2 mt-0">
        Restablecer contraseña 🔐
      </Heading>
      <Text className="text-gray-600 mt-0">
        Hola {userName}, recibimos una solicitud para restablecer la contraseña de tu cuenta en
        StudioFlow.
      </Text>

      <Button
        href={resetUrl}
        className="bg-gray-900 text-white font-semibold text-sm px-6 py-3 rounded-lg no-underline block text-center w-full"
      >
        Restablecer contraseña
      </Button>

      <Hr className="border-gray-100 my-6" />
      <Text className="text-sm text-gray-500">
        Este enlace es válido por 1 hora. Si no solicitaste restablecer tu contraseña, puedes ignorar
        este correo — tu cuenta está segura.
      </Text>
    </BaseEmail>
  )
}

export default ResetPasswordEmail
