import type { Metadata } from "next"

import { getInviteByToken } from "@/server/services/collaborator-invite.service"
import { ConfirmButtons } from "@/components/collaborators/confirm-buttons"
import { formatCurrency } from "@/lib/utils/currency"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const metadata: Metadata = { title: "Confirmar asistencia" }

function fmtDate(d: string | null): string | null {
  if (!d) return null
  try {
    return new Date(d).toLocaleDateString("es-DO", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  } catch {
    return d
  }
}

export default async function ColabConfirmPage({
  params,
}: {
  params: { token: string }
}) {
  const invite = await getInviteByToken(params.token)
  const accent = invite?.accent || "#b89968"

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f3ef",
        color: "#1a1614",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily:
          "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 10px 40px rgba(0,0,0,.08)",
          padding: "32px 28px",
        }}
      >
        {!invite ? (
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>
              Invitación no válida
            </h1>
            <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>
              Este enlace no existe o ya no está disponible. Pídele al estudio
              que te reenvíe la invitación.
            </p>
          </div>
        ) : (
          <>
            <p
              style={{
                margin: "0 0 4px",
                fontSize: 12,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: accent,
                fontWeight: 700,
              }}
            >
              {invite.studioName}
            </p>
            <h1 style={{ fontSize: 22, margin: "0 0 6px", fontWeight: 800 }}>
              Te invitaron a colaborar
            </h1>
            <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 18px" }}>
              Hola <strong>{invite.collaboratorName || "colaborador/a"}</strong>,
              confirma tu disponibilidad para este trabajo.
            </p>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {[
                  ["Proyecto", invite.project.name],
                  ["Cliente", invite.clientName],
                  ["Fecha", fmtDate(invite.project.eventDate)],
                  ["Hora", invite.project.eventTime],
                  ["Lugar", invite.project.location],
                  ["Rol", invite.role],
                  invite.agreedPay > 0
                    ? ["Pago acordado", formatCurrency(invite.agreedPay, "DOP")]
                    : null,
                ]
                  .filter((r): r is [string, string] => !!r && !!r[1])
                  .map(([k, v]) => (
                    <tr key={k}>
                      <td
                        style={{
                          padding: "6px 16px 6px 0",
                          color: "#9ca3af",
                          fontSize: 13,
                          verticalAlign: "top",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {k}
                      </td>
                      <td
                        style={{
                          padding: "6px 0",
                          fontSize: 13.5,
                          fontWeight: 600,
                        }}
                      >
                        {v}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            <ConfirmButtons
              token={params.token}
              accent={accent}
              initialStatus={invite.confirmStatus}
            />
          </>
        )}
      </div>
    </div>
  )
}
