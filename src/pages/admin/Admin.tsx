import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router'
import { ArrowLeft, Download } from 'lucide-react'
import { cargarPanel, type DatosPanel } from '../../admin/cargar'
import { rangoDelMes } from '../../admin/resumen'
import { EsperarCatalogo } from '../../catalogo/EsperarCatalogo'
import type { Catalogo } from '../../catalogo/tipos'
import type { ContextoPanel } from './contexto'
import { Marca } from '../../components/Marca'
import { reportar } from '../../lib/errores'
import { NOMBRE_ROL } from '../../lib/permisos'
import { useSesionLista } from '../../sesion/contexto'

const SECCIONES = [
  { ruta: '/admin', texto: 'Resumen' },
  { ruta: '/admin/pedidos', texto: 'Pedidos' },
  { ruta: '/admin/recepciones', texto: 'Recepciones y remitos' },
  { ruta: '/admin/proveedores', texto: 'Proveedores y productos' },
  { ruta: '/admin/precios', texto: 'Precios' },
  { ruta: '/admin/pagos', texto: 'Pagos' },
] as const

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

const claveMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

function nombreMes(mes: string): string {
  const [anio, m] = mes.split('-').map(Number) as [number, number]
  return `${MESES[m - 1]} ${anio}`
}

/** Los últimos 12 meses, del actual para atrás. */
function mesesElegibles(hoy = new Date()): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    claveMes(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)),
  )
}

type Cargado = { clave: string; datos: DatosPanel | null; error: string }

/** Trae los datos de unos filtros; devuelve cómo actualizar el estado (si falla, deja lo anterior). */
async function pedirPanel(clave: string) {
  const [mes, localId, proveedorId] = JSON.parse(clave) as [string, string | null, string | null]
  const { desde, hasta } = rangoDelMes(mes)
  const r = await cargarPanel({ desde, hasta, localId, proveedorId })
  return (previo: Cargado): Cargado =>
    'error' in r ? { clave, datos: previo.datos, error: r.error } : { clave, datos: r, error: '' }
}

export function Admin() {
  return <EsperarCatalogo>{(catalogo) => <Panel catalogo={catalogo} />}</EsperarCatalogo>
}

function Panel({ catalogo }: { catalogo: Catalogo }) {
  const { org, miembro, locales } = useSesionLista()
  const [params, setParams] = useSearchParams()
  const { pathname, search } = useLocation()

  const hoy = new Date()
  const meses = mesesElegibles(hoy)
  const mes = meses.includes(params.get('mes') ?? '') ? params.get('mes')! : meses[0]!
  const localId = locales.some((l) => l.id === params.get('local')) ? params.get('local') : null
  const proveedorId = catalogo.proveedores.some((p) => p.id === params.get('proveedor'))
    ? params.get('proveedor')
    : null

  const { desde, hasta } = rangoDelMes(mes)
  const periodo = { mes, nombre: nombreMes(mes), desde, hasta }

  const clave = JSON.stringify([mes, localId, proveedorId])
  const [cargado, setCargado] = useState<Cargado>({ clave: '', datos: null, error: '' })
  const [recargando, setRecargando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [errorExportar, setErrorExportar] = useState('')
  const { datos, error } = cargado
  const cargando = cargado.clave !== clave || recargando

  useEffect(() => {
    let vigente = true
    pedirPanel(clave).then((aplicar) => {
      if (vigente) setCargado(aplicar)
    })
    return () => {
      vigente = false
    }
  }, [clave])

  async function traer() {
    setRecargando(true)
    setCargado(await pedirPanel(clave))
    setRecargando(false)
  }

  const nombresLocales = new Map(locales.map((l) => [l.id, l.nombre]))
  const proveedor = (id: string) =>
    catalogo.proveedores.find((p) => p.id === id)?.nombre ?? 'Proveedor'

  function filtrar(clave: 'mes' | 'local' | 'proveedor', valor: string) {
    const nuevos = new URLSearchParams(params)
    if (valor) nuevos.set(clave, valor)
    else nuevos.delete(clave)
    setParams(nuevos, { replace: true })
  }

  async function exportar() {
    if (!datos) return
    setExportando(true)
    setErrorExportar('')
    try {
      const { exportarPanel } = await import('../../admin/exportar')
      const filtro = [
        localId ? nombresLocales.get(localId) : null,
        proveedorId ? proveedor(proveedorId) : null,
      ].filter(Boolean)
      await exportarPanel(
        datos,
        catalogo,
        { ...periodo, nombre: [periodo.nombre, ...filtro].join(' - ') },
        nombresLocales,
        org.nombre,
      )
    } catch (e) {
      reportar(e, 'Exportar a Excel')
      setErrorExportar('No pudimos armar el Excel. Probá de nuevo.')
    }
    setExportando(false)
  }

  const esMesActual = mes === meses[0]
  const seccion = SECCIONES.find((s) => s.ruta === pathname.replace(/\/$/, '')) ?? SECCIONES[0]

  return (
    <div className="panel">
      <nav className="panel__menu" aria-label="Secciones del panel">
        <Marca />
        <ul>
          {SECCIONES.map((s) => (
            <li key={s.ruta}>
              <NavLink to={{ pathname: s.ruta, search }} end className="panel__enlace">
                {s.texto}
              </NavLink>
            </li>
          ))}
        </ul>
        <Link to="/" className="panel__enlace panel__volver">
          <ArrowLeft size={16} aria-hidden="true" />
          Volver a la app
        </Link>
        <div className="panel__cuenta">
          <strong>{org.nombre}</strong>
          <span>{NOMBRE_ROL[miembro.rol]}</span>
        </div>
      </nav>

      <main className="panel__contenido">
        <header className="panel__encabezado">
          <div>
            <div className="sobretitulo">
              {periodo.nombre}
              {esMesActual && ` · al ${hoy.getDate()}/${hoy.getMonth() + 1}`}
            </div>
            <h1>{seccion.texto === 'Resumen' ? 'Resumen de compras' : seccion.texto}</h1>
          </div>
          <div className="panel__filtros">
            <label className="campo">
              <span className="campo__etiqueta">Período</span>
              <select
                value={mes}
                onChange={(e) => filtrar('mes', e.target.value === meses[0] ? '' : e.target.value)}
              >
                {meses.map((m, i) => (
                  <option key={m} value={m}>
                    {i === 0 ? 'Este mes' : nombreMes(m)}
                  </option>
                ))}
              </select>
            </label>
            {locales.length > 1 && (
              <label className="campo">
                <span className="campo__etiqueta">Local</span>
                <select value={localId ?? ''} onChange={(e) => filtrar('local', e.target.value)}>
                  <option value="">Todos</option>
                  {locales.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="campo">
              <span className="campo__etiqueta">Proveedor</span>
              <select
                value={proveedorId ?? ''}
                onChange={(e) => filtrar('proveedor', e.target.value)}
              >
                <option value="">Todos</option>
                {[...catalogo.proveedores]
                  .sort((a, b) => a.nombre.localeCompare(b.nombre))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="boton boton--primario"
              onClick={exportar}
              disabled={!datos || cargando || exportando}
            >
              <Download size={18} aria-hidden="true" />
              {exportando ? 'Armando…' : 'Exportar a Excel'}
            </button>
          </div>
        </header>

        {errorExportar && (
          <p className="aviso aviso--error" role="alert">
            {errorExportar}
          </p>
        )}

        {error ? (
          <section className="card formulario">
            <p className="aviso aviso--error" role="alert">
              {error}
            </p>
            <button className="boton boton--primario" onClick={traer} disabled={cargando}>
              {cargando ? 'Probando…' : 'Probar de nuevo'}
            </button>
          </section>
        ) : !datos ? (
          <p className="texto-gris" aria-busy="true">
            Cargando el panel…
          </p>
        ) : (
          <div className="panel__seccion" aria-busy={cargando}>
            <Outlet
              context={
                {
                  catalogo,
                  datos,
                  periodo,
                  locales: nombresLocales,
                  proveedor,
                  recargar: traer,
                } satisfies ContextoPanel
              }
            />
          </div>
        )}
      </main>
    </div>
  )
}
