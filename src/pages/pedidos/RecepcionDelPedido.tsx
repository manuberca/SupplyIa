import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Image as ImageIcon, PencilLine } from 'lucide-react'
import { linkDeFoto } from '../../admin/acciones'
import { ESTADOS_DIFERENCIA } from '../../admin/estados'
import { supabase } from '../../lib/supabase'
import { reportar } from '../../lib/errores'
import { SIN_CONEXION } from '../../lib/errores-auth'
import { ERROR_DB_DESCONOCIDO, mensajeErrorDb } from '../../lib/errores-db'
import { pesos } from '../../lib/formato'
import { puede } from '../../lib/permisos'
import { hace } from '../../lib/tiempo'
import { useSesionLista } from '../../sesion/contexto'

type Diferencia = {
  id: string
  tipo: string
  monto: number | null
  detalle: string
  estado: string
}
type Recepcion = {
  id: string
  recibido_at: string
  nro_remito: string | null
  total_remito: number | null
  origen: string
  observaciones: string | null
  foto_path: string | null
  corregida_at: string | null
  diferencias: Diferencia[]
}

const ESTADOS: Record<string, { texto: string; clase: string }> = ESTADOS_DIFERENCIA

/** Lo que llegó de un pedido: remito, total y diferencias (con su seguimiento). */
export function RecepcionDelPedido({
  pedidoId,
  estadoPedido,
  version,
}: {
  pedidoId: string
  estadoPedido: string
  version: number
}) {
  const { miembro } = useSesionLista()
  const [recepciones, setRecepciones] = useState<Recepcion[] | null>(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('recepciones')
      .select(
        'id, recibido_at, nro_remito, total_remito, origen, observaciones, foto_path, corregida_at, diferencias ( id, tipo, monto, detalle, estado )',
      )
      .eq('pedido_id', pedidoId)
      .order('recibido_at', { ascending: false })
    if (e) {
      const sinRed = !navigator.onLine || /fetch/i.test(e.message)
      if (!sinRed) reportar(e, 'Cargar recepción del pedido')
      return { error: sinRed ? SIN_CONEXION : 'No pudimos cargar la recepción.' }
    }
    return { datos: data }
  }, [pedidoId])

  useEffect(() => {
    let vigente = true
    cargar().then((r) => {
      if (!vigente) return
      if ('error' in r) setError(r.error ?? '')
      else {
        setError('')
        setRecepciones(r.datos)
      }
    })
    return () => {
      vigente = false
    }
  }, [cargar, version])

  async function cambiar(id: string, estado: string) {
    const { error: e } = await supabase.from('diferencias').update({ estado }).eq('id', id)
    if (e) {
      const mensaje = mensajeErrorDb(e)
      if (mensaje === ERROR_DB_DESCONOCIDO) reportar(e, 'Cambiar estado de diferencia')
      return setError(mensaje)
    }
    const r = await cargar()
    if ('datos' in r && r.datos) setRecepciones(r.datos)
  }

  if (error && !recepciones) return <p className="aviso aviso--atencion">{error}</p>
  if (!recepciones || recepciones.length === 0) return null
  const puedeResolver = puede(miembro.rol, 'pedir')

  return (
    <>
      <h2>Recepción</h2>
      {error && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}
      {recepciones.map((r) => (
        <section key={r.id} className="card formulario">
          <dl className="datos">
            <div>
              <dt>Llegó</dt>
              <dd>{hace(r.recibido_at)}</dd>
            </div>
            <div>
              <dt>Remito</dt>
              <dd className="mono">{r.nro_remito ?? '—'}</dd>
            </div>
            <div>
              <dt>Total de la boleta</dt>
              <dd className="mono">{r.total_remito !== null ? pesos(r.total_remito) : '—'}</dd>
            </div>
            <div>
              <dt>Cargado</dt>
              <dd>
                {r.origen === 'ia' ? 'Leído con IA' : 'A mano'}
                {r.corregida_at && ` · corregida ${hace(r.corregida_at)}`}
              </dd>
            </div>
          </dl>
          {r.foto_path && <FotoGuardada camino={r.foto_path} />}
          {r.observaciones && <p className="aviso aviso--atencion">{r.observaciones}</p>}
          {r.diferencias.length === 0 ? (
            <p className="aviso aviso--ok">Llegó todo bien.</p>
          ) : (
            r.diferencias.map((d) => {
              const estado = ESTADOS[d.estado] ?? ESTADOS.pendiente!
              return (
                <div key={d.id} className="grupo">
                  <p className="formulario__ayuda">
                    <span className={`pastilla ${estado.clase}`}>{estado.texto}</span>{' '}
                    <strong>{d.detalle}</strong>
                    {d.monto ? ` · ${pesos(Math.abs(d.monto))}` : ''}
                  </p>
                  {puedeResolver && d.estado !== 'resuelto' && (
                    <div className="chips chips--chicos">
                      {d.estado === 'pendiente' && (
                        <button className="chip" onClick={() => cambiar(d.id, 'reclamado')}>
                          Ya lo reclamé
                        </button>
                      )}
                      {d.tipo !== 'exceso' && d.estado !== 'nota_credito' && (
                        <button className="chip" onClick={() => cambiar(d.id, 'nota_credito')}>
                          Mandó nota de crédito
                        </button>
                      )}
                      <button className="chip" onClick={() => cambiar(d.id, 'resuelto')}>
                        Resuelto
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
          {puedeResolver && !['pagado', 'cancelado'].includes(estadoPedido) && (
            <Link to={`/recibir/corregir/${r.id}`} className="boton boton--secundario">
              <PencilLine size={18} aria-hidden="true" />
              Corregir la recepción
            </Link>
          )}
        </section>
      ))}
    </>
  )
}

/** La foto guardada del remito: se pide recién al tocar (el link dura 5 minutos). */
function FotoGuardada({ camino }: { camino: string }) {
  const [foto, setFoto] = useState<{ url: string } | { error: string } | null>(null)
  const [pidiendo, setPidiendo] = useState(false)
  if (foto && 'url' in foto) {
    return (
      <a href={foto.url} target="_blank" rel="noreferrer" className="foto-guardada">
        <img src={foto.url} alt="Foto del remito" />
      </a>
    )
  }
  return (
    <>
      <button
        className="boton boton--secundario"
        disabled={pidiendo}
        onClick={async () => {
          setPidiendo(true)
          setFoto(await linkDeFoto(camino))
          setPidiendo(false)
        }}
      >
        <ImageIcon size={18} aria-hidden="true" />
        {pidiendo ? 'Buscando…' : 'Ver la foto del remito'}
      </button>
      {foto && 'error' in foto && (
        <p className="aviso aviso--atencion" role="alert">
          {foto.error}
        </p>
      )}
    </>
  )
}
