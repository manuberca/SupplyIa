import { Link } from 'react-router'
import { ClipboardList, ScanLine } from 'lucide-react'
import { puede } from '../lib/permisos'
import { useSesionLista } from '../sesion/contexto'

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

function fechaDeHoy(): string {
  const hoy = new Date()
  return `${DIAS[hoy.getDay()]} ${hoy.getDate()} de ${MESES[hoy.getMonth()]}`
}

export function Inicio() {
  const { miembro } = useSesionLista()
  const puedePedir = puede(miembro.rol, 'pedir')

  return (
    <>
      <div>
        <div className="sobretitulo">{fechaDeHoy()}</div>
        <h1>¿Qué necesitás hoy?</h1>
      </div>

      <div className={puedePedir ? 'accesos' : 'accesos accesos--uno'}>
        {puedePedir && (
          <Link to="/pedir" className="acceso acceso--pedir">
            <ClipboardList size={26} strokeWidth={1.8} aria-hidden="true" />
            <div>
              <div className="acceso__titulo">Nuevo pedido</div>
              <div className="acceso__detalle">Elegí proveedor y mandalo por WhatsApp</div>
            </div>
          </Link>
        )}
        <Link to="/recibir" className="acceso acceso--recibir">
          <ScanLine size={26} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <div className="acceso__titulo">Recibir mercadería</div>
            <div className="acceso__detalle">Foto al remito y la IA lo controla</div>
          </div>
        </Link>
      </div>
    </>
  )
}
