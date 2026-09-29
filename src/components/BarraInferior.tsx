import { NavLink } from 'react-router'
import { ClipboardList, House, ScanLine, TrendingUp, Truck, type LucideIcon } from 'lucide-react'
import { puede, type Seccion } from '../lib/permisos'
import { useSesionLista } from '../sesion/contexto'

const secciones: { a: string; texto: string; icono: LucideIcon; seccion: Seccion }[] = [
  { a: '/', texto: 'Inicio', icono: House, seccion: 'inicio' },
  { a: '/pedir', texto: 'Pedir', icono: ClipboardList, seccion: 'pedir' },
  { a: '/recibir', texto: 'Recibir', icono: ScanLine, seccion: 'recibir' },
  { a: '/proveedores', texto: 'Proveedores', icono: Truck, seccion: 'proveedores' },
  { a: '/precios', texto: 'Precios', icono: TrendingUp, seccion: 'precios' },
]

export function BarraInferior() {
  const { miembro } = useSesionLista()
  const visibles = secciones.filter((s) => puede(miembro.rol, s.seccion))

  return (
    <nav className="barra" aria-label="Secciones">
      {visibles.map(({ a, texto, icono: Icono }) => (
        <NavLink key={a} to={a} end={a === '/'} className="barra__item">
          <Icono size={22} strokeWidth={1.8} aria-hidden="true" />
          {texto}
        </NavLink>
      ))}
    </nav>
  )
}
