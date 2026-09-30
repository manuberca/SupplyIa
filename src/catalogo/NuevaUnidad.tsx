import { useState } from 'react'
import { useCatalogo } from './contexto'
import { crearUnidad } from './acciones'
import { unidadSchema } from './esquemas'
import { NOMBRE_TIPO, type Catalogo, type TipoUnidad } from './tipos'
import { normalizarUnidad } from '../lib/normalizar'
import { useSesionLista } from '../sesion/contexto'

/** Alta de una unidad. Si ya existe (aunque esté escrita en plural), ofrece usar esa. */
export function NuevaUnidad({
  catalogo,
  titulo,
  onCreada,
}: {
  catalogo: Catalogo
  titulo: string
  onCreada: (id: string) => void
}) {
  const { org } = useSesionLista()
  const { recargar } = useCatalogo()
  const [id, setId] = useState(() => crypto.randomUUID())
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoUnidad | ''>('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const existente = nombre.trim()
    ? catalogo.unidades.find(
        (u) => !u.archivada && normalizarUnidad(u.nombre) === normalizarUnidad(nombre),
      )
    : undefined

  async function crear() {
    setError('')
    if (existente) return onCreada(existente.id)
    const r = unidadSchema.safeParse({ nombre, tipo })
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá la unidad.')
    setGuardando(true)
    const resultado = await crearUnidad(org.id, { id, ...r.data })
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.mensaje)
    await recargar()
    onCreada(id)
    setId(crypto.randomUUID())
    setNombre('')
    setTipo('')
  }

  return (
    <div className="card formulario">
      <label className="campo">
        <span className="campo__etiqueta">{titulo}</span>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: horma, pack, docena"
        />
      </label>
      {existente ? (
        <p className="campo__ayuda">
          Ya existe: <strong>{existente.nombre}</strong>.
        </p>
      ) : (
        <div className="chips" role="group" aria-label="Cómo se mide">
          {(Object.keys(NOMBRE_TIPO) as TipoUnidad[]).map((t) => (
            <button
              key={t}
              type="button"
              className="chip"
              aria-pressed={tipo === t}
              onClick={() => setTipo(t)}
            >
              {NOMBRE_TIPO[t]}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="boton boton--secundario"
        disabled={guardando || !nombre.trim()}
        onClick={crear}
      >
        {guardando ? 'Creando…' : existente ? `Usar "${existente.nombre}"` : 'Crear unidad'}
      </button>
    </div>
  )
}
