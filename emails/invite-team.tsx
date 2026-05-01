import {
  Button,
  Heading,
  Text,
  Section,
  Hr,
} from "@react-email/components"
import { BaseEmail } from "./base"

interface InviteTeamEmailProps {
  inviteeName: string
  inviterName: string
  studioName: string
  studioLogoUrl?: string
  role: string
  inviteUrl: string
  expiresAt: string
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  PHOTOGRAPHER: "Fotógrafo",
  EDITOR: "Editor",
  VIEWER: "Visualizador",
}

export function InviteTeamEmail({
  inviteeName,
  inviterName,
  studioName,
  studioLogoUrl,
  role,
  inviteUrl,
  expiresAt,
}: InviteTeamEmailProps) {
  return (
    <BaseEmail
      preview={`${inviterName} te invitó a unirte a ${studioName} en StudioFlow`}
      studioName={studioName}
      studioLogoUrl={studioLogoUrl}
    >
      <Heading className="text-2xl font-bold text-gray-900 mb-2 mt-0">
        Invitación al equipo 🤝
      </Heading>
      <Text className="text-gray-600 mt-0">
        Hola {inviteeName}, <strong>{inviterName}</strong> te ha invitado a unirte a{" "}
        <strong>{studioName}</strong> en StudioFlow.
      </Text>

      <Section className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 my-4">
        <Text className="text-xs text-gray-500 m-0 uppercase tracking-wide mb-1">Tu rol</Text>
        <Text className="text-base font-semibold text-gray-900 m-0">
          {ROLE_LABELS[role] ?? role}
        </Text>
      </Section>

      <Button
        href={inviteUrl}
        className="bg-gray-900 text-white font-semibold text-sm px-6 py-3 rounded-lg no-underline block text-center w-full"
      >
        Aceptar invitación
      </Button>

      <Hr className="border-gray-100 my-6" />
      <Text className="text-xs text-gray-400 m-0">
        Este enlace expira el {new Date(expiresAt).toLocaleDateString("es")}. Si no esperabas esta
        invitación, puedes ignorar este correo.
      </Text>
    </BaseEmail>
  )
}

export default InviteTeamEmail
