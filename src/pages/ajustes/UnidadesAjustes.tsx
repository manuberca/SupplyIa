import { useState } from 'react'
import { Plus } from 'lucide-react'
import { EsperarCatalogo } from '../../catalogo/EsperarCatalogo'
import { NuevaUnidad } from '../../catalogo/NuevaUnidad'
import { useCatalogo } from '../../catalogo/contexto'
import { archivarUnidad } from '../../catalogo/acciones'
import { NOMBRE_TIPO, type Catalogo, type Unidad } from '../../catalogo/tipos'

/** Ajustes → Unidades (solo administración). */
export function UnidadesAjustes() {
  return (
    <section className="formulario" aria-labelledby="titulo-unidades">
      <EsperarCatalogo>{(catalogo) => <Lista catalogo={catalogo} />}</EsperarCatalogo>
    </section>
  )
}

function Lista({ catalogo }: { catalogo: Catalogo }) {
  const [agregando, setAgregando] = useState(false)
  const [verArchivadas, setVerArchivadas] = useState(false)

  const usos = new Map<string, number>()
  for (const p of catalogo.productos) {
    if (p.activo) usos.set(p.unidad_base_id, (usos.get(p.unidad_base_id) ?? 0) + 1)
  }
  const activas = catalogo.unidades.filter((u) => !u.archivada)
  const archivadas = catalogo.unidades.filter((u) => u.archivada)
  const enUso = activas.filter((u) => usos.has(u.id)).length

  return (
    <>
      <div className="seccion-encabezado">
        <h2 id="titulo-unidades">Unidades</h2>
        <span className="texto-gris">{enUso} en uso</span>
      </div>

      <div className="lista">
        {activas.map((u) => (
          <FilaUnidad key={u.id} unidad={u} usos={usos.get(u.id) ?? 0} />
        ))}
      </div>

      {agregando ? (
        <NuevaUnidad
          catalogo={catalogo}
          titulo="Nueva unidad"
          onCreada={() => setAgregando(false)}
        />
      ) : (
        <button className="enlace-accion" onClick={() => setAgregando(true)}>
          <Plus size={16} aria-hidden="true" />
          Nueva unidad
        </button>
      )}

      {archivadas.length > 0 && (
        <button className="boton boton--texto" onClick={() => setVerArchivadas((v) => !v)}>
          {verArchivadas ? 'Ocultar archivadas' : `Ver archivadas (${archivadas.length})`}
        </button>
      )}
      {verArchivadas && (
        <div className="lista">
          {archivadas.map((u) => (
            <FilaUnidad key={u.id} unidad={u} usos={0} />
          ))}
        </div>
      )}
    </>
  )
}

function FilaUnidad({ unidad, usos }: { unidad: Unidad; usos: number }) {
  const { recargar } = useCatalogo()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function cambiar() {
    setGuardando(true)
    setError('')
    const r = await archivarUnidad(unidad.id, !unidad.archivada)
    if (r.ok) await recargar()
    else setError(r.mensaje)
    setGuardando(false)
  }

  return (
    <div className="lista__fila">
      <span className="lista__texto">
        <span className="lista__titulo">{unidad.nombre}</span>
        <span className="lista__detalle">
          {NOMBRE_TIPO[unidad.tipo].replace(/ \(.*\)$/, '')}
          {usos > 0 && ` · ${usos} ${usos === 1 ? 'producto' : 'productos'}`}
        </span>
        {error && (
          <span className="campo__ayuda campo__ayuda--error" role="alert">
            {error}
          </span>
        )}
      </span>
      <button
        className="boton boton--texto"
        disabled={guardando}
        onClick={cambiar}
        aria-label={`${unidad.archivada ? 'Reactivar' : 'Archivar'} ${unidad.nombre}`}
      >
        {unidad.archivada ? 'Reactivar' : 'Archivar'}
      </button>
    </div>
  )
}
