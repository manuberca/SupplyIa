import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { History, Minus, Plus, Search, Send } from 'lucide-react'
import { EsperarCatalogo } from '../../catalogo/EsperarCatalogo'
import type { Catalogo, Producto, Proveedor } from '../../catalogo/tipos'
import { TituloPantalla } from '../../components/TituloPantalla'
import { leerNumero, numero, pesos, porcentaje } from '../../lib/formato'
import { normalizar } from '../../lib/normalizar'
import { hace, textoProximaEntrega } from '../../lib/tiempo'
import { useCola } from '../../offline/contexto'
import type { PedidoParaGuardar } from '../../offline/cola'
import { mensajeDelPedido, renglones } from '../../pedidos/armar'
import {
  borrarBorrador,
  guardarBorrador,
  leerBorrador,
  type Borrador,
} from '../../pedidos/borrador'
import { masBaratoEnOtro } from '../../control/comparar'
import { useControl } from '../../control/contexto'
import { usePedidos } from '../../pedidos/contexto'
import { enlaceWhatsapp, estimado, plural, textoCantidad } from '../../pedidos/logica'
import { sugerirPedido, type CompraAnterior, type Sugerencia } from '../../pedidos/sugerido'
import { useSesionLista } from '../../sesion/contexto'

export function NuevoPedido() {
  const { proveedorId } = useParams()
  return (
    <EsperarCatalogo>
      {(catalogo) => {
        const proveedor = catalogo.proveedores.find((p) => p.id === proveedorId && p.activo)
        if (!proveedor) {
          return (
            <>
              <TituloPantalla titulo="Nuevo pedido" volver="/pedir" />
              <p className="aviso aviso--error">
                No encontramos ese proveedor, o está archivado. Elegí otro.
              </p>
            </>
          )
        }
        return <Formulario key={proveedor.id} catalogo={catalogo} proveedor={proveedor} />
      }}
    </EsperarCatalogo>
  )
}

function Formulario({ catalogo, proveedor }: { catalogo: Catalogo; proveedor: Proveedor }) {
  const navigate = useNavigate()
  const { usuario, org, local } = useSesionLista()
  const { agregarPedido } = useCola()
  const [id] = useState(() => crypto.randomUUID())
  // Si viene de "Repetir este pedido": qué quedó afuera porque ya no se puede pedir igual.
  const repetido = useLocation().state as { repetido?: boolean; omitidos?: string[] } | null
  const [borrador, setBorrador] = useState<Borrador>(
    () => leerBorrador(usuario.id, proveedor.id) ?? { cantidades: {}, observaciones: '' },
  )
  const [busqueda, setBusqueda] = useState('')
  const [verObservaciones, setVerObservaciones] = useState(() => !!borrador.observaciones)
  const [error, setError] = useState('')

  // Todo lo que se carga queda en el celular hasta enviarlo.
  useEffect(() => {
    guardarBorrador(usuario.id, proveedor.id, borrador)
  }, [usuario.id, proveedor.id, borrador])

  const productos = catalogo.productos.filter((p) => p.proveedor_id === proveedor.id && p.activo)

  // Pedido sugerido: lo que se le viene pidiendo a este proveedor (o, si todavía no hay
  // pedidos hechos con la app, lo que se le vino recibiendo).
  const { pedidos } = usePedidos()
  const control = useControl()
  const renglonesRecibidos = control.estado === 'listo' ? control.datos.renglones : null
  const sugerido = useMemo(() => {
    const dePedidos: CompraAnterior[] = pedidos
      .filter(
        (p) => p.proveedor_id === proveedor.id && !['borrador', 'cancelado'].includes(p.estado),
      )
      .map((p) => ({
        fecha: p.creado_at,
        items: p.items.map((i) => ({
          productoId: i.producto_id,
          cantidad: i.cantidad,
          presentacionId: i.presentacion_id,
        })),
      }))
    let origen: 'pedidos' | 'recibido' = 'pedidos'
    let resultado = sugerirPedido(dePedidos)
    if (resultado.sugerencias.length === 0 && renglonesRecibidos) {
      const porRecepcion = new Map<string, CompraAnterior>()
      for (const r of renglonesRecibidos) {
        if (r.proveedor_id !== proveedor.id || !r.producto_id || !r.cantidad_base) continue
        const compra = porRecepcion.get(r.recepcion_id) ?? { fecha: r.recibido_at, items: [] }
        compra.items.push({
          productoId: r.producto_id,
          cantidad: r.cantidad_base,
          presentacionId: null,
        })
        porRecepcion.set(r.recepcion_id, compra)
      }
      origen = 'recibido'
      resultado = sugerirPedido([...porRecepcion.values()], { redondear: true })
    }
    // Solo lo que hoy se puede pedir igual (producto activo, presentación que existe).
    const validas = resultado.sugerencias.filter(
      (s) =>
        catalogo.productos.some((p) => p.id === s.productoId && p.activo) &&
        (s.presentacionId === null ||
          catalogo.presentaciones.some((x) => x.id === s.presentacionId)),
    )
    return {
      origen,
      compras: resultado.compras,
      porProducto: new Map(validas.map((s) => [s.productoId, s])),
    }
  }, [pedidos, renglonesRecibidos, proveedor.id, catalogo])
  const sinCantidad = (productoId: string) => !borrador.cantidades[productoId]?.texto.trim()
  // "Usar sugerido" carga solo lo habitual; el resto guía la cantidad en cada producto.
  const porSugerir = [...sugerido.porProducto.values()].filter(
    (s) => s.habitual && sinCantidad(s.productoId),
  )

  function usarSugerido() {
    setBorrador((b) => {
      const cantidades = { ...b.cantidades }
      for (const s of sugerido.porProducto.values()) {
        if (!s.habitual || cantidades[s.productoId]?.texto.trim()) continue
        cantidades[s.productoId] = {
          texto: numero(s.cantidad, 3),
          presentacionId: s.presentacionId,
        }
      }
      return { ...b, cantidades }
    })
  }

  const q = normalizar(busqueda)
  const visibles = q ? productos.filter((p) => normalizar(p.nombre).includes(q)) : productos

  // Los renglones del pedido: solo los que tienen una cantidad mayor a 0.
  const items = useMemo(
    () =>
      productos.flatMap((p) => {
        const c = borrador.cantidades[p.id]
        const cantidad = c ? leerNumero(c.texto) : null
        if (!c || cantidad === null || cantidad <= 0) return []
        return [
          {
            id: `${id}:${p.id}`,
            producto_id: p.id,
            presentacion_id: c.presentacionId,
            cantidad,
            precio_estimado_base: catalogo.precios.get(p.id)?.precio_base ?? null,
          },
        ]
      }),
    [productos, borrador.cantidades, catalogo.precios, id],
  )
  const lista = renglones(items, catalogo)
  const e = estimado(lista)
  const mensaje = mensajeDelPedido(lista, {
    organizacion: org.nombre,
    local: local?.nombre ?? null,
    observaciones: borrador.observaciones,
  })

  function cambiar(productoId: string, cambios: Partial<Borrador['cantidades'][string]>) {
    setBorrador((b) => {
      const actual = b.cantidades[productoId] ?? { texto: '', presentacionId: null }
      return { ...b, cantidades: { ...b.cantidades, [productoId]: { ...actual, ...cambios } } }
    })
  }

  async function enviar(evento: MouseEvent<HTMLAnchorElement>) {
    // El enlace abre WhatsApp solo (así el celular no lo bloquea); acá se guarda el pedido.
    if (!local || items.length === 0) {
      evento.preventDefault()
      return
    }
    setError('')
    const ahora = new Date().toISOString()
    const pedido: PedidoParaGuardar = {
      id,
      local_id: local.id,
      proveedor_id: proveedor.id,
      observaciones: borrador.observaciones.trim(),
      creado_at: ahora,
      enviado_at: ahora,
      // El id de cada renglón también lo genera la app (reintentar no duplica).
      items: items.map((i) => ({ ...i, id: crypto.randomUUID() })),
    }
    const guardado = await agregarPedido(pedido)
    if (!guardado) {
      setError(
        'El celular no dejó guardar el pedido. No cierres la app hasta que diga que se subió.',
      )
    }
    borrarBorrador(usuario.id, proveedor.id)
    navigate(`/pedidos/${id}?enviado=1`, { replace: true })
  }

  if (!local) {
    return (
      <>
        <TituloPantalla titulo="Nuevo pedido" volver="/pedir" />
        <p className="aviso aviso--atencion">
          Tu usuario no tiene un local asignado. Pedile a quien administra tu bar que te asigne uno.
        </p>
      </>
    )
  }

  const puedeEnviar = items.length > 0

  const cabeceraProveedor = (
    <section className="cabecera-proveedor" aria-label="Proveedor">
      <div>
        <div className="sobretitulo">Proveedor</div>
        <p className="cabecera-proveedor__nombre">{proveedor.nombre}</p>
        <div className="cabecera-proveedor__detalle">
          {textoProximaEntrega(proveedor.dias_entrega)}
          {proveedor.hora_limite ? ` · pedir antes de ${proveedor.hora_limite}` : ''}
        </div>
      </div>
      <Link to="/pedir" className="enlace-accion">
        Cambiar
      </Link>
    </section>
  )

  return (
    <>
      <TituloPantalla titulo="Nuevo pedido" volver="/pedir" />

      {productos.length === 0 && cabeceraProveedor}

      {productos.length === 0 ? (
        <section className="card formulario">
          <p className="formulario__ayuda">
            <strong>{proveedor.nombre} todavía no tiene productos.</strong> Cargalos en su ficha y
            volvé para pedir.
          </p>
          <Link
            to={`/proveedores/${proveedor.id}/productos/nuevo`}
            className="boton boton--primario"
          >
            Agregar producto
          </Link>
        </section>
      ) : (
        // En computadora: productos a la izquierda y el pedido siempre a la vista a la derecha.
        <div className="dos-columnas">
          <div className="dos-columnas__principal">
            {repetido?.repetido && (
              <p className="aviso aviso--info" role="status">
                Cargamos las cantidades del pedido anterior. Revisalas y mandalo.
                {repetido.omitidos?.length
                  ? ` No se pudo repetir: ${repetido.omitidos.join(', ')}.`
                  : ''}
              </p>
            )}
            {cabeceraProveedor}
            {productos.length > 5 && (
              <label className="buscador">
                <Search size={18} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Buscar producto"
                  aria-label="Buscar producto"
                  value={busqueda}
                  onChange={(ev) => setBusqueda(ev.target.value)}
                />
              </label>
            )}

            {porSugerir.length > 0 && (
              <section className="sugerido" aria-label="Pedido sugerido">
                <History size={20} aria-hidden="true" />
                <div className="lista__texto">
                  <span className="lista__titulo">Lo de siempre</span>
                  <span className="lista__detalle">
                    {porSugerir.length} {porSugerir.length === 1 ? 'producto' : 'productos'} que le{' '}
                    {sugerido.origen === 'pedidos' ? 'venís pidiendo' : 'venís comprando'}, según{' '}
                    {sugerido.origen === 'pedidos' ? 'tus últimos' : 'las últimas'}{' '}
                    {sugerido.compras} {sugerido.origen === 'pedidos' ? 'pedidos' : 'entregas'}.
                  </span>
                </div>
                <button className="boton boton--secundario boton--chico" onClick={usarSugerido}>
                  {items.length > 0 ? 'Completar' : 'Usar sugerido'}
                </button>
              </section>
            )}

            <div className="sobretitulo">Lo que le comprás · último precio pagado</div>
            <section className="lista" aria-label="Productos">
              {visibles.length === 0 && (
                <p className="lista__vacia">Ningún producto coincide con la búsqueda.</p>
              )}
              {visibles.map((p) => (
                <FilaProducto
                  key={p.id}
                  catalogo={catalogo}
                  producto={p}
                  valor={borrador.cantidades[p.id] ?? { texto: '', presentacionId: null }}
                  sugerencia={sinCantidad(p.id) ? sugerido.porProducto.get(p.id) : undefined}
                  onCambiar={(c) => cambiar(p.id, c)}
                />
              ))}
            </section>

            {verObservaciones ? (
              <label className="campo">
                <span className="campo__etiqueta">Observaciones para el proveedor</span>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={borrador.observaciones}
                  onChange={(ev) => setBorrador((b) => ({ ...b, observaciones: ev.target.value }))}
                  placeholder="Ej: entregar antes de las 11"
                />
              </label>
            ) : (
              <button className="enlace-accion" onClick={() => setVerObservaciones(true)}>
                <Plus size={16} aria-hidden="true" />
                Agregar observaciones
              </button>
            )}
          </div>
          <aside className="dos-columnas__lateral">
            {error && (
              <p className="aviso aviso--error" role="alert">
                {error}
              </p>
            )}

            <section className="resumen-pedido" aria-label="Resumen del pedido">
              {puedeEnviar && (
                <ul
                  className="resumen-pedido__lista solo-escritorio"
                  aria-label="Lo que vas pidiendo"
                >
                  {lista.map((r) => (
                    <li key={r.id}>
                      <span>{r.producto}</span>
                      <span className="mono">{r.cantidadTexto}</span>
                    </li>
                  ))}
                </ul>
              )}
              {puedeEnviar ? (
                <div className="resumen-pedido__fila">
                  <div>
                    <div className="lista__titulo">
                      {lista.length} {lista.length === 1 ? 'producto' : 'productos'} · estimado
                    </div>
                    <div className="lista__detalle">
                      con los últimos precios pagados
                      {e.sinPrecio > 0 && ` · ${e.sinPrecio} sin precio`}
                    </div>
                  </div>
                  <div className="resumen-pedido__total">
                    {e.sinPrecio === lista.length ? '—' : pesos(e.total)}
                  </div>
                </div>
              ) : (
                <p className="lista__detalle">Elegí cantidades con − y + para armar el pedido.</p>
              )}
              <a
                className="boton boton--enviar"
                href={puedeEnviar ? enlaceWhatsapp(proveedor.whatsapp, mensaje) : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!puedeEnviar}
                onClick={enviar}
              >
                <Send size={18} aria-hidden="true" />
                Enviar por WhatsApp
              </a>
            </section>
          </aside>
        </div>
      )}
    </>
  )
}

function FilaProducto({
  catalogo,
  producto,
  valor,
  sugerencia,
  onCambiar,
}: {
  catalogo: Catalogo
  producto: Producto
  valor: Borrador['cantidades'][string]
  /** Lo que se suele pedir de este producto, si todavía no se cargó una cantidad. */
  sugerencia?: Sugerencia
  onCambiar: (c: Partial<Borrador['cantidades'][string]>) => void
}) {
  const unidad = catalogo.unidades.find((u) => u.id === producto.unidad_base_id)
  const presentaciones = catalogo.presentaciones.filter((p) => p.producto_id === producto.id)
  const presentacion = presentaciones.find((p) => p.id === valor.presentacionId) ?? null
  const precio = catalogo.precios.get(producto.id)
  // El mismo producto, marcado como comparable, en otro proveedor que lo tiene más barato.
  const otro = producto.comparable_id ? masBaratoEnOtro(producto, catalogo, new Date()) : null
  const cantidad = leerNumero(valor.texto) ?? 0
  // "5 unidades", "2 cajas": en plural salvo que sea 1 (kg, g y lt no cambian).
  const nombreUnidad = presentacion ? presentacion.nombre.toLowerCase() : (unidad?.nombre ?? '')
  const seCuenta = !!presentacion || unidad?.tipo === 'unidad'
  const unidadVisible =
    seCuenta && cantidad !== 1 && cantidad > 0 ? plural(nombreUnidad) : nombreUnidad

  const sumar = (delta: number) => {
    const nueva = Math.max(0, Math.round((cantidad + delta) * 1000) / 1000)
    onCambiar({ texto: nueva > 0 ? numero(nueva, 3) : '' })
  }

  return (
    <div className="producto-pedido">
      <div className="producto-pedido__fila">
        <div className="lista__texto">
          <span className="lista__titulo">{producto.nombre}</span>
          <span className="producto-pedido__precio">
            {precio
              ? `${pesos(precio.precio_base)}/${unidad?.nombre ?? ''} · ${hace(precio.fecha)}`
              : 'Sin precio anterior'}
          </span>
        </div>
        <div className="stepper" data-activo={cantidad > 0}>
          <button
            type="button"
            aria-label={`Menos ${producto.nombre}`}
            disabled={cantidad <= 0}
            onClick={() => sumar(-1)}
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <input
            inputMode="decimal"
            aria-label={`Cantidad de ${producto.nombre} en ${nombreUnidad}`}
            placeholder="0"
            value={valor.texto}
            onChange={(ev) => onCambiar({ texto: ev.target.value.replace(/[^\d.,]/g, '') })}
          />
          <span className="stepper__unidad" aria-hidden="true">
            {unidadVisible}
          </span>
          <button type="button" aria-label={`Más ${producto.nombre}`} onClick={() => sumar(1)}>
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      {otro && (
        <span className="mas-barato">
          Más barato en {catalogo.proveedores.find((p) => p.id === otro.proveedorId)?.nombre}:{' '}
          {pesos(otro.precio)}/{unidad?.nombre} ({porcentaje(-otro.menosPct)})
        </span>
      )}
      {sugerencia && unidad && (
        <button
          type="button"
          className="sugerencia"
          onClick={() =>
            onCambiar({
              texto: numero(sugerencia.cantidad, 3),
              presentacionId: sugerencia.presentacionId,
            })
          }
        >
          <History size={14} aria-hidden="true" />
          Lo de siempre:{' '}
          {textoCantidad(
            sugerencia.cantidad,
            unidad,
            presentaciones.find((p) => p.id === sugerencia.presentacionId),
          )}
        </button>
      )}
      {presentaciones.length > 0 && unidad && (
        <div
          className="chips chips--chicos"
          role="group"
          aria-label={`Unidad de ${producto.nombre}`}
        >
          <button
            type="button"
            className="chip"
            aria-pressed={!presentacion}
            onClick={() => onCambiar({ presentacionId: null })}
          >
            {unidad.nombre}
          </button>
          {presentaciones.map((p) => (
            <button
              key={p.id}
              type="button"
              className="chip"
              aria-pressed={presentacion?.id === p.id}
              onClick={() => onCambiar({ presentacionId: p.id })}
            >
              {p.nombre} · {p.aproximada ? '≈' : ''}
              {numero(p.factor_a_base, 4)}
              {unidad.tipo === 'unidad' ? '' : ` ${unidad.nombre}`}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
