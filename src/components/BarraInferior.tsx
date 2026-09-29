import { NavLink } from 'react-router'
import { ClipboardList, House, ScanLine, TrendingUp, Truck, type LucideIcon } from 'lucide-react'

const secciones: { a: string; texto: string; icono: LucideIcon }[] = [
  { a: '/', texto: 'Inicio', icono: House },
  { a: '/pedir', texto: 'Pedir', icono: ClipboardList },
  { a: '/recibir', texto: 'Recibir', icono: ScanLine },
  { a: '/proveedores', texto: 'Proveedores', icono: Truck },
  { a: '/precios', texto: 'Precios', icono: TrendingUp },
]

export function BarraInferior() {
  return (
    <nav className="barra" aria-label="Secciones">
      {secciones.map(({ a, texto, icono: Icono }) => (
        <NavLink key={a} to={a} end={a === '/'} className="barra__item">
          <Icono size={22} strokeWidth={1.8} aria-hidden="true" />
          {texto}
        </NavLink>
      ))}
    </nav>
  )
}
