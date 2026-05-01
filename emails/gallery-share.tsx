import {
  Button,
  Heading,
  Text,
  Section,
  Hr,
} from "@react-email/components"
import { BaseEmail } from "./base"

interface GalleryShareEmailProps {
  clientName: string
  studioName: string
  studioLogoUrl?: string
  galleryName: string
  galleryUrl: string
  message?: string
  expiresAt?: string
  photoCount?: number
  allowDownload?: boolean
}

export function GalleryShareEmail({
  clientName,
  studioName,
  studioLogoUrl,
  galleryName,
  galleryUrl,
  message,
  expiresAt,
  photoCount,
  allowDownload,
}: GalleryShareEmailProps) {
  return (
    <BaseEmail
      preview={`${studioName} compartió tu galería "${galleryName}"`}
      studioName={studioName}
      studioLogoUrl={studioLogoUrl}
    >
      <Heading className="text-2xl font-bold text-gray-900 mb-2 mt-0">
        Tu galería está lista ✨
      </Heading>
      <Text className="text-gray-600 mt-0">
        Hola {clientName}, {studioName} ha compartido tu galería de fotos contigo.
      </Text>

      {message && (
        <Section className="bg-gray-50 rounded-lg px-5 py-4 my-4">
          <Text className="text-gray-700 text-sm m-0 italic">"{message}"</Text>
        </Section>
      )}

      <Section className="bg-gray-50 rounded-xl p-5 my-4">
        <Heading className="text-base font-semibold text-gray-900 m-0 mb-3">{galleryName}</Heading>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {photoCount !== undefined && (
            <Text className="text-sm text-gray-500 m-0">
              📸 <strong>{photoCount}</strong> fotos
            </Text>
          )}
          {allowDownload && (
            <Text className="text-sm text-gray-500 m-0">⬇️ Descarga disponible</Text>
          )}
          {expiresAt && (
            <Text className="text-sm text-gray-500 m-0">
              ⏰ Disponible hasta {new Date(expiresAt).toLocaleDateString("es")}
            </Text>
          )}
        </div>
      </Section>

      <Button
        href={galleryUrl}
        className="bg-gray-900 text-white font-semibold text-sm px-6 py-3 rounded-lg no-underline block text-center w-full"
      >
        Ver mi galería
      </Button>

      <Hr className="border-gray-100 my-6" />
      <Text className="text-xs text-gray-400 m-0">
        Si tienes alguna pregunta, responde directamente a este correo o contacta a {studioName}.
      </Text>
    </BaseEmail>
  )
}

export default GalleryShareEmail
