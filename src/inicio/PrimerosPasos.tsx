import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { CheckCircle2, ChevronRight, Circle } from 'lucide-react'
import { useCatalogo } from '../catalogo/contexto'
import { useInstalacion } from '../lib/instalar'
import { supabase } from '../lib/supabase'
import { useSesionLista } from '../sesion/contexto'
import { primerosPasos } from './primeros-pasos'

type Cuentas = { equipo: number | null; pedidos: boolean; recepciones: boolean }

const clave = (orgId: string, userId: string) => `supplyia.primeros-pasos:${orgId}:${userId}`

function yaNoHaceFalta(orgId: string, userId: string): boolean {
  try {
    return localStorage.getItem(clave(orgId, userId)) === 'listo'
  } catch {
    return false
  }
}

function recordarListo(orgId: string, userId: string) {
  try {
    localStorage.setItem(clave(orgId, userId), 'listo')
  } catch {
    // Sin almacenamiento, vuelve a aparecer: no es grave.
  }
}

/** Solo cuenta filas (no trae datos). Si falla, el bloque no se muestra: no es para dar error. */
async function contar(esAdmin: boolean): Promise<Cuentas | null> {
  const [pedidos, recepciones, equipo] = await Promise.all([
    supabase.from('pedidos').select('id', { count: 'exact', head: true }),
    supabase.from('recepciones').select('id', { count: 'exact', head: true }),
    esAdmin
      ? supabase
          .from('miembros')
          .select('user_id', { count: 'exact', head: true })
          .eq('activo', true)
      : Promise.resolve({ count: null, error: null }),
  ])
  if (pedidos.error || recepciones.error || equipo.error) return null
  return {
    equipo: equipo.count,
    pedidos: (pedidos.count ?? 0) > 0,
    recepciones: (recepciones.count ?? 0) > 0,
  }
}

/** En Inicio: lo que le falta a un bar nuevo para estar andando. Desaparece cuando está todo. */
export function PrimerosPasos() {
  const { org, usuario, miembro } = useSesionLista()
  const { catalogo } = useCatalogo()
  const { instalada } = useInstalacion()
  const [oculto, setOculto] = useState(() => yaNoHaceFalta(org.id, usuario.id))
  const [cuentas, setCuentas] = useState<Cuentas | null>(null)
  const esAdmin = miembro.rol === 'admin'

  useEffect(() => {
    if (oculto) return
    let vigente = true
    contar(esAdmin).then((c) => {
      if (vigente) setCuentas(c)
    })
    return () => {
      vigente = false
    }
  }, [oculto, esAdmin])

  const pasos =
    cuentas && catalogo.estado === 'listo'
      ? primerosPasos({
          rol: miembro.rol,
          productos: catalogo.catalogo.productos.filter((p) => p.activo).length,
          equipo: cuentas.equipo,
          hayPedidos: cuentas.pedidos,
          hayRecepciones: cuentas.recepciones,
          instalada,
        })
      : null
  const completo = pasos !== null && pasos.every((p) => p.hecho)
  // Todo hecho: no vuelve a aparecer (ni a consultar) en este dispositivo.
  useEffect(() => {
    if (completo) recordarListo(org.id, usuario.id)
  }, [completo, org.id, usuario.id])

  if (oculto || !pasos || completo) return null
  const hechos = pasos.filter((p) => p.hecho).length
  const ocultar = () => {
    recordarListo(org.id, usuario.id)
    setOculto(true)
  }

  return (
    <section className="card primeros-pasos" aria-labelledby="titulo-primeros-pasos">
      <div className="seccion-encabezado">
        <h2 id="titulo-primeros-pasos">Primeros pasos</h2>
        <span className="texto-gris">
          {hechos} de {pasos.length}
        </span>
      </div>
      <ol className="primeros-pasos__lista">
        {pasos.map((p) => (
          <li key={p.clave}>
            <Link
              to={p.enlace}
              className="primeros-pasos__paso"
              data-hecho={p.hecho}
              aria-label={`${p.titulo}${p.hecho ? ' (hecho)' : ''}`}
            >
              {p.hecho ? (
                <CheckCircle2 size={22} aria-hidden="true" />
              ) : (
                <Circle size={22} aria-hidden="true" />
              )}
              <span className="lista__texto">
                <span className="lista__titulo">{p.titulo}</span>
                {!p.hecho && <span className="lista__detalle">{p.detalle}</span>}
              </span>
              {!p.hecho && <ChevronRight size={18} aria-hidden="true" />}
            </Link>
          </li>
        ))}
      </ol>
      <button className="boton boton--texto" onClick={ocultar}>
        No mostrar más
      </button>
    </section>
  )
}
