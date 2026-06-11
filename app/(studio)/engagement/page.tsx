import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { listEngagementAutomations } from "@/server/services/engagement.service"
import { getSegmentCounts } from "@/server/services/engagement-segments.service"
import {
  getFeedbackSummary,
  getReviewConfig,
  listAllReviews,
} from "@/server/services/engagement-feedback.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { EngagementManager } from "@/components/engagement/engagement-manager"
import { SegmentCampaigns } from "@/components/engagement/segment-campaigns"
import { FeedbackPanel } from "@/components/engagement/feedback-panel"
import { PublishedReviewsManager } from "@/components/engagement/published-reviews-manager"

export const metadata: Metadata = { title: "Client Engagement Hub" }
export const dynamic = "force-dynamic"

export default async function EngagementPage() {
  const session = await requireStudioAuth()
  const [automations, segmentCounts, feedbackSummary, reviewConfig, allReviews, unread] =
    await Promise.all([
      listEngagementAutomations(session.studioId),
      getSegmentCounts(session.studioId),
      getFeedbackSummary(session.studioId),
      getReviewConfig(session.studioId),
      listAllReviews(session.studioId),
      countUnreadNotifications(session.studioId),
    ])

  return (
    <>
      <AppTopbar
        title="Client Engagement Hub"
        description="Fideliza a tus clientes con automatizaciones por fecha: cumpleaños, post-entrega, reseñas e inactividad."
        unreadNotifications={unread}
      />
      <div className="space-y-8 px-6 py-6 lg:px-8 lg:py-8">
        <EngagementManager automations={automations} />
        <div className="max-w-5xl">
          <SegmentCampaigns counts={segmentCounts} />
        </div>
        <div className="max-w-5xl">
          <FeedbackPanel
            summary={feedbackSummary}
            config={{ googleUrl: reviewConfig.googleUrl, facebookUrl: reviewConfig.facebookUrl }}
          />
        </div>
        <div className="max-w-5xl">
          <PublishedReviewsManager reviews={allReviews} />
        </div>
      </div>
    </>
  )
}
