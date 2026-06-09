import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getFeedbackState } from "@/server/services/engagement-feedback.service"
import { FeedbackForm } from "@/components/public/feedback-form"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Tu opinión" }

export default async function FeedbackPage({ params }: { params: { token: string } }) {
  const state = await getFeedbackState(params.token)
  if (!state) notFound()

  const alreadyDone = state.status === "submitted"

  return (
    <div className="client-luxe bg-luxe-radial flex min-h-screen items-center justify-center px-4 py-10">
      <div className="lx-card w-full max-w-md p-8 text-center">
        <p className="lx-overline mb-2">{state.studioName}</p>
        {alreadyDone ? (
          <>
            <h1 className="font-serif text-2xl font-semibold text-foreground">¡Gracias por tu opinión! 💛</h1>
            <p className="mt-3 text-[14px] text-muted-foreground">
              Ya recibimos tu valoración. ¡Apreciamos muchísimo que nos ayudes a mejorar!
            </p>
          </>
        ) : (
          <>
            <h1 className="font-serif text-2xl font-semibold text-foreground">
              ¿Cómo fue tu experiencia?
            </h1>
            <p className="mt-2 text-[14px] text-muted-foreground">
              Tu opinión nos ayuda muchísimo. Toca las estrellas para calificar.
            </p>
            <FeedbackForm
              token={params.token}
              minStars={state.minStars}
              hasReviewUrl={!!(state.googleUrl || state.facebookUrl)}
            />
          </>
        )}
      </div>
    </div>
  )
}
