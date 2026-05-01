import slugify from "slugify"
import { createId } from "@paralleldrive/cuid2"

export function toSlug(text: string) {
  return slugify(text, { lower: true, strict: true, trim: true })
}

export function uniqueSlug(text: string) {
  const base = toSlug(text)
  const suffix = createId().slice(0, 6)
  return `${base}-${suffix}`
}
