import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { linkDeFoto, marcarPagado, pasarAPagar } from '../../admin/acciones'
import {
  cambiosDePrecio,
  comprasPorProveedor,
  montoRecepcion,
  resumen,
  type RecepcionPanel,
} from '../../admin/resumen'
import { numero, pesos } from '../../lib/formato'
import { ESTADOS, EN_CURSO, numeroPedido, type EstadoPedido } from '../../pedidos/tipos'
import { usePanel } from './contexto'
import { diaMes, fechaHora } from '../../lib/tiempo'
import { Diferencias, TablaCambios, Vacio } from './partes'

function Estado({ estado }: { estado: string }) {
  const e = ESTADOS[estado as EstadoPedido]
  return <span className={`pastilla ${e?.clase ?? 'pastilla--gris'}`}>{e?.texto ?? estado}</span>
}

function Encabezado({ titulo, detalle }: { titulo: string; detalle?: string }) {
  return (
    <header className="bloque__encabezado">
      <h2>{titulo}</h2>
      {detalle && <span>{detalle}</span>}
    </header>
  )
}

// ─── Pedidos ───────────────────────────────────────────────────────────────

const FILTROS_PEDIDOS = {
  todos: { texto: 'Todos', estados: null },
  curso: { texto: 'En curso', estados: EN_CURSO },
  pagados: { texto: 'Pagados', estados: ['pagado'] },
  cancelados: { texto: 'Cancelados', estados: ['cancelado', 'borrador'] },
} as const

export function PedidosPanel() {
  const { datos, proveedor, locales } = usePanel()
  const [filtro, setFiltro] = useState<keyof typeof FILTROS_PEDIDOS>('todos')
  const estados = FILTROS_PEDIDOS[filtro].estados as readonly string[] | null
  const lista = datos.pedidos.filter((p) => !estados || estados.includes(p.estado))
  const estimado = lista.reduce((s, p) => s + (p.estimado ?? 0), 0)

  return (
    <section className="bloque">
      <Encabezado
        titulo="Pedidos del período"
        detalle={`${lista.length} · estimado ${pesos(estimado)}`}
      />
      <div className="chips bloque__chips" role="group" aria-label="Filtrar pedidos">
        {Object.entries(FILTROS_PEDIDOS).map(([clave, f]) => (
          <button
            key={clave}
            className="chip"
            aria-pressed={filtro === clave}
            onClick={() => setFiltro(clave as keyof typeof FILTROS_PEDIDOS)}
          >
            {f.texto}
          </button>
        ))}
      </div>
      {!lista.length ? (
        <Vacio>No hay pedidos para mostrar.</Vacio>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              {locales.size > 1 && <th>Local</th>}
              <th>Estado</th>
              <th className="tabla__numero">Estimado</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td className="tabla__numero">
                  <Link to={`/pedidos/${p.id}`}>{numeroPedido(p.numero)}</Link>
                </td>
                <td className="tabla__gris">{fechaHora(p.creado_at)}</td>
                <td className="tabla__fuerte">{proveedor(p.proveedor_id)}</td>
                {locales.size > 1 && <td>{locales.get(p.local_id)}</td>}
                <td>
                  <Estado estado={p.estado} />
                </td>
                <td className="tabla__numero">{p.estimado === null ? '—' : pesos(p.estimado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

// ─── Recepciones y remitos ────────────────────────────────────────────────

export function RecepcionesPanel() {
  const { datos, proveedor } = usePanel()
  const [abierta, setAbierta] = useState<string | null>(null)
  const conDiferencias = datos.recepciones.filter((x) => x.diferencias.length > 0)

  return (
    <>
      <section className="bloque">
        <Encabezado
          titulo="Recepciones del período"
          detalle={`${datos.recepciones.length} · ${pesos(resumen(datos.recepciones, []).compras)}`}
        />
        {!datos.recepciones.length ? (
          <Vacio>No se recibió mercadería en este período.</Vacio>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th aria-label="Abrir" />
                <th>Llegó</th>
                <th>Proveedor</th>
                <th className="tabla__numero">Remito</th>
                <th className="tabla__numero">Pedido</th>
                <th>Cargado</th>
                <th className="tabla__numero">Total</th>
              </tr>
            </thead>
            <tbody>
              {datos.recepciones.map((x) => (
                <FilaRecepcion
                  key={x.id}
                  recepcion={x}
                  abierta={abierta === x.id}
                  alternar={() => setAbierta(abierta === x.id ? null : x.id)}
                  proveedor={proveedor(x.proveedor_id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="bloque">
        <Encabezado titulo="Diferencias" detalle="seguí cada reclamo hasta resolverlo" />
        <Diferencias recepciones={conDiferencias} />
      </section>
    </>
  )
}

const RESULTADO: Record<string, { texto: string; clase: string }> = {
  ok: { texto: 'Bien', clase: 'pastilla--ok' },
  faltante: { texto: 'Faltó', clase: 'pastilla--error' },
  exceso: { texto: 'De más', clase: 'pastilla--atencion' },
  no_pedido: { texto: 'No pedido', clase: 'pastilla--atencion' },
  precio_subio: { texto: 'Subió el precio', clase: 'pastilla--atencion' },
  precio_bajo: { texto: 'Bajó el precio', clase: 'pastilla--info' },
}

function FilaRecepcion({
  recepcion: x,
  abierta,
  alternar,
  proveedor,
}: {
  recepcion: RecepcionPanel
  abierta: boolean
  alternar: () => void
  proveedor: string
}) {
  const { catalogo } = usePanel()
  const [foto, setFoto] = useState<{ url: string } | { error: string } | null>(null)
  const [pidiendo, setPidiendo] = useState(false)
  const producto = (id: string | null) => catalogo.productos.find((p) => p.id === id)
  const unidad = (id: string | null) =>
    catalogo.unidades.find((u) => u.id === producto(id)?.unidad_base_id)?.nombre ?? ''

  async function verFoto() {
    if (!x.foto_path) return
    setPidiendo(true)
    setFoto(await linkDeFoto(x.foto_path))
    setPidiendo(false)
  }

  return (
    <>
      <tr className={abierta ? 'tabla__abierta' : undefined}>
        <td>
          <button
            className="boton-icono"
            onClick={alternar}
            aria-expanded={abierta}
            aria-label={abierta ? 'Cerrar detalle' : 'Ver detalle'}
          >
            {abierta ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
        </td>
        <td className="tabla__gris">{fechaHora(x.recibido_at)}</td>
        <td className="tabla__fuerte">
          {proveedor}
          {x.diferencias.length > 0 && (
            <span className="pastilla pastilla--error tabla__nota">
              {x.diferencias.length} {x.diferencias.length === 1 ? 'diferencia' : 'diferencias'}
            </span>
          )}
        </td>
        <td className="tabla__numero">{x.nro_remito ?? '—'}</td>
        <td className="tabla__numero">
          {x.pedido_numero === null ? (
            <span className="tabla__gris tabla__texto">Sin pedido</span>
          ) : (
            numeroPedido(x.pedido_numero)
          )}
        </td>
        <td>{x.origen === 'ia' ? 'Con IA' : 'A mano'}</td>
        <td className="tabla__numero tabla__fuerte">{pesos(montoRecepcion(x))}</td>
      </tr>
      {abierta && (
        <tr className="tabla__detalle">
          <td colSpan={7}>
            {x.observaciones && (
              <p className="aviso aviso--atencion detalle-recepcion__aviso">{x.observaciones}</p>
            )}
            <div className="detalle-recepcion">
              <table className="tabla tabla--chica">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="tabla__numero">Pedido</th>
                    <th className="tabla__numero">Llegó</th>
                    <th className="tabla__numero">Precio</th>
                    <th className="tabla__numero">Subtotal</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {x.items.map((i, n) => (
                    <tr key={n}>
                      <td>{producto(i.producto_id)?.nombre ?? 'Sin producto'}</td>
                      <td className="tabla__numero tabla__gris">
                        {i.cantidad_pedida_base === null
                          ? '—'
                          : `${numero(i.cantidad_pedida_base)} ${unidad(i.producto_id)}`}
                      </td>
                      <td className="tabla__numero">
                        {i.cantidad_base === null
                          ? '—'
                          : `${numero(i.cantidad_base)} ${unidad(i.producto_id)}`}
                      </td>
                      <td className="tabla__numero">
                        {i.precio_unit_base === null ? '—' : pesos(i.precio_unit_base)}
                      </td>
                      <td className="tabla__numero">
                        {i.subtotal === null ? '—' : pesos(i.subtotal)}
                      </td>
                      <td>
                        <span
                          className={`pastilla ${RESULTADO[i.resultado]?.clase ?? 'pastilla--gris'}`}
                        >
                          {RESULTADO[i.resultado]?.texto ?? i.resultado}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="detalle-recepcion__foto">
                <Link
                  className="boton boton--secundario boton--chico"
                  to={`/recibir/corregir/${x.id}`}
                >
                  Corregir esta recepción
                </Link>
                {!x.foto_path ? (
                  <p className="bloque__vacio">Se cargó sin foto.</p>
                ) : foto && 'url' in foto ? (
                  <a href={foto.url} target="_blank" rel="noreferrer">
                    <img src={foto.url} alt={`Remito ${x.nro_remito ?? ''} de ${proveedor}`} />
                  </a>
                ) : (
                  <>
                    <button
                      className="boton boton--secundario"
                      onClick={verFoto}
                      disabled={pidiendo}
                    >
                      {pidiendo ? 'Buscando…' : 'Ver foto del remito'}
                    </button>
                    {foto && 'error' in foto && (
                      <p className="aviso aviso--error" role="alert">
                        {foto.error}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Proveedores y productos ─────────────────────────────────────────────

export function ProveedoresPanel() {
  const { datos, catalogo, proveedor } = usePanel()
  const compras = comprasPorProveedor(datos.recepciones)
  const conPedidos = new Set(datos.pedidos.map((p) => p.proveedor_id))
  const ids = [...new Set([...compras.map((c) => c.proveedor_id), ...conPedidos])]

  const filas = ids.map((id) => {
    const r = resumen(
      datos.recepciones.filter((x) => x.proveedor_id === id),
      datos.pedidos.filter((p) => p.proveedor_id === id),
    )
    return {
      id,
      ...r,
      productos: catalogo.productos.filter((p) => p.proveedor_id === id && p.activo).length,
    }
  })

  return (
    <>
      <section className="bloque">
        <Encabezado titulo="Proveedores con movimiento" detalle={`${filas.length} en el período`} />
        {!filas.length ? (
          <Vacio>No hubo pedidos ni recepciones en este período.</Vacio>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th className="tabla__numero">Compras</th>
                <th className="tabla__numero">Pedidos</th>
                <th className="tabla__numero">Cumplimiento</th>
                <th className="tabla__numero">Diferencias</th>
                <th className="tabla__numero">Productos</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td className="tabla__fuerte">
                    <Link to={`/proveedores/${f.id}`}>{proveedor(f.id)}</Link>
                  </td>
                  <td className="tabla__numero tabla__fuerte">{pesos(f.compras)}</td>
                  <td className="tabla__numero">{f.pedidos}</td>
                  <td
                    className={`tabla__numero ${f.cumplimiento !== null && f.cumplimiento < 90 ? 'tabla__error' : ''}`}
                  >
                    {f.cumplimiento === null ? '—' : `${f.cumplimiento}%`}
                  </td>
                  <td
                    className={`tabla__numero ${f.diferencias > 0 ? 'tabla__error' : 'tabla__gris'}`}
                  >
                    {f.diferencias > 0 ? pesos(f.diferencias) : '—'}
                  </td>
                  <td className="tabla__numero tabla__gris">{f.productos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="bloque">
        <Encabezado
          titulo="Catálogo"
          detalle={`${catalogo.proveedores.filter((p) => p.activo).length} proveedores · ${catalogo.productos.filter((p) => p.activo).length} productos`}
        />
        <div className="bloque__acciones">
          <Link className="boton boton--secundario" to="/proveedores">
            Ver proveedores y productos
          </Link>
          <Link className="boton boton--secundario" to="/proveedores/nuevo">
            Nuevo proveedor
          </Link>
          <Link className="boton boton--secundario" to="/proveedores/importar">
            Importar desde Excel
          </Link>
        </div>
      </section>
    </>
  )
}

// ─── Precios ───────────────────────────────────────────────────────────────

export function PreciosPanel() {
  const { datos, periodo } = usePanel()
  const [filtro, setFiltro] = useState<'todos' | 'aumentos' | 'bajas' | 'revisar'>('todos')
  const cambios = cambiosDePrecio(datos.precios, periodo.desde, periodo.hasta)
  const lista = cambios.filter((c) =>
    filtro === 'aumentos'
      ? !c.saltoRaro && c.variacionPct > 0
      : filtro === 'bajas'
        ? !c.saltoRaro && c.variacionPct < 0
        : filtro === 'revisar'
          ? c.saltoRaro
          : true,
  )
  const opciones = {
    todos: `Todos (${cambios.length})`,
    aumentos: `Aumentos (${cambios.filter((c) => !c.saltoRaro && c.variacionPct > 0).length})`,
    bajas: `Bajas (${cambios.filter((c) => !c.saltoRaro && c.variacionPct < 0).length})`,
    revisar: `Revisar unidad (${cambios.filter((c) => c.saltoRaro).length})`,
  }

  return (
    <section className="bloque">
      <Encabezado titulo="Cambios de precio" detalle="contra la compra anterior de cada producto" />
      <div className="chips bloque__chips" role="group" aria-label="Filtrar cambios">
        {Object.entries(opciones).map(([clave, texto]) => (
          <button
            key={clave}
            className="chip"
            aria-pressed={filtro === clave}
            onClick={() => setFiltro(clave as typeof filtro)}
          >
            {texto}
          </button>
        ))}
      </div>
      <TablaCambios cambios={lista} />
    </section>
  )
}

// ─── Pagos ───────────────────────────────────────────────────────────────

export function PagosPanel() {
  const { datos, proveedor, recargar } = usePanel()
  const [guardando, setGuardando] = useState<string | null>(null)
  const [error, setError] = useState('')
  const aPagar = datos.aPagar.filter((p) => p.estado === 'a_pagar')
  const revisar = datos.aPagar.filter((p) => p.estado === 'revisar')
  const pagados = datos.pedidos.filter((p) => p.estado === 'pagado')
  const total = aPagar.reduce((s, p) => s + (p.monto ?? 0), 0)

  async function hacer(
    id: string,
    accion: (id: string) => Promise<{ ok: true } | { ok: false; mensaje: string }>,
  ) {
    setGuardando(id)
    setError('')
    const r = await accion(id)
    if (r.ok) await recargar()
    else setError(r.mensaje)
    setGuardando(null)
  }

  const fila = (p: (typeof datos.aPagar)[number], boton: ReactNode) => (
    <tr key={p.id}>
      <td className="tabla__numero">
        <Link to={`/pedidos/${p.id}`}>{numeroPedido(p.numero)}</Link>
      </td>
      <td className="tabla__fuerte">{proveedor(p.proveedor_id)}</td>
      <td className="tabla__gris">{p.recibido_at ? diaMes(p.recibido_at) : '—'}</td>
      <td className="tabla__numero tabla__fuerte">{p.monto === null ? '—' : pesos(p.monto)}</td>
      <td className="tabla__accion">{boton}</td>
    </tr>
  )

  return (
    <>
      {error && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}
      <section className="bloque">
        <Encabezado
          titulo="A pagar"
          detalle={`${aPagar.length} · ${pesos(total)} · de cualquier fecha`}
        />
        {!aPagar.length ? (
          <Vacio>No hay nada esperando pago.</Vacio>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Proveedor</th>
                <th>Llegó</th>
                <th className="tabla__numero">Monto</th>
                <th aria-label="Acción" />
              </tr>
            </thead>
            <tbody>
              {aPagar.map((p) =>
                fila(
                  p,
                  <button
                    className="boton boton--primario boton--chico"
                    disabled={guardando === p.id}
                    onClick={() => hacer(p.id, marcarPagado)}
                  >
                    {guardando === p.id ? 'Guardando…' : 'Marcar pagado'}
                  </button>,
                ),
              )}
            </tbody>
          </table>
        )}
      </section>

      {revisar.length > 0 && (
        <section className="bloque">
          <Encabezado titulo="Para revisar antes de pagar" detalle="llegaron con diferencias" />
          <table className="tabla">
            <tbody>
              {revisar.map((p) =>
                fila(
                  p,
                  <button
                    className="boton boton--secundario boton--chico"
                    disabled={guardando === p.id}
                    onClick={() => hacer(p.id, pasarAPagar)}
                  >
                    {guardando === p.id ? 'Guardando…' : 'Ya está, pasar a pagar'}
                  </button>,
                ),
              )}
            </tbody>
          </table>
        </section>
      )}

      <section className="bloque">
        <Encabezado titulo="Pagados" detalle="pedidos del período" />
        {!pagados.length ? (
          <Vacio>Todavía no se marcó ningún pago de este período.</Vacio>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Proveedor</th>
                <th>Pagado</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {pagados.map((p) => (
                <tr key={p.id}>
                  <td className="tabla__numero">
                    <Link to={`/pedidos/${p.id}`}>{numeroPedido(p.numero)}</Link>
                  </td>
                  <td className="tabla__fuerte">{proveedor(p.proveedor_id)}</td>
                  <td className="tabla__gris">{p.pagado_at ? diaMes(p.pagado_at) : '—'}</td>
                  <td>
                    <Estado estado={p.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
