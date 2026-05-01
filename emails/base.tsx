import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
  Hr,
  Tailwind,
} from "@react-email/components"

interface BaseEmailProps {
  preview: string
  studioName: string
  studioLogoUrl?: string
  children: React.ReactNode
}

export function BaseEmail({ preview, studioName, studioLogoUrl, children }: BaseEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-gray-50 font-sans">
          <Container className="max-w-[600px] mx-auto py-8">
            {/* Studio Header */}
            <Section className="bg-white rounded-t-xl border border-gray-200 border-b-0 px-8 py-6 text-center">
              {studioLogoUrl ? (
                <img src={studioLogoUrl} alt={studioName} className="h-10 mx-auto" />
              ) : (
                <Text className="text-xl font-bold text-gray-900 m-0">{studioName}</Text>
              )}
            </Section>

            {/* Content */}
            <Section className="bg-white border border-gray-200 border-t-0 border-b-0 px-8 py-6">
              {children}
            </Section>

            {/* Footer */}
            <Section className="bg-white rounded-b-xl border border-gray-200 border-t-0 px-8 py-5">
              <Hr className="border-gray-100 my-0 mb-4" />
              <Text className="text-xs text-gray-400 text-center m-0">
                {studioName} · Powered by StudioFlow
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
