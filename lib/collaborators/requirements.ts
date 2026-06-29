import {
  COLLABORATOR_TYPE_VALUES,
  collaboratorTypeLabel,
} from "@/lib/constants/collaborators"

/** Requisito de colaborador definido en un plan/paquete. */
export type CollaboratorRequirement = {
  type: string
  minCount: number
  estimatedCost: number
  costIncludedInPlan: boolean
}

/** Normaliza el jsonb crudo de packages.collaborator_requirements. */
export function normalizeRequirements(raw: unknown): CollaboratorRequirement[] {
  if (!Array.isArray(raw)) return []
  const out: CollaboratorRequirement[] = []
  for (const r of raw) {
    if (!r || typeof r !== "object") continue
    const o = r as Record<string, unknown>
    const type = typeof o.type === "string" ? o.type : ""
    if (!COLLABORATOR_TYPE_VALUES.includes(type)) continue
    const minCount =
      Math.floor(Number(o.minCount ?? o.min_count ?? 1)) || 1
    const estimatedCost = Number(o.estimatedCost ?? o.estimated_cost ?? 0) || 0
    out.push({
      type,
      minCount: Math.max(1, minCount),
      estimatedCost: Math.max(0, estimatedCost),
      costIncludedInPlan: Boolean(
        o.costIncludedInPlan ?? o.cost_included_in_plan ?? false,
      ),
    })
  }
  return out
}

export type RequirementStatus = {
  type: string
  label: string
  required: number
  assigned: number
  satisfied: boolean
  estimatedCost: number
  costIncludedInPlan: boolean
}

/**
 * Evalúa los requisitos de un plan contra los tipos de colaboradores ya
 * asignados al proyecto (lista de `type`, sin cancelados).
 */
export function evaluateRequirements(
  requirements: CollaboratorRequirement[],
  assignedTypes: string[],
): RequirementStatus[] {
  return requirements.map((req) => {
    const assigned = assignedTypes.filter((t) => t === req.type).length
    return {
      type: req.type,
      label: collaboratorTypeLabel(req.type),
      required: req.minCount,
      assigned,
      satisfied: assigned >= req.minCount,
      estimatedCost: req.estimatedCost,
      costIncludedInPlan: req.costIncludedInPlan,
    }
  })
}
