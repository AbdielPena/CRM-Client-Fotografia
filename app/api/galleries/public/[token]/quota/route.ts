import { NextResponse, type NextRequest } from "next/server"

import { validateGalleryToken } from "@/server/services/gallery.service"
import { getGallerySelectionQuota } from "@/server/services/selection-quota.service"
import { apiError } from "@/lib/utils/api-error"

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const view = await validateGalleryToken(params.token)
    if (!view)
      return NextResponse.json({ error: "token inválido" }, { status: 404 })
    const url = new URL(req.url)
    const email = url.searchParams.get("email") ?? ""
    const quota = await getGallerySelectionQuota(view.gallery.id, email)
    return NextResponse.json({ quota })
  } catch (e) {
    return apiError(e)
  }
}
