import { redirect } from "next/navigation"

/**
 * Landing del módulo Finance. Por ahora redirige a /finance/transactions que
 * es la página más usada. En F5 final habrá un /finance dashboard con KPIs
 * agregados (balances totales, ingresos/gastos del mes, próximos pagos).
 */
export default function FinanceLandingPage() {
  redirect("/finance/transactions")
}
