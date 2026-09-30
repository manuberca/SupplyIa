import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useParams } from 'react-router'
import {
  Camera,
  CheckCircle2,
  FileText,
  MessageCircle,
  PencilLine,
  Plus,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react'
import { EsperarCatalogo } from '../../catalogo/EsperarCatalogo'
import type { Catalogo, Proveedor } from '../../catalogo/tipos'
import { TituloPantalla } from '../../components/TituloPantalla'
import { reportar } from '../../lib/errores'
import { leerNumero, numero, pesos } from '../../lib/formato'
import { cantidadBase } from '../../lib/presentaciones'
import { hace } from '../../lib/tiempo'
import type { RecepcionParaGuardar } from '../../offline/cola'
import { useCola } from '../../offline/contexto'
import { usePedidos } from '../../pedidos/contexto'
import { enlaceWhatsapp } from '../../pedidos/logica'
import { numeroPedido, type Pedido } from '../../pedidos/tipos'
import {
  conciliar,
  type Fila,
  type ProductoConciliable,
  type RenglonRemito,
} from '../../recepcion/conciliar'
import { chequearCuentas } from '../../recepcion/cuentas'
import { comprimirFoto, type FotoLista } from '../../recepcion/foto'
import type { Lectura } from '../../recepcion/lectura'
import { leerRemito, subirFoto } from '../../recepcion/leer'
import { validarRemito } from '../../recepcion/validar'
import { useSesionLista } from '../../sesion/contexto'

export function NuevaRecepcion() {
  const { pedidoId, proveedorId } = useParams()
  const { pedidos, estado } = usePedidos()
  return (
    <EsperarCatalogo>
      {(catalogo) => {
        const pedido = pedidoId ? pedidos.find((p) => p.id === pedidoId && !p.subida) : undefined
        const proveedor = catalogo.proveedores.find(
          (p) => p.id === (pedido?.proveedor_id ?? proveedorId),
        )
        if (pedidoId && !pedido && estado === 'cargando')
          return <p className="texto-gris">Cargando el pedido…</p>
        if (!proveedor || (pedidoId && !pedido)) {
          return (
            <>
              <TituloPantalla titulo="Recepción" volver="/recibir" />
              <p className="aviso aviso--error">
                No encontramos ese pedido en este local. Elegilo de nuevo.
              </p>
            </>
          )
        }
        return (
          <Recepcion
            key={pedido?.id ?? proveedor.id}
            catalogo={catalogo}
            proveedor={proveedor}
            pedido={pedido ?? null}
          />
        )
      }}
    </EsperarCatalogo>
  )
}

type Paso = 'foto' | 'leyendo' | 'revision' | 'listo'
type Correccion = RecepcionParaGuardar['correcciones'][number]

function Recepcion({
  catalogo,
  proveedor,
  pedido,
}: {
  catalogo: Catalogo
  proveedor: Proveedor
  pedido: Pedido | null
}) {
  const { org, local } = useSesionLista()
  const { agregarRecepcion, enLinea } = useCola()
  const [id] = useState(() => crypto.randomUUID())
  const [paso, setPaso] = useState<Paso>('foto')
  const [origen, setOrigen] = useState<'ia' | 'manual'>('manual')
  const [foto, setFoto] = useState<FotoLista | null>(null)
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [duplicado, setDuplicado] = useState<string | null>(null)
  const [renglones, setRenglones] = useState<RenglonRemito[]>([])
  const [nroRemito, setNroRemito] = useState('')
  // El total que dice la boleta (distinto de la suma de precios unitarios: puede traer IVA).
  const [totalBoleta, setTotalBoleta] = useState('')
  const [correcciones, setCorrecciones] = useState<Correccion[]>([])
  const [editando, setEditando] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [recibidoAt] = useState(() => new Date().toISOString())
  const entrada = useRef<HTMLInputElement>(null)

  // Los productos de este proveedor, con su último precio antes de esta recepción.
  const productos = useMemo(() => {
    const mapa = new Map<string, ProductoConciliable>()
    for (const p of catalogo.productos.filter((x) => x.proveedor_id === proveedor.id)) {
      const unidad = catalogo.unidades.find((u) => u.id === p.unidad_base_id)
      mapa.set(p.id, {
        id: p.id,
        nombre: p.nombre,
        unidad: { nombre: unidad?.nombre ?? 'unidad', tipo: unidad?.tipo ?? 'unidad' },
        presentaciones: catalogo.presentaciones.filter((x) => x.producto_id === p.id),
        umbral: p.umbral_alerta_pct,
        precioAnterior: catalogo.precios.get(p.id)?.precio_base ?? null,
      })
    }
    return mapa
  }, [catalogo, proveedor.id])

  // Con IA: control renglón por renglón (el total lo controla chequearCuentas, más abajo).
  const validacionRenglones = useMemo(() => {
    if (origen !== 'ia' || !lectura) return null
    return validarRemito(
      renglones.map((r) => ({
        texto: r.texto,
        cantidad: r.cantidad,
        unidad: r.unidad,
        precioUnit: r.precioUnit,
        descuentoLinea: null,
        subtotal: r.subtotal,
        confianza: 'alta',
        observacion: '',
      })),
      lectura.totales,
      { controlarTotal: false },
    )
  }, [origen, lectura, renglones])
  const cuentasOk = !validacionRenglones || validacionRenglones.estado === 'OK'

  const conciliacion = useMemo(
    () =>
      conciliar({
        productos,
        pedido: pedido ? pedido.items : null,
        remito: renglones,
        ajustes: catalogo.ajustes,
        umbralProveedor: proveedor.umbral_alerta_pct,
        cuentasOk,
      }),
    [productos, pedido, renglones, catalogo.ajustes, proveedor.umbral_alerta_pct, cuentasOk],
  )

  const total = leerNumero(totalBoleta)
  // Todos los renglones de la boleta, tengan o no producto asignado (como en La Bodeguita).
  const cuentas = chequearCuentas(
    renglones.map((r) => ({ cantidad: r.cantidad, precio: r.precioUnit, subtotal: r.subtotal })),
    total !== null && total > 0 ? total : null,
  )
  // Como en La Bodeguita: si falta el total o no cierra, el pedido queda para revisar antes de pagar.
  const estadoPedido: 'a_pagar' | 'revisar' =
    conciliacion.estadoPedido === 'a_pagar' && cuentas.estado === 'ok' ? 'a_pagar' : 'revisar'

  // ─── Paso 1: la foto, o a mano ─────────────────────────────────────────
  async function alElegirFoto(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setError('')
    setPaso('leyendo')
    let lista: FotoLista
    try {
      lista = await comprimirFoto(archivo)
    } catch (err) {
      reportar(err, 'Comprimir foto de remito')
      setPaso('foto')
      return setError('No pudimos procesar la foto. Sacala de nuevo o cargá el remito a mano.')
    }
    setFoto(lista)
    const r = await leerRemito(proveedor.id, lista)
    if (!r.ok) {
      setPaso('foto')
      return setError(r.error)
    }
    setLectura(r.lectura)
    setOrigen('ia')
    setNroRemito(r.lectura.nroRemito ?? '')
    setTotalBoleta(r.lectura.totales.total ? numero(r.lectura.totales.total, 2) : '')
    setDuplicado(r.duplicado ? r.duplicado.recibidoAt : null)
    setRenglones(
      r.lectura.lineas.map((l) => ({
        id: crypto.randomUUID(),
        texto: l.texto,
        productoId: l.productoId && productos.has(l.productoId) ? l.productoId : null,
        cantidad: l.cantidad,
        unidad: l.unidad,
        precioUnit: l.precioUnit,
        subtotal: l.subtotal,
      })),
    )
    setPaso('revision')
  }

  /** Plan B (SPEC §7.7): arranca con lo pedido y el último precio; se corrige lo que no coincida. */
  function cargarAMano() {
    setError('')
    setOrigen('manual')
    setLectura(null)
    setRenglones(
      (pedido?.items ?? []).map((i) => {
        const p = productos.get(i.producto_id)
        const presentacion = p?.presentaciones.find((x) => x.id === i.presentacion_id)
        return {
          id: crypto.randomUUID(),
          texto: '',
          productoId: i.producto_id,
          cantidad: cantidadBase(i.cantidad, presentacion?.factor_a_base ?? 1),
          unidad: p?.unidad.nombre ?? null,
          precioUnit: p?.precioAnterior ?? i.precio_estimado_base,
          subtotal: null,
        }
      }),
    )
    setPaso('revision')
  }

  // ─── Paso 2: correcciones ──────────────────────────────────────────────
  function corregir(c: Correccion) {
    if (origen === 'ia') setCorrecciones((xs) => [...xs, c])
  }

  function guardarFila(fila: Fila, llego: number, precio: number | null) {
    const productoId = fila.productoId!
    const unidad = productos.get(productoId)?.unidad.nombre ?? null
    if (fila.llegoBase !== llego)
      corregir({
        campo: 'cantidad',
        detectado: String(fila.llegoBase ?? ''),
        correcto: String(llego),
      })
    if (fila.precioBase !== precio)
      corregir({
        campo: 'precio',
        detectado: String(fila.precioBase ?? ''),
        correcto: String(precio ?? ''),
      })
    setRenglones((rs) => {
      const suyos = rs.filter((r) => r.productoId === productoId)
      const resto = rs.filter((r) => r.productoId !== productoId)
      return [
        ...resto,
        {
          id: suyos[0]?.id ?? crypto.randomUUID(),
          texto: suyos.map((r) => r.texto).filter(Boolean)[0] ?? '',
          productoId,
          cantidad: llego,
          unidad,
          precioUnit: precio,
          subtotal: precio !== null ? Math.round(llego * precio * 100) / 100 : null,
        },
      ]
    })
    setEditando(null)
  }

  function asignar(renglonId: string, productoId: string) {
    const r = renglones.find((x) => x.id === renglonId)
    corregir({
      campo: 'producto',
      detectado: r?.texto ?? '',
      correcto: productos.get(productoId)?.nombre ?? '',
    })
    setRenglones((rs) => rs.map((x) => (x.id === renglonId ? { ...x, productoId } : x)))
    setEditando(null)
  }

  function quitar(renglonId: string) {
    const r = renglones.find((x) => x.id === renglonId)
    corregir({ campo: 'renglon_quitado', detectado: r?.texto ?? '', correcto: null })
    setRenglones((rs) => rs.filter((x) => x.id !== renglonId))
    setEditando(null)
  }

  function agregarProducto(productoId: string) {
    const p = productos.get(productoId)
    if (!p) return
    setRenglones((rs) => [
      ...rs,
      {
        id: crypto.randomUUID(),
        texto: '',
        productoId,
        cantidad: 1,
        unidad: p.unidad.nombre,
        precioUnit: p.precioAnterior,
        subtotal: null,
      },
    ])
    setEditando(`p:${productoId}`)
  }

  // ─── Paso 3: confirmar ─────────────────────────────────────────────────
  async function confirmar() {
    if (!local) return
    setGuardando(true)
    setError('')
    const fotoPath = foto && enLinea ? await subirFoto(org.id, id, foto) : null
    const c = conciliacion
    const recepcion: RecepcionParaGuardar = {
      id,
      local_id: local.id,
      proveedor_id: proveedor.id,
      pedido_id: pedido?.id ?? null,
      estado_pedido: pedido ? estadoPedido : null,
      origen,
      recibido_at: recibidoAt,
      foto_path: fotoPath,
      nro_remito: nroRemito.trim() || null,
      fecha_remito: fechaIso(lectura?.fecha ?? null),
      total_remito: total !== null && total > 0 ? total : null,
      lectura_ia: lectura,
      observaciones: cuentas.alertas.join(' ').slice(0, 500),
      items: c.filas.map((f) => ({
        id: crypto.randomUUID(),
        producto_id: f.productoId,
        texto_remito: f.textos[0] ?? '',
        cantidad_pedida_base: f.pedidoBase,
        cantidad_base: f.llegoBase,
        precio_unit_base: f.precioBase,
        precio_anterior_base: f.precioAnterior,
        subtotal: f.subtotal,
        resultado: f.resultado,
      })),
      diferencias: c.diferencias.map((d) => ({
        id: crypto.randomUUID(),
        producto_id: d.productoId,
        tipo: d.tipo,
        monto: d.monto,
        detalle: d.detalle,
      })),
      correcciones,
    }
    const ok = await agregarRecepcion(recepcion)
    setGuardando(false)
    if (!ok)
      setError(
        'El celular no dejó guardar la recepción. No cierres la app hasta que diga que se subió.',
      )
    setPaso('listo')
  }

  if (!local) {
    return (
      <>
        <TituloPantalla titulo="Recepción" volver="/recibir" />
        <p className="aviso aviso--atencion">
          Tu usuario no tiene un local asignado. Pedile a quien administra tu bar que te asigne uno.
        </p>
      </>
    )
  }

  const subtitulo = pedido ? (
    <>
      Pedido <span className="mono">{numeroPedido(pedido.numero)}</span> · {proveedor.nombre}
    </>
  ) : (
    `${proveedor.nombre} · sin pedido`
  )

  // ─── Pantallas ─────────────────────────────────────────────────────────
  if (paso === 'listo') {
    const { resumen } = conciliacion
    return (
      <>
        <TituloPantalla titulo="Recepción guardada" subtitulo={subtitulo} />
        <section className="card formulario">
          <p className="aviso aviso--ok" role="status">
            <CheckCircle2 size={16} aria-hidden="true" /> <strong>Listo.</strong>{' '}
            {pedido
              ? estadoPedido === 'a_pagar'
                ? 'El pedido quedó a pagar.'
                : 'El pedido quedó para revisar.'
              : 'Se guardaron los precios.'}
            {!enLinea && ' Sin señal: se sube sola cuando vuelva.'}
          </p>
          <p className="formulario__ayuda">
            {resumen.correctos} {resumen.correctos === 1 ? 'correcto' : 'correctos'}
            {resumen.faltantes ? ` · ${resumen.faltantes} con faltante` : ''}
            {resumen.aumentos
              ? ` · ${resumen.aumentos} ${resumen.aumentos === 1 ? 'subió' : 'subieron'} de precio`
              : ''}
            {resumen.excesos ? ` · ${resumen.excesos} de más` : ''}
          </p>
          {error && (
            <p className="aviso aviso--error" role="alert">
              {error}
            </p>
          )}
          {pedido && (
            <Link to={`/pedidos/${pedido.id}`} className="boton boton--primario">
              Ver el pedido
            </Link>
          )}
          <Link to="/" className="boton boton--secundario">
            Volver al inicio
          </Link>
        </section>
      </>
    )
  }

  if (paso === 'leyendo') {
    return (
      <>
        <TituloPantalla titulo="Recepción" subtitulo={subtitulo} />
        <section className="card cargando-ia" aria-busy="true" role="status">
          <Sparkles size={36} aria-hidden="true" />
          <p className="lista__titulo">Leyendo el remito con IA…</p>
          <p className="formulario__ayuda">
            Tarda unos 15 segundos. Controla renglón por renglón y que las cuentas cierren.
          </p>
        </section>
      </>
    )
  }

  if (paso === 'foto') {
    return (
      <>
        <TituloPantalla titulo="Recepción" volver="/recibir" subtitulo={subtitulo} />
        <section className="card formulario">
          <p className="formulario__ayuda">
            Sacá la foto del remito entero, derecho y con buena luz. La IA lo lee y lo compara con
            lo que pediste.
          </p>
          <input
            ref={entrada}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={alElegirFoto}
            aria-label="Foto del remito"
          />
          <button
            className="boton boton--primario"
            onClick={() => entrada.current?.click()}
            disabled={!enLinea}
          >
            <Camera size={18} aria-hidden="true" />
            Sacá la foto del remito
          </button>
          {!enLinea && (
            <p className="aviso aviso--atencion">
              Sin señal la IA no puede leer. Cargalo a mano: se sube solo cuando vuelva la señal.
            </p>
          )}
          {error && (
            <p className="aviso aviso--error" role="alert">
              {error}
            </p>
          )}
          <button className="boton boton--secundario" onClick={cargarAMano}>
            <PencilLine size={18} aria-hidden="true" />
            Cargar a mano
          </button>
        </section>
      </>
    )
  }

  // paso === 'revision'
  const { filas, resumen, diferencias } = conciliacion
  const sinProducto = [...productos.values()].filter(
    (p) => !filas.some((f) => f.productoId === p.id),
  )
  const reclamo = [
    `Hola! Recibimos ${nroRemito ? `el remito ${nroRemito}` : 'la mercadería'}${pedido ? ` del pedido ${numeroPedido(pedido.numero)}` : ''}:`,
    '',
    ...diferencias.map((d) => `• ${d.detalle}`),
    '',
    '¿Lo revisamos? Gracias!',
  ].join('\n')

  return (
    <>
      <TituloPantalla titulo="Recepción" subtitulo={subtitulo} />

      <section className="remito">
        <span className="remito__icono" aria-hidden="true">
          <FileText size={26} />
        </span>
        <div>
          <div className="remito__sello">
            {origen === 'ia' ? (
              <>
                <Sparkles size={14} aria-hidden="true" /> Leído con IA ·{' '}
                {cuentasOk && cuentas.estado === 'ok'
                  ? 'cuentas verificadas'
                  : 'revisá las cuentas'}
              </>
            ) : (
              <>
                <PencilLine size={14} aria-hidden="true" /> Cargado a mano
              </>
            )}
          </div>
          <p className="remito__numero">
            {nroRemito ? `Remito ${nroRemito}` : 'Remito sin número'}
          </p>
          <div className="remito__detalle">
            Llegó {hora(recibidoAt)}
            {pedido ? ` · pedido ${hace(pedido.creado_at)}` : ''}
          </div>
        </div>
      </section>

      {duplicado && (
        <p className="aviso aviso--atencion" role="alert">
          <TriangleAlert size={16} aria-hidden="true" /> <strong>Ojo:</strong> ya cargaste un remito
          con este número de {proveedor.nombre} ({hace(duplicado)}). Fijate que no sea el mismo.
        </p>
      )}
      {validacionRenglones && validacionRenglones.observaciones.length > 0 && (
        <p className={`aviso ${cuentasOk ? 'aviso--info' : 'aviso--atencion'}`}>
          {validacionRenglones.observaciones.join(' ')}
        </p>
      )}
      {lectura?.observaciones && (
        <p className="aviso aviso--info">La IA anotó: {lectura.observaciones}</p>
      )}

      <div className="chips" aria-label="Resumen">
        {resumen.correctos > 0 && (
          <span className="pastilla pastilla--ok">
            {resumen.correctos} {resumen.correctos === 1 ? 'correcto' : 'correctos'}
          </span>
        )}
        {resumen.faltantes > 0 && (
          <span className="pastilla pastilla--error">{resumen.faltantes} con faltante</span>
        )}
        {resumen.aumentos > 0 && (
          <span className="pastilla pastilla--atencion">
            {resumen.aumentos} {resumen.aumentos === 1 ? 'subió' : 'subieron'} de precio
          </span>
        )}
        {resumen.excesos > 0 && (
          <span className="pastilla pastilla--atencion">{resumen.excesos} de más</span>
        )}
        {resumen.noPedidos > 0 && (
          <span className="pastilla pastilla--atencion">{resumen.noPedidos} sin pedir</span>
        )}
        {resumen.sinAsignar > 0 && (
          <span className="pastilla pastilla--error">{resumen.sinAsignar} sin asignar</span>
        )}
      </div>

      <section className="lista" aria-label="Renglones del remito">
        <div className="tabla-recepcion__encabezado" aria-hidden="true">
          <span>Producto</span>
          <span className="tabla-recepcion__numero">Pedido</span>
          <span className="tabla-recepcion__numero">Llegó</span>
          <span className="tabla-recepcion__numero">$/u</span>
        </div>
        {filas.length === 0 && (
          <p className="lista__vacia">Agregá lo que llegó con el botón de abajo.</p>
        )}
        {filas.map((f) => {
          const clave = f.productoId ? `p:${f.productoId}` : `r:${f.renglonId}`
          const abierto = editando === clave
          return (
            <div key={clave}>
              <button
                className="tabla-recepcion__renglon"
                data-resultado={f.productoId ? f.resultado : 'sin_asignar'}
                aria-expanded={abierto}
                onClick={() => setEditando(abierto ? null : clave)}
              >
                <span className="tabla-recepcion__fila">
                  <span className="lista__titulo">{f.nombre}</span>
                  <span className="tabla-recepcion__numero">
                    {f.pedidoBase !== null ? numero(f.pedidoBase, 3) : '—'}
                  </span>
                  <span className="tabla-recepcion__numero">
                    {f.llegoBase !== null ? numero(f.llegoBase, 3) : '—'}
                  </span>
                  <span className="tabla-recepcion__numero">
                    {f.precioBase !== null ? numero(Math.round(f.precioBase), 0) : '—'}
                  </span>
                </span>
                <span className="tabla-recepcion__detalle">{f.detalle}</span>
                {f.productoId && f.textos.length > 0 && (
                  <span className="tabla-recepcion__texto-remito">
                    En el remito: {f.textos.join(' / ')}
                  </span>
                )}
              </button>
              {abierto &&
                (f.productoId ? (
                  <EditorFila
                    fila={f}
                    onGuardar={(llego, precio) => guardarFila(f, llego, precio)}
                    onCancelar={() => setEditando(null)}
                  />
                ) : (
                  <AsignarRenglon
                    productos={[...productos.values()]}
                    onAsignar={(pid) => asignar(clave.slice(2), pid)}
                    onQuitar={() => quitar(clave.slice(2))}
                  />
                ))}
            </div>
          )
        })}
      </section>

      {sinProducto.length > 0 && (
        <label className="campo">
          <span className="campo__etiqueta">¿Llegó algo más?</span>
          <select value="" onChange={(e) => e.target.value && agregarProducto(e.target.value)}>
            <option value="">Agregar un producto…</option>
            {sinProducto.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      <section className="card formulario" aria-label="Boleta">
        <div className="lista__titulo">Boleta</div>
        <div className="boleta-campos">
          <label className="campo">
            <span className="campo__etiqueta">Número de boleta o remito</span>
            <input
              className="mono"
              value={nroRemito}
              onChange={(e) => setNroRemito(e.target.value)}
              placeholder="0001-00012345"
            />
          </label>
          <label className="campo">
            <span className="campo__etiqueta">Total de la boleta</span>
            <input
              className="mono"
              inputMode="decimal"
              value={totalBoleta}
              onChange={(e) => setTotalBoleta(e.target.value)}
              placeholder="$ total"
              aria-invalid={totalBoleta.trim() !== '' && total === null}
            />
          </label>
        </div>
        <div className="totales-recepcion">
          <div>
            <div className="lista__detalle">Suma de los renglones</div>
            {conciliacion.totalPedidoEstimado !== null && (
              <div className="lista__detalle">
                Pediste por {pesos(conciliacion.totalPedidoEstimado)}
              </div>
            )}
          </div>
          <div className="totales-recepcion__total">{pesos(cuentas.suma)}</div>
        </div>
        {totalBoleta.trim() !== '' && total === null && (
          <p className="campo__ayuda campo__ayuda--error">
            El total tiene que ser un número, por ejemplo 12.500,50.
          </p>
        )}
        {cuentas.alertas.length > 0 && (
          <p className="aviso aviso--atencion" role="status">
            <TriangleAlert size={16} aria-hidden="true" /> {cuentas.alertas.join(' ')}
            {pedido && ' El pedido va a quedar para revisar antes de pagar.'}
          </p>
        )}
        {cuentas.nota && <p className="aviso aviso--ok">{cuentas.nota}</p>}
        {cuentas.sinPrecio > 0 && (
          <p className="aviso aviso--atencion">
            {cuentas.sinPrecio === 1
              ? '1 producto sin precio.'
              : `${cuentas.sinPrecio} productos sin precio.`}{' '}
            Cargarlos es lo que permite detectar si un proveedor te aumenta.
          </p>
        )}
      </section>

      {error && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}

      <div className="acciones">
        {diferencias.length > 0 && (
          <a
            className="boton boton--secundario"
            href={enlaceWhatsapp(proveedor.whatsapp, reclamo)}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={18} aria-hidden="true" />
            Reclamar por WhatsApp
          </a>
        )}
        <button
          className="boton boton--primario"
          onClick={confirmar}
          disabled={guardando || filas.length === 0}
        >
          {guardando ? 'Guardando…' : 'Confirmar'}
        </button>
        {origen === 'ia' && (
          <button className="boton boton--texto" onClick={cargarAMano}>
            La lectura está mal: cargar a mano
          </button>
        )}
      </div>
    </>
  )
}

function EditorFila({
  fila,
  onGuardar,
  onCancelar,
}: {
  fila: Fila
  onGuardar: (llego: number, precio: number | null) => void
  onCancelar: () => void
}) {
  const [llego, setLlego] = useState(fila.llegoBase !== null ? numero(fila.llegoBase, 3) : '')
  const [precio, setPrecio] = useState(fila.precioBase !== null ? numero(fila.precioBase, 2) : '')
  const [error, setError] = useState('')

  function guardar() {
    const cantidad = leerNumero(llego)
    const p = precio.trim() ? leerNumero(precio) : null
    if (cantidad === null || cantidad < 0) return setError('Escribí cuánto llegó (0 si no vino).')
    if (precio.trim() && (p === null || p < 0))
      return setError('El precio tiene que ser un número.')
    onGuardar(cantidad, p)
  }

  return (
    <div className="editor-renglon">
      <div className="editor-renglon__campos">
        <label className="campo">
          <span className="campo__etiqueta">Llegó ({fila.unidadBase})</span>
          <input
            className="mono"
            inputMode="decimal"
            value={llego}
            onChange={(e) => setLlego(e.target.value)}
          />
        </label>
        <label className="campo">
          <span className="campo__etiqueta">Precio por {fila.unidadBase}</span>
          <input
            className="mono"
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder="Sin precio"
          />
        </label>
      </div>
      {error && (
        <p className="campo__ayuda campo__ayuda--error" role="alert">
          {error}
        </p>
      )}
      <button className="boton boton--primario" onClick={guardar}>
        Listo
      </button>
      <button className="boton boton--texto" onClick={onCancelar}>
        Cancelar
      </button>
    </div>
  )
}

function AsignarRenglon({
  productos,
  onAsignar,
  onQuitar,
}: {
  productos: ProductoConciliable[]
  onAsignar: (id: string) => void
  onQuitar: () => void
}) {
  return (
    <div className="editor-renglon">
      <label className="campo">
        <span className="campo__etiqueta">¿Qué producto es?</span>
        <select value="" onChange={(e) => e.target.value && onAsignar(e.target.value)}>
          <option value="">Elegí el producto…</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
      <p className="campo__ayuda">La próxima vez la IA lo va a reconocer sola.</p>
      <button className="boton boton--texto" onClick={onQuitar}>
        <X size={18} aria-hidden="true" />
        No es mercadería: quitar el renglón
      </button>
      <Link to="/proveedores" className="enlace-accion">
        <Plus size={16} aria-hidden="true" />
        Es un producto nuevo: cargalo en Proveedores
      </Link>
    </div>
  )
}

/** "10:42" */
function hora(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "29/09/2026" → "2026-09-29" (lo que guarda la base). null si no es una fecha válida. */
function fechaIso(texto: string | null): string | null {
  const m = texto?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  const anio = m[3]!.length === 2 ? `20${m[3]}` : m[3]!
  const fecha = `${anio}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
  return Number.isNaN(Date.parse(fecha)) ? null : fecha
}
