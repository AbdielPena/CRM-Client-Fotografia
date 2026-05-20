import { redirect } from "next/navigation"

/**
 * Landing del módulo Inventory. Por ahora redirige a /inventory/items que
 * es la página más usada. En F3 final habrá un /inventory dashboard con KPIs
 * (items totales, en préstamo, en mantenimiento, rentas activas, stock bajo).
 */
export default function InventoryLandingPage() {
  redirect("/inventory/items")
}
