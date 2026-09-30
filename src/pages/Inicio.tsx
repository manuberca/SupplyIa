import { Link } from 'react-router'
import { ClipboardList, ScanLine, TrendingUp } from 'lucide-react'
import { EsperarCatalogo } from '../catalogo/EsperarCatalogo'
import { useCatalogo } from '../catalogo/contexto'
import { useControl } from '../control/contexto'
import { porcentaje } from '../lib/formato'
import { puede } from '../lib/permisos'
import { usePedidos } from '../pedidos/contexto'
import { FilasPedidos } from '../pedidos/FilasPedidos'
import { EN_CURSO } from '../pedidos/tipos'
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

      <AlertaAumentos />

      <PedidosEnCurso />
    </>
  )
}

function PedidosEnCurso() {
  const { pedidos, estado } = usePedidos()
  const enCurso = pedidos.filter((p) => p.subida || EN_CURSO.includes(p.estado))
  if (estado === 'cargando' || (estado === 'error' && enCurso.length === 0)) return null

  return (
    <>
      <div className="seccion-encabezado">
        <h2>Pedidos en curso</h2>
        <Link to="/pedidos" className="enlace-accion">
          Ver todos
        </Link>
      </div>
      <EsperarCatalogo>
        {(catalogo) => (
          <FilasPedidos
            pedidos={enCurso.slice(0, 4)}
            catalogo={catalogo}
            vacia="No hay pedidos en curso."
          />
        )}
      </EsperarCatalogo>
    </>
  )
}

/** "Subieron 3 insumos esta semana" (solo para quien ve Precios). */
function AlertaAumentos() {
  const { miembro } = useSesionLista()
  const control = useControl()
  const { catalogo } = useCatalogo()
  if (!puede(miembro.rol, 'precios') || control.estado !== 'listo' || catalogo.estado !== 'listo')
    return null
  const { alertas } = control.datos
  if (alertas.length === 0) return null
  const cat = catalogo.catalogo
  const n = alertas.length

  return (
    <section className="card alerta-aumentos" aria-labelledby="titulo-aumentos">
      <div className="seccion-encabezado">
        <h2 id="titulo-aumentos" className="alerta-aumentos__titulo">
          <span className="alerta-aumentos__icono" aria-hidden="true">
            <TrendingUp size={18} />
          </span>
          {n === 1 ? 'Subió 1 insumo esta semana' : `Subieron ${n} insumos esta semana`}
        </h2>
        <Link to="/precios" className="enlace-accion">
          Ver
        </Link>
      </div>
      <div className="lista lista--sin-borde">
        {alertas.slice(0, 3).map((a) => (
          <div key={a.producto_id} className="lista__fila">
            <span className="lista__texto">
              <span className="lista__titulo">
                {cat.productos.find((p) => p.id === a.producto_id)?.nombre}
              </span>
              <span className="lista__detalle">
                {cat.proveedores.find((p) => p.id === a.proveedor_id)?.nombre}
              </span>
            </span>
            <span className="lista__dato mono texto-error">{porcentaje(a.variacionPct)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
