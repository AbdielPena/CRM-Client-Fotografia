/**
 * Tipos de formularios dinámicos para PixelOS.
 *
 * Los formularios se definen como listas de "fields" (campos) en JSON.
 * Cada field tiene un type, key (identificador único dentro del form),
 * label, y opciones de validación.
 *
 * El schema del form se guarda en `form_templates.schema` (jsonb) y se
 * snapshot-ea en `form_responses.schema_snapshot` al crear la respuesta
 * (inmutable: si el template cambia después, la respuesta mantiene el
 * schema original).
 */

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'tel'
  | 'number'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'checkboxes' // grupo de casillas multi-selección (valor = string[])
  | 'file'
  | 'explanation' // bloque de texto descriptivo (no es un input)

export interface FormFieldOption {
  value: string
  label: string
}

export interface FormField {
  key: string
  type: FormFieldType
  label: string
  placeholder?: string
  help?: string
  required?: boolean
  /** Para select / radio. */
  options?: FormFieldOption[]
  /** Para text / textarea. */
  minLength?: number
  maxLength?: number
  /** Para number. */
  min?: number
  max?: number
  /** Para file. */
  accept?: string
  maxSizeMB?: number
  /** Muestra el campo solo si otro campo tiene ese valor. Formato: { key: 'has_makeup', equals: 'yes' }. */
  visibleIf?: { key: string; equals: string }
}

export interface FormSchema {
  version: 1
  title?: string
  description?: string
  fields: FormField[]
}

/**
 * Valida que una respuesta (data) cumpla con el schema. Devuelve lista
 * de errores por field key; vacía si todo ok.
 */
export function validateFormData(
  schema: FormSchema,
  data: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const field of schema.fields) {
    // 'explanation' es solo texto descriptivo, no captura nada → no validar.
    if (field.type === 'explanation') continue
    // Si es condicional y no debe mostrarse, no valides.
    if (field.visibleIf) {
      const sourceValue = String(data[field.visibleIf.key] ?? '')
      if (sourceValue !== field.visibleIf.equals) continue
    }

    const raw = data[field.key]
    const value =
      typeof raw === 'string' ? raw.trim() : raw === undefined ? '' : raw

    // Required
    if (field.required) {
      if (value === '' || value === null || value === undefined) {
        errors[field.key] = `${field.label} es obligatorio`
        continue
      }
      if (field.type === 'checkbox' && value !== true) {
        errors[field.key] = `Debes marcar ${field.label}`
        continue
      }
      if (field.type === 'checkboxes' && (!Array.isArray(value) || value.length === 0)) {
        errors[field.key] = `Selecciona al menos una opción en ${field.label}`
        continue
      }
    }

    if (value === '' || value === null || value === undefined) continue

    // Type-specific checks
    switch (field.type) {
      case 'email':
        if (typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors[field.key] = 'Email inválido'
        }
        break
      case 'number':
        if (typeof value === 'string' || typeof value === 'number') {
          const n = Number(value)
          if (Number.isNaN(n)) {
            errors[field.key] = 'Debe ser un número'
          } else {
            if (field.min !== undefined && n < field.min) {
              errors[field.key] = `Mínimo ${field.min}`
            }
            if (field.max !== undefined && n > field.max) {
              errors[field.key] = `Máximo ${field.max}`
            }
          }
        }
        break
      case 'text':
      case 'textarea':
        if (typeof value === 'string') {
          if (field.minLength !== undefined && value.length < field.minLength) {
            errors[field.key] = `Mínimo ${field.minLength} caracteres`
          }
          if (field.maxLength !== undefined && value.length > field.maxLength) {
            errors[field.key] = `Máximo ${field.maxLength} caracteres`
          }
        }
        break
      case 'select':
      case 'radio':
        if (field.options && !field.options.some((o) => o.value === value)) {
          errors[field.key] = 'Selecciona una opción válida'
        }
        break
      case 'checkboxes':
        if (Array.isArray(value) && field.options) {
          const valid = new Set(field.options.map((o) => o.value))
          if (value.some((v) => !valid.has(String(v)))) {
            errors[field.key] = 'Selección inválida'
          }
        }
        break
      case 'date':
        if (typeof value === 'string' && Number.isNaN(new Date(value).getTime())) {
          errors[field.key] = 'Fecha inválida'
        }
        break
    }
  }

  return errors
}

/** Valida que un objeto tenga forma de FormSchema. Lanza si no. */
export function assertFormSchema(obj: unknown): asserts obj is FormSchema {
  if (!obj || typeof obj !== 'object') {
    throw new Error('FormSchema inválido: no es objeto')
  }
  const schema = obj as Partial<FormSchema>
  if (!Array.isArray(schema.fields)) {
    throw new Error('FormSchema inválido: fields no es array')
  }
  const keys = new Set<string>()
  for (const f of schema.fields) {
    if (!f.key || typeof f.key !== 'string') {
      throw new Error(`FormSchema inválido: field sin key`)
    }
    if (keys.has(f.key)) {
      throw new Error(`FormSchema inválido: key duplicada "${f.key}"`)
    }
    keys.add(f.key)
    if (!f.label) {
      throw new Error(`FormSchema inválido: field "${f.key}" sin label`)
    }
  }
}
