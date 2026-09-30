// Cómo se muestra cada estado de una diferencia de recepción.

export type EstadoDiferencia = 'pendiente' | 'reclamado' | 'nota_credito' | 'resuelto'

export const ESTADOS_DIFERENCIA: Record<EstadoDiferencia, { texto: string; clase: string }> = {
  pendiente: { texto: 'Pendiente', clase: 'pastilla--atencion' },
  reclamado: { texto: 'Reclamado', clase: 'pastilla--info' },
  nota_credito: { texto: 'Nota de crédito', clase: 'pastilla--ok' },
  resuelto: { texto: 'Resuelto', clase: 'pastilla--gris' },
}
