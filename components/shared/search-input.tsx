"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useTransition, useCallback, useRef } from "react"
import { Search, X, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils/cn"

interface SearchInputProps {
  placeholder?: string
  className?: string
  paramName?: string
}

/**
 * Search input con URL-state — actualiza el query string en cada cambio.
 * Diseño alineado con el input del topbar (muted filled, brand focus ring).
 */
export function SearchInput({
  placeholder = "Buscar...",
  className,
  paramName = "q",
}: SearchInputProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement | null>(null)

  const currentValue = searchParams.get(paramName) ?? ""

  const apply = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(paramName, value)
      } else {
        params.delete(paramName)
      }
      params.delete("page")
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`)
      })
    },
    [router, pathname, searchParams, paramName],
  )

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Search className="h-4 w-4" />
        )}
      </span>
      <input
        ref={inputRef}
        type="search"
        placeholder={placeholder}
        defaultValue={currentValue}
        onChange={(e) => apply(e.target.value)}
        className={cn(
          "h-10 w-full rounded-md border border-transparent bg-muted pl-9 pr-9 text-body text-foreground",
          "placeholder:text-muted-foreground",
          "transition-colors duration-fast",
          "hover:bg-muted/80",
          "focus:border-brand/40 focus:bg-background focus:outline-none focus:ring-4 focus:ring-brand/15",
        )}
      />
      {currentValue && (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => {
            if (inputRef.current) inputRef.current.value = ""
            apply("")
          }}
          className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
