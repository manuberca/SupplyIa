import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { puede, type Seccion } from '../lib/permisos'
import { useSesionLista } from '../sesion/contexto'

/** Si el rol no tiene permiso para esta sección, vuelve al inicio. */
export function Protegida({ seccion, children }: { seccion: Seccion; children: ReactNode }) {
  const { miembro } = useSesionLista()
  if (!puede(miembro.rol, seccion)) return <Navigate to="/" replace />
  return children
}
