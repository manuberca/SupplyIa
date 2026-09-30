import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Copy, RotateCcw, Send, TriangleAlert, X } from 'lucide-react'
import { EsperarCatalogo } from '../../catalogo/EsperarCatalogo'
import type { Catalogo } from '../../catalogo/tipos'
import { TituloPantalla } from '../../components/TituloPantalla'
import { pesos } from '../../lib/formato'
import { puede } from '../../lib/permisos'
import { hace } from '../../lib/tiempo'
import { useCola } from '../../offline/contexto'
import { mensajeDelPedido, renglones } from '../../pedidos/armar'
import { usePedidos } from '../../pedidos/contexto'
import { enlaceWhatsapp, estimado } from '../../pedidos/logica'
import { ESTADOS, numeroPedido, type EstadoPedido, type Pedido } from '../../pedidos/tipos'
import { useSesionLista } from '../../sesion/contexto'

export function DetallePedido() {
  const { id } = useParams()
  const { pedidos, estado } = usePedidos()
  return (
    <EsperarCatalogo>
      {(catalogo) => {
        const pedido = pedidos.find((p) => p.id === id)
        if (!pedido) {
          return (
            <>
              <TituloPantalla titulo="Pedido" volver="/pedidos" />
              <p className={estado === 'cargando' ? 'texto-gris' : 'aviso aviso--error'}>
                {estado === 'cargando' ? 'Cargando…' : 'No encontramos ese pedido en este local.'}
              </p>
            </>
          )
        }
        return <Detalle pedido={pedido} catalogo={catalogo} />
      }}
    </EsperarCatalogo>
  )
}

function Detalle({ pedido, catalogo }: { pedido: Pedido; catalogo: Catalogo }) {
  const [params] = useSearchParams()
  const { org, local, miembro } = useSesionLista()
  const [copiado, setCopiado] = useState(false)
  const proveedor = catalogo.proveedores.find((p) => p.id === pedido.proveedor_id)
  const lista = renglones(pedido.items, catalogo)
  const e = estimado(lista)
  const mensaje = mensajeDelPedido(lista, {
    organizacion: org.nombre,
    local: local?.nombre ?? null,
    observaciones: pedido.observaciones,
  })
  const recienEnviado = params.get('enviado') === '1'
  const estado = ESTADOS[pedido.estado]

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      // Sin permiso para el portapapeles: el texto queda a la vista para copiarlo a mano.
      setCopiado(false)
    }
  }

  return (
    <>
      <TituloPantalla
        titulo={proveedor?.nombre ?? 'Pedido'}
        volver="/pedidos"
        subtitulo={
          <>
            <span className="mono">{numeroPedido(pedido.numero)}</span> · hecho{' '}
            {hace(pedido.creado_at)}
          </>
        }
      />

      <EstadoSubida pedido={pedido} />

      {recienEnviado && (
        <p className="aviso aviso--ok" role="status">
          <strong>Pedido guardado.</strong> Si WhatsApp no se abrió, usá el botón de abajo o copiá
          el mensaje.
        </p>
      )}

      {!pedido.subida && (
        <p>
          <span className={`pastilla ${estado.clase}`}>{estado.texto}</span>
        </p>
      )}

      <section className="card">
        <dl className="datos">
          {lista.map((r) => (
            <div key={r.id}>
              <dt>{r.producto}</dt>
              <dd className="mono">{r.cantidadTexto}</dd>
            </div>
          ))}
          <div>
            <dt>Estimado{e.sinPrecio ? ` (${e.sinPrecio} sin precio)` : ''}</dt>
            <dd className="mono">{e.sinPrecio === lista.length ? '—' : pesos(e.total)}</dd>
          </div>
        </dl>
      </section>

      {pedido.observaciones && (
        <p className="formulario__ayuda">
          <strong>Observaciones:</strong> {pedido.observaciones}
        </p>
      )}

      <section className="card formulario" aria-label="Mensaje de WhatsApp">
        <div className="campo__etiqueta">Mensaje para {proveedor?.nombre ?? 'el proveedor'}</div>
        <p className="mensaje-whatsapp">{mensaje}</p>
        {proveedor && (
          <a
            className="boton boton--enviar"
            href={enlaceWhatsapp(proveedor.whatsapp, mensaje)}
            target="_blank"
            rel="noreferrer"
          >
            <Send size={18} aria-hidden="true" />
            {recienEnviado ? 'Abrir WhatsApp' : 'Mandar de nuevo por WhatsApp'}
          </a>
        )}
        <button className="boton boton--secundario" onClick={copiar}>
          <Copy size={18} aria-hidden="true" />
          {copiado ? '¡Copiado!' : 'Copiar mensaje'}
        </button>
      </section>

      {!pedido.subida && puede(miembro.rol, 'pedir') && <CambiarEstado pedido={pedido} />}
    </>
  )
}

function EstadoSubida({ pedido }: { pedido: Pedido }) {
  const { reintentar, descartar, enLinea } = useCola()
  const [confirmando, setConfirmando] = useState(false)
  if (!pedido.subida) return null

  if (!pedido.subida.error) {
    return (
      <p className="aviso aviso--atencion" role="status">
        <strong>Pendiente de subir.</strong>{' '}
        {enLinea
          ? 'Se está subiendo; el número aparece en un momento.'
          : 'Está guardado en el celular y se sube solo cuando vuelva la señal.'}
      </p>
    )
  }
  return (
    <section className="card formulario">
      <p className="aviso aviso--error" role="alert">
        <TriangleAlert size={16} aria-hidden="true" /> <strong>No se pudo subir:</strong>{' '}
        {pedido.subida.error}
      </p>
      <button className="boton boton--primario" onClick={() => reintentar(pedido.id)}>
        <RotateCcw size={18} aria-hidden="true" />
        Probar de nuevo
      </button>
      {confirmando ? (
        <>
          <p className="formulario__ayuda">
            Se borra de este celular y no queda registrado en SupplyIA. El mensaje de WhatsApp, si
            lo mandaste, no se puede deshacer.
          </p>
          <button className="boton boton--secundario" onClick={() => void descartar(pedido.id)}>
            Sí, descartar
          </button>
        </>
      ) : (
        <button className="boton boton--texto" onClick={() => setConfirmando(true)}>
          <X size={18} aria-hidden="true" />
          Descartar este pedido
        </button>
      )}
    </section>
  )
}

function CambiarEstado({ pedido }: { pedido: Pedido }) {
  const { cambiarEstado } = usePedidos()
  const [confirmando, setConfirmando] = useState<EstadoPedido | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const opciones: { estado: EstadoPedido; texto: string; pregunta: string }[] = []
  if (pedido.estado === 'enviado') {
    opciones.push(
      {
        estado: 'no_llego',
        texto: 'No llegó',
        pregunta: '¿Marcar que no llegó? Queda para el historial del proveedor.',
      },
      {
        estado: 'cancelado',
        texto: 'Cancelar pedido',
        pregunta: '¿Cancelar el pedido? Avisale también al proveedor.',
      },
    )
  }
  if (pedido.estado === 'no_llego') {
    opciones.push({
      estado: 'enviado',
      texto: 'Volvió a estar en camino',
      pregunta: '¿Marcarlo de nuevo como en camino?',
    })
  }
  if (opciones.length === 0) return null

  async function aplicar(estado: EstadoPedido) {
    setGuardando(true)
    setError('')
    const r = await cambiarEstado(pedido.id, estado)
    setGuardando(false)
    setConfirmando(null)
    if (!r.ok) setError(r.mensaje)
  }

  const pregunta = opciones.find((o) => o.estado === confirmando)

  return (
    <section className="acciones">
      {error && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}
      {pregunta ? (
        <div className="card formulario">
          <p className="formulario__ayuda">
            <strong>{pregunta.pregunta}</strong>
          </p>
          <button
            className="boton boton--primario"
            disabled={guardando}
            onClick={() => aplicar(pregunta.estado)}
          >
            {guardando ? 'Guardando…' : `Sí, ${pregunta.texto.toLowerCase()}`}
          </button>
          <button
            className="boton boton--texto"
            disabled={guardando}
            onClick={() => setConfirmando(null)}
          >
            Volver
          </button>
        </div>
      ) : (
        opciones.map((o) => (
          <button
            key={o.estado}
            className="boton boton--secundario"
            onClick={() => setConfirmando(o.estado)}
          >
            {o.texto}
          </button>
        ))
      )}
      <Link to="/pedir" className="boton boton--texto">
        Hacer otro pedido
      </Link>
    </section>
  )
}
