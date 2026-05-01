"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

/**
 * Monta un toast de confirmación tras crear el cliente. El server action redirige con
 * ?created=1; este componente captura el parámetro, muestra el toast y limpia la URL.
 */
export function ClientCreatedToast() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    if (params.get("created") === "1") {
      toast.success("Cliente creado con éxito", {
        description:
          "Se generaron el proyecto, el contrato y las 2 facturas (50 % reserva y 50 % sesión).",
      })
      // Limpia el query param para evitar disparar el toast al refrescar
      const newSearch = new URLSearchParams(params.toString())
      newSearch.delete("created")
      const qs = newSearch.toString()
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
