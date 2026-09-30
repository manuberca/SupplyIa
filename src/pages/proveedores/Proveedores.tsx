import { useState } from 'react'
import { Link } from 'react-router'
import { FileSpreadsheet, Plus, Search } from 'lucide-react'
import { EsperarCatalogo } from '../../catalogo/EsperarCatalogo'
import { useControl } from '../../control/contexto'
import { textoDias } from '../../lib/dias'
import { numero, porcentaje } from '../../lib/formato'
import { normalizar } from '../../lib/normalizar'
import type { Catalogo } from '../../catalogo/tipos'

export function Proveedores() {
  return (
    <>
      <div className="seccion-encabezado">
        <h1>Proveedores</h1>
        <Link to="/proveedores/nuevo" className="boton boton--primario">
          <Plus size={18} aria-hidden="true" />
          Agregar
        </Link>
      </div>
      <EsperarCatalogo>{(catalogo) => <Lista catalogo={catalogo} />}</EsperarCatalogo>
    </>
  )
}

type Orden = 'cumplimiento' | 'demora' | 'aumentos' | 'nombre'
type Indicadores = {
  pedidos: number
  cumplimiento: number | null
  demora: number | null
  aumento: number | null
}

const ORDENES: { valor: Orden; texto: string }[] = [
  { valor: 'cumplimiento', texto: 'Cumplimiento' },
  { valor: 'demora', texto: 'Demora' },
  { valor: 'aumentos', texto: 'Aumentos' },
  { valor: 'nombre', texto: 'A–Z' },
]

function Lista({ catalogo }: { catalogo: Catalogo }) {
  const [busqueda, setBusqueda] = useState('')
  const [verArchivados, setVerArchivados] = useState(false)
  const [orden, setOrden] = useState<Orden>('cumplimiento')
  const control = useControl()

  // Ranking de los últimos 30 días (SPEC §6).
  const indicadores = new Map<string, Indicadores>()
  if (control.estado === 'listo') {
    for (const p of catalogo.proveedores) {
      const m = control.datos.metricas.get(p.id)
      indicadores.set(p.id, {
        pedidos: m?.pedidos ?? 0,
        cumplimiento: m?.cumplimiento ?? null,
        demora: m?.demora ?? null,
        aumento: control.datos.aumentoDe(p.id),
      })
    }
  }
  const totalPedidos = [...indicadores.values()].reduce((s, x) => s + x.pedidos, 0)
  // Sin dato, al final; si no, el mejor primero.
  const clave = (id: string): number | null => {
    const x = indicadores.get(id)
    if (orden === 'cumplimiento') return x?.cumplimiento != null ? -x.cumplimiento : null
    if (orden === 'demora') return x?.demora ?? null
    if (orden === 'aumentos') return x?.aumento ?? null
    return null
  }
  const ordenar = (lista: Catalogo['proveedores']) =>
    [...lista].sort((a, b) => {
      const ka = clave(a.id)
      const kb = clave(b.id)
      if (ka === null && kb !== null) return 1
      if (kb === null && ka !== null) return -1
      return (ka ?? 0) - (kb ?? 0) || a.nombre.localeCompare(b.nombre)
    })

  const productosPor = new Map<string, number>()
  for (const p of catalogo.productos) {
    if (p.activo) productosPor.set(p.proveedor_id, (productosPor.get(p.proveedor_id) ?? 0) + 1)
  }

  const activos = catalogo.proveedores.filter((p) => p.activo)
  const archivados = catalogo.proveedores.filter((p) => !p.activo)
  const q = normalizar(busqueda)
  const filtrar = (lista: typeof activos) =>
    q ? lista.filter((p) => normalizar(p.nombre).includes(q)) : lista

  if (activos.length === 0 && archivados.length === 0) {
    return (
      <>
        <section className="card formulario">
          <p className="formulario__ayuda">
            <strong>Todavía no cargaste proveedores.</strong> Agregalos de a uno, o subí una
            planilla de Excel con todos los proveedores y sus productos juntos.
          </p>
          <Link to="/proveedores/nuevo" className="boton boton--primario">
            <Plus size={18} aria-hidden="true" />
            Agregar proveedor
          </Link>
          <Link to="/proveedores/importar" className="boton boton--secundario">
            <FileSpreadsheet size={18} aria-hidden="true" />
            Importar desde Excel
          </Link>
        </section>
      </>
    )
  }

  return (
    <>
      {activos.length > 6 && (
        <label className="buscador">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="Buscar proveedor"
            aria-label="Buscar proveedor"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
      )}

      <p className="subtitulo">
        Últimos 30 días · {totalPedidos}{' '}
        {totalPedidos === 1 ? 'pedido recibido' : 'pedidos recibidos'}
      </p>
      <div className="chips chips--chicos" role="group" aria-label="Ordenar por">
        {ORDENES.map((o) => (
          <button
            key={o.valor}
            className="chip"
            aria-pressed={orden === o.valor}
            onClick={() => setOrden(o.valor)}
          >
            {o.texto}
          </button>
        ))}
      </div>

      <FilasProveedores
        lista={ordenar(filtrar(activos))}
        productosPor={productosPor}
        indicadores={indicadores}
        umbral={catalogo.ajustes.umbral_alerta_pct}
        vacia="Ningún proveedor coincide con la búsqueda."
      />

      <div className="acciones">
        <Link to="/proveedores/importar" className="boton boton--secundario">
          <FileSpreadsheet size={18} aria-hidden="true" />
          Importar desde Excel
        </Link>
        {archivados.length > 0 && (
          <button className="boton boton--texto" onClick={() => setVerArchivados((v) => !v)}>
            {verArchivados ? 'Ocultar archivados' : `Ver archivados (${archivados.length})`}
          </button>
        )}
      </div>

      {verArchivados && (
        <FilasProveedores
          lista={filtrar(archivados)}
          productosPor={productosPor}
          indicadores={indicadores}
          umbral={catalogo.ajustes.umbral_alerta_pct}
          vacia="Ningún archivado coincide."
        />
      )}
    </>
  )
}

function FilasProveedores({
  lista,
  productosPor,
  indicadores,
  umbral,
  vacia,
}: {
  lista: Catalogo['proveedores']
  productosPor: Map<string, number>
  indicadores: Map<string, Indicadores>
  umbral: number
  vacia: string
}) {
  return (
    <section className="lista" aria-label="Proveedores">
      {lista.length === 0 && <p className="lista__vacia">{vacia}</p>}
      {lista.map((p) => {
        const cantidad = productosPor.get(p.id) ?? 0
        const x = indicadores.get(p.id)
        const conDatos = x && (x.cumplimiento !== null || x.demora !== null || x.aumento !== null)
        return (
          <Link key={p.id} to={`/proveedores/${p.id}`} className="lista__fila fila-proveedor">
            <span className="lista__texto">
              <span className="lista__titulo">{p.nombre}</span>
              <span className="lista__detalle">
                {!p.activo ? (
                  <span className="pastilla pastilla--gris">Archivado</span>
                ) : x?.pedidos ? (
                  `${x.pedidos} ${x.pedidos === 1 ? 'pedido' : 'pedidos'} · ${cantidad} ${cantidad === 1 ? 'producto' : 'productos'}`
                ) : (
                  `${textoDias(p.dias_entrega)} · ${cantidad} ${cantidad === 1 ? 'producto' : 'productos'}`
                )}
              </span>
            </span>
            {conDatos && (
              <span className="metricas" aria-label="Últimos 30 días">
                <span>
                  <span className="metricas__nombre">Cumple</span>
                  <span
                    className={`metricas__valor${x.cumplimiento !== null && x.cumplimiento < 85 ? ' metricas__valor--aviso' : ''}`}
                  >
                    {x.cumplimiento !== null ? `${x.cumplimiento}%` : '—'}
                  </span>
                </span>
                <span>
                  <span className="metricas__nombre">Demora</span>
                  <span className="metricas__valor">
                    {x.demora !== null ? `${numero(x.demora, 1)} d` : '—'}
                  </span>
                </span>
                <span>
                  <span className="metricas__nombre">Precios</span>
                  <span
                    className={`metricas__valor${x.aumento !== null && x.aumento > umbral ? ' metricas__valor--error' : ''}`}
                  >
                    {x.aumento !== null ? porcentaje(x.aumento) : '—'}
                  </span>
                </span>
              </span>
            )}
          </Link>
        )
      })}
    </section>
  )
}
