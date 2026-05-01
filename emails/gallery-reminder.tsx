import {
  Button,
  Heading,
  Text,
  Section,
  Hr,
} from "@react-email/components"
import { BaseEmail } from "./base"

interface GalleryReminderEmailProps {
  clientName: string
  studioName: string
  studioLogoUrl?: string
  galleryName: string
  galleryUrl: string
  expiresAt: string
  daysLeft: number
  favoriteCount?: number
}

export function GalleryReminderEmail({
  clientName,
  studioName,
  studioLogoUrl,
  galleryName,
  galleryUrl,
  expiresAt,
  daysLeft,
  favoriteCount,
}: GalleryReminderEmailProps) {
  const urgency = daysLeft <= 3 ? "🚨" : daysLeft <= 7 ? "⚠️" : "⏰"
  const urgencyColor = daysLeft <= 3 ? "#dc2626" : daysLeft <= 7 ? "#d97706" : "#2563eb"

  return (
    <BaseEmail
      preview={`Tu galería "${galleryName}" expira en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}`}
      studioName={studioName}
      studioLogoUrl={studioLogoUrl}
    >
      <Heading className="text-2xl font-bold text-gray-900 mb-2 mt-0">
        {urgency} Tu galería expira pronto
      </Heading>
      <Text className="text-gray-600 mt-0">
        Hola {clientName}, queremos recordarte que tu galería de fotos expirará próximamente.
      </Text>

      <Section
        style={{
          background: `${urgencyColor}10`,
          border: `1px solid ${urgencyColor}40`,
          borderRadius: "12px",
          padding: "16px 20px",
          margin: "16px 0",
        }}
      >
        <Text style={{ color: urgencyColor, fontWeight: "700", margin: "0 0 4px" }}>
          {urgency} Quedan {daysLeft} día{daysLeft !== 1 ? "s" : ""}
        </Text>
        <Text style={{ color: urgencyColor, margin: 0, fontSize: "13px" }}>
          La galería expira el {new Date(expiresAt).toLocaleDateString("es", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </Text>
      </Section>

      <Section className="bg-gray-50 rounded-xl px-5 py-4 my-4">
        <Text className="text-sm font-semibold text-gray-900 m-0 mb-1">{galleryName}</Text>
        {favoriteCount !== undefined && favoriteCount > 0 && (
          <Text className="text-sm text-gray-500 m-0">
            ❤️ Has marcado <strong>{favoriteCount} fotos</strong> como favoritas
          </Text>
        )}
        {(favoriteCount === undefined || favoriteCount === 0) && (
          <Text className="text-sm text-gray-500 m-0">
            Marca tus fotos favoritas antes de que expire
          </Text>
        )}
      </Section>

      <Button
        href={galleryUrl}
        className="bg-gray-900 text-white font-semibold text-sm px-6 py-3 rounded-lg no-underline block text-center w-full"
      >
        Ver galería ahora
      </Button>

      <Hr className="border-gray-100 my-6" />
      <Text className="text-xs text-gray-400 m-0">
        Si necesitas más tiempo, contacta a {studioName} para solicitar una extensión.
      </Text>
    </BaseEmail>
  )
}

export default GalleryReminderEmail
