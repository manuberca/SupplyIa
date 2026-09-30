// Cómo se muestra cada estado de una diferencia de recepción.

export type EstadoDiferencia = 'pendiente' | 'reclamado' | 'nota_credito' | 'resuelto'

export const ESTADOS_DIFERENCIA: Record<EstadoDiferencia, { texto: string; clase: string }> = {
  pendiente: { texto: 'Pendiente', clase: 'pastilla--error' },
  reclamado: { texto: 'Reclamado', clase: 'pastilla--atencion' },
  nota_credito: { texto: 'Nota de crédito', clase: 'pastilla--info' },
  resuelto: { texto: 'Resuelto', clase: 'pastilla--ok' },
}
