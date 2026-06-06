"use client"

import { useRouter } from "next/navigation"

export function YearSelect({ year }: { year: number }) {
  const router = useRouter()

  return (
    <select
      defaultValue={String(year)}
      onChange={(e) => {
        router.push(`/reports?year=${e.target.value}`)
      }}
      className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
    >
      {Array.from({ length: 5 }, (_, i) => year - 2 + i).map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  )
}
