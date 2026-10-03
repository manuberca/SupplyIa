import { NavLink } from 'react-router'
import {
  ClipboardList,
  House,
  LayoutDashboard,
  ListChecks,
  ScanLine,
  Settings,
  TrendingUp,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { NOMBRE_ROL, puede, type Seccion } from '../lib/permisos'
import { useSesionLista } from '../sesion/contexto'
import { Marca } from './Marca'

// En el celular es la barra de abajo. En una pantalla ancha (computadora) es el menú de la
// izquierda, con algunos accesos más que en el celular están en otro lado (Pedidos en Inicio,
// Ajustes arriba a la derecha). Qué se ve en cada tamaño lo decide el CSS.
const secciones: {
  a: string
  texto: string
  icono: LucideIcon
  seccion: Seccion
  soloEscritorio?: boolean
}[] = [
  { a: '/', texto: 'Inicio', icono: House, seccion: 'inicio' },
  { a: '/pedir', texto: 'Pedir', icono: ClipboardList, seccion: 'pedir' },
  { a: '/pedidos', texto: 'Pedidos', icono: ListChecks, seccion: 'pedidos', soloEscritorio: true },
  { a: '/recibir', texto: 'Recibir', icono: ScanLine, seccion: 'recibir' },
  { a: '/proveedores', texto: 'Proveedores', icono: Truck, seccion: 'proveedores' },
  { a: '/precios', texto: 'Precios', icono: TrendingUp, seccion: 'precios' },
]

export function BarraInferior() {
  const { miembro, org, local } = useSesionLista()
  const visibles = secciones.filter((s) => puede(miembro.rol, s.seccion))
  const esAdmin = puede(miembro.rol, 'ajustes_org')

  return (
    <nav className="barra" aria-label="Secciones">
      <div className="barra__marca">
        <Marca />
      </div>
      {visibles.map(({ a, texto, icono: Icono, soloEscritorio }) => (
        <NavLink
          key={a}
          to={a}
          end={a === '/'}
          className={soloEscritorio ? 'barra__item barra__item--escritorio' : 'barra__item'}
        >
          <Icono size={22} strokeWidth={1.8} aria-hidden="true" />
          {texto}
        </NavLink>
      ))}
      <div className="barra__pie">
        {esAdmin && (
          <NavLink to="/admin" className="barra__item">
            <LayoutDashboard size={22} strokeWidth={1.8} aria-hidden="true" />
            Administración
          </NavLink>
        )}
        <NavLink to="/ajustes" className="barra__item">
          <Settings size={22} strokeWidth={1.8} aria-hidden="true" />
          {esAdmin ? 'Ajustes' : 'Tu cuenta'}
        </NavLink>
        <div className="barra__cuenta">
          <strong>{org.nombre}</strong>
          <span>
            {local ? `${local.nombre} · ` : ''}
            {NOMBRE_ROL[miembro.rol]}
          </span>
        </div>
      </div>
    </nav>
  )
}
