import { useEffect, useState, type FormEvent } from 'react'
import { MessageCircle, Plus } from 'lucide-react'
import {
  archivarLocal,
  cambiarAcceso,
  cargarEquipo,
  cargarLocales,
  crearLocal,
  editarMiembro,
  invitar,
  renombrarLocal,
  type LocalDelBar,
  type Miembro,
} from '../../equipo/acciones'
import { invitacionSchema } from '../../equipo/esquemas'
import { NOMBRE_ROL, type Rol } from '../../lib/permisos'
import { useSesion, useSesionLista } from '../../sesion/contexto'

type Datos = { miembros: Miembro[]; locales: LocalDelBar[] }

const QUE_HACE: Record<Rol, string> = {
  admin: 'Todo: ajustes, equipo, panel y exportar.',
  encargado: 'Pedidos, recepciones, proveedores y precios.',
  recepcion: 'Solo recibe mercadería y ve los pedidos en curso.',
}
const ROLES: Rol[] = ['admin', 'encargado', 'recepcion']

async function traer(): Promise<Datos | { error: string }> {
  const [miembros, locales] = await Promise.all([cargarEquipo(), cargarLocales()])
  if ('error' in miembros) return miembros
  if ('error' in locales) return locales
  return { miembros, locales }
}

/** Ajustes → Locales y Equipo (solo administración). */
export function EquipoAjustes() {
  const { refrescar } = useSesion()
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    traer().then((r) => {
      if (!vigente) return
      if ('error' in r) setError(r.error)
      else setDatos(r)
    })
    return () => {
      vigente = false
    }
  }, [])

  async function recargar() {
    const r = await traer()
    if ('error' in r) return setError(r.error)
    setError('')
    setDatos(r)
    // Los locales también están en la sesión (selector de local, pedidos): se actualizan.
    await refrescar()
  }

  if (!datos) {
    return error ? (
      <section className="card formulario">
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
        <button className="boton boton--secundario" onClick={recargar}>
          Probar de nuevo
        </button>
      </section>
    ) : (
      <p className="texto-gris" aria-busy="true">
        Cargando el equipo…
      </p>
    )
  }

  return (
    <>
      {error && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}
      <Locales locales={datos.locales} recargar={recargar} />
      <Equipo datos={datos} recargar={recargar} />
    </>
  )
}

// ─── Locales ───────────────────────────────────────────────────────────────

function Locales({ locales, recargar }: { locales: LocalDelBar[]; recargar: () => Promise<void> }) {
  const { org } = useSesionLista()
  const [agregando, setAgregando] = useState(false)
  const [id, setId] = useState(() => crypto.randomUUID())
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [verArchivados, setVerArchivados] = useState(false)
  const activos = locales.filter((l) => l.activo)
  const archivados = locales.filter((l) => !l.activo)

  async function crear(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return setError('Escribí el nombre del local.')
    setGuardando(true)
    setError('')
    const r = await crearLocal(org.id, { id, nombre: nombre.trim() })
    setGuardando(false)
    if (!r.ok) return setError(r.mensaje)
    setId(crypto.randomUUID())
    setNombre('')
    setAgregando(false)
    await recargar()
  }

  return (
    <section className="formulario" aria-labelledby="titulo-locales">
      <div className="seccion-encabezado">
        <h2 id="titulo-locales">Locales</h2>
        <span className="texto-gris">
          {activos.length} {activos.length === 1 ? 'activo' : 'activos'}
        </span>
      </div>
      <div className="lista">
        {activos.map((l) => (
          <FilaLocal key={l.id} local={l} unico={activos.length === 1} recargar={recargar} />
        ))}
      </div>
      {agregando ? (
        <form className="card formulario" onSubmit={crear}>
          <label className="campo">
            <span className="campo__etiqueta">Nombre del local nuevo</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Pichincha"
              maxLength={120}
              autoFocus
            />
          </label>
          {error && (
            <p className="campo__ayuda campo__ayuda--error" role="alert">
              {error}
            </p>
          )}
          <button className="boton boton--primario" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Agregar local'}
          </button>
          <button type="button" className="boton boton--texto" onClick={() => setAgregando(false)}>
            Cancelar
          </button>
        </form>
      ) : (
        <button className="enlace-accion" onClick={() => setAgregando(true)}>
          <Plus size={16} aria-hidden="true" />
          Nuevo local
        </button>
      )}

      {archivados.length > 0 && (
        <button className="boton boton--texto" onClick={() => setVerArchivados((v) => !v)}>
          {verArchivados ? 'Ocultar archivados' : `Ver archivados (${archivados.length})`}
        </button>
      )}
      {verArchivados && (
        <div className="lista">
          {archivados.map((l) => (
            <FilaLocal key={l.id} local={l} unico={false} recargar={recargar} />
          ))}
        </div>
      )}
    </section>
  )
}

function FilaLocal({
  local,
  unico,
  recargar,
}: {
  local: LocalDelBar
  unico: boolean
  recargar: () => Promise<void>
}) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(local.nombre)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function hacer(accion: () => Promise<{ ok: true } | { ok: false; mensaje: string }>) {
    setGuardando(true)
    setError('')
    const r = await accion()
    setGuardando(false)
    if (!r.ok) return setError(r.mensaje)
    setEditando(false)
    await recargar()
  }

  if (editando) {
    return (
      <form
        className="lista__fila fila-edicion"
        onSubmit={(e) => {
          e.preventDefault()
          if (!nombre.trim()) return setError('Escribí el nombre del local.')
          void hacer(() => renombrarLocal(local.id, nombre.trim()))
        }}
      >
        <label className="campo">
          <span className="campo__etiqueta">Nombre del local</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={120}
            autoFocus
          />
        </label>
        {error && (
          <p className="campo__ayuda campo__ayuda--error" role="alert">
            {error}
          </p>
        )}
        <div className="fila-edicion__botones">
          <button className="boton boton--primario boton--chico" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="boton boton--texto" onClick={() => setEditando(false)}>
            Cancelar
          </button>
          {!unico && (
            <button
              type="button"
              className="boton boton--texto boton--peligro"
              disabled={guardando}
              onClick={() => hacer(() => archivarLocal(local.id, true))}
            >
              Archivar
            </button>
          )}
        </div>
      </form>
    )
  }

  return (
    <div className="lista__fila">
      <span className="lista__texto">
        <span className="lista__titulo">{local.nombre}</span>
        {!local.activo && <span className="lista__detalle">Archivado</span>}
        {error && (
          <span className="campo__ayuda campo__ayuda--error" role="alert">
            {error}
          </span>
        )}
      </span>
      {local.activo ? (
        <button
          className="boton boton--texto"
          onClick={() => setEditando(true)}
          aria-label={`Editar el local ${local.nombre}`}
        >
          Editar
        </button>
      ) : (
        <button
          className="boton boton--texto"
          disabled={guardando}
          onClick={() => hacer(() => archivarLocal(local.id, false))}
          aria-label={`Reactivar el local ${local.nombre}`}
        >
          Reactivar
        </button>
      )}
    </div>
  )
}

// ─── Equipo ────────────────────────────────────────────────────────────────

function textoLocales(locales: string[] | null, todos: LocalDelBar[]): string {
  if (locales === null) return 'Todos los locales'
  return locales.map((id) => todos.find((l) => l.id === id)?.nombre ?? 'Local archivado').join(', ')
}

function Equipo({ datos, recargar }: { datos: Datos; recargar: () => Promise<void> }) {
  const { usuario } = useSesionLista()
  const [sumando, setSumando] = useState(false)
  const [verBajas, setVerBajas] = useState(false)
  const activos = datos.miembros.filter((m) => m.activo)
  const bajas = datos.miembros.filter((m) => !m.activo)
  const localesActivos = datos.locales.filter((l) => l.activo)

  return (
    <section className="formulario" aria-labelledby="titulo-equipo">
      <div className="seccion-encabezado">
        <h2 id="titulo-equipo">Equipo</h2>
        <span className="texto-gris">
          {activos.length} {activos.length === 1 ? 'persona' : 'personas'}
        </span>
      </div>
      <div className="lista">
        {activos.map((m) => (
          <FilaMiembro
            key={m.user_id}
            miembro={m}
            soyYo={m.user_id === usuario.id}
            locales={datos.locales}
            recargar={recargar}
          />
        ))}
      </div>

      {sumando ? (
        <Invitar locales={localesActivos} recargar={recargar} onCerrar={() => setSumando(false)} />
      ) : (
        <button className="enlace-accion" onClick={() => setSumando(true)}>
          <Plus size={16} aria-hidden="true" />
          Sumar a una persona
        </button>
      )}

      {bajas.length > 0 && (
        <button className="boton boton--texto" onClick={() => setVerBajas((v) => !v)}>
          {verBajas ? 'Ocultar dados de baja' : `Ver dados de baja (${bajas.length})`}
        </button>
      )}
      {verBajas && (
        <div className="lista">
          {bajas.map((m) => (
            <FilaMiembro
              key={m.user_id}
              miembro={m}
              soyYo={false}
              locales={datos.locales}
              recargar={recargar}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/** Rol y locales: los usan el alta y la edición. Administración siempre ve todos los locales. */
function RolYLocales({
  rol,
  locales,
  todos,
  onRol,
  onLocales,
}: {
  rol: Rol
  locales: string[] | null
  todos: LocalDelBar[]
  onRol: (r: Rol) => void
  onLocales: (l: string[] | null) => void
}) {
  return (
    <>
      <label className="campo">
        <span className="campo__etiqueta">Rol</span>
        <select value={rol} onChange={(e) => onRol(e.target.value as Rol)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {NOMBRE_ROL[r]}
            </option>
          ))}
        </select>
        <span className="campo__ayuda">{QUE_HACE[rol]}</span>
      </label>
      {rol !== 'admin' && todos.length > 1 && (
        <div className="campo">
          <span className="campo__etiqueta">En qué locales</span>
          <div className="chips" role="group" aria-label="Locales">
            <button
              type="button"
              className="chip"
              aria-pressed={locales === null}
              onClick={() => onLocales(null)}
            >
              Todos
            </button>
            {todos.map((l) => {
              const elegido = locales?.includes(l.id) ?? false
              return (
                <button
                  key={l.id}
                  type="button"
                  className="chip"
                  aria-pressed={elegido}
                  onClick={() => {
                    const nuevos = elegido
                      ? (locales ?? []).filter((x) => x !== l.id)
                      : [...(locales ?? []), l.id]
                    onLocales(nuevos.length ? nuevos : null)
                  }}
                >
                  {l.nombre}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

function Invitar({
  locales,
  recargar,
  onCerrar,
}: {
  locales: LocalDelBar[]
  recargar: () => Promise<void>
  onCerrar: () => void
}) {
  const { org } = useSesionLista()
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState<Rol>('recepcion')
  const [elegidos, setElegidos] = useState<string[] | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [sumado, setSumado] = useState<{ nombre: string; email: string } | null>(null)

  async function sumar(e: FormEvent) {
    e.preventDefault()
    const r = invitacionSchema.safeParse({
      email,
      nombre,
      rol,
      locales: rol === 'admin' ? null : elegidos,
    })
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.')
    setGuardando(true)
    setError('')
    const respuesta = await invitar(r.data)
    setGuardando(false)
    if (!respuesta.ok) return setError(respuesta.error)
    setSumado({ nombre: r.data.nombre, email: r.data.email })
    await recargar()
  }

  if (sumado) {
    const mensaje = `Hola ${sumado.nombre}! Te sumé a ${org.nombre} en SupplyIA. Entrá a ${window.location.origin} con tu mail (${sumado.email}): tocá "mandame un mail para entrar" y seguí los pasos.`
    return (
      <div className="card formulario">
        <p className="aviso aviso--ok" role="status">
          <strong>{sumado.nombre} ya está en el equipo.</strong> Avisale que entre con su mail (
          {sumado.email}): no necesita contraseña.
        </p>
        <a
          className="boton boton--secundario"
          href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle size={18} aria-hidden="true" />
          Avisarle por WhatsApp
        </a>
        <button className="boton boton--texto" onClick={onCerrar}>
          Listo
        </button>
      </div>
    )
  }

  return (
    <form className="card formulario" onSubmit={sumar} noValidate>
      <label className="campo">
        <span className="campo__etiqueta">Mail de la persona</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nombre@mail.com"
        />
      </label>
      <label className="campo">
        <span className="campo__etiqueta">Nombre</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} />
      </label>
      <RolYLocales
        rol={rol}
        locales={elegidos}
        todos={locales}
        onRol={setRol}
        onLocales={setElegidos}
      />
      {error && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}
      <button className="boton boton--primario" disabled={guardando}>
        {guardando ? 'Sumando…' : 'Sumar al equipo'}
      </button>
      <button type="button" className="boton boton--texto" onClick={onCerrar}>
        Cancelar
      </button>
    </form>
  )
}

function FilaMiembro({
  miembro,
  soyYo,
  locales,
  recargar,
}: {
  miembro: Miembro
  soyYo: boolean
  locales: LocalDelBar[]
  recargar: () => Promise<void>
}) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(miembro.nombre)
  const [rol, setRol] = useState<Rol>(miembro.rol)
  const [elegidos, setElegidos] = useState<string[] | null>(miembro.locales)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function hacer(accion: () => Promise<{ ok: true } | { ok: false; mensaje: string }>) {
    setGuardando(true)
    setError('')
    const r = await accion()
    setGuardando(false)
    if (!r.ok) return setError(r.mensaje)
    setEditando(false)
    await recargar()
  }

  if (editando) {
    return (
      <form
        className="lista__fila fila-edicion"
        onSubmit={(e) => {
          e.preventDefault()
          if (!nombre.trim()) return setError('Escribí el nombre de la persona.')
          void hacer(() =>
            editarMiembro(miembro.user_id, {
              nombre: nombre.trim(),
              rol,
              locales: rol === 'admin' ? null : elegidos,
            }),
          )
        }}
      >
        <label className="campo">
          <span className="campo__etiqueta">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} />
        </label>
        <RolYLocales
          rol={rol}
          locales={elegidos}
          todos={locales.filter((l) => l.activo)}
          onRol={setRol}
          onLocales={setElegidos}
        />
        {error && (
          <p className="aviso aviso--error" role="alert">
            {error}
          </p>
        )}
        <div className="fila-edicion__botones">
          <button className="boton boton--primario boton--chico" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="boton boton--texto" onClick={() => setEditando(false)}>
            Cancelar
          </button>
          {!soyYo && (
            <button
              type="button"
              className="boton boton--texto boton--peligro"
              disabled={guardando}
              onClick={() => hacer(() => cambiarAcceso(miembro.user_id, false))}
            >
              Dar de baja
            </button>
          )}
        </div>
      </form>
    )
  }

  return (
    <div className="lista__fila">
      <span className="lista__texto">
        <span className="lista__titulo">
          {miembro.nombre}
          {soyYo && <span className="pastilla pastilla--gris fila-miembro__vos">Vos</span>}
        </span>
        <span className="lista__detalle">
          {NOMBRE_ROL[miembro.rol]} · {textoLocales(miembro.locales, locales)}
        </span>
        {miembro.email && <span className="lista__detalle">{miembro.email}</span>}
        {error && (
          <span className="campo__ayuda campo__ayuda--error" role="alert">
            {error}
          </span>
        )}
      </span>
      {miembro.activo ? (
        <button
          className="boton boton--texto"
          onClick={() => setEditando(true)}
          aria-label={`Editar a ${miembro.nombre}`}
        >
          Editar
        </button>
      ) : (
        <button
          className="boton boton--texto"
          disabled={guardando}
          onClick={() => hacer(() => cambiarAcceso(miembro.user_id, true))}
          aria-label={`Reactivar a ${miembro.nombre}`}
        >
          Reactivar
        </button>
      )}
    </div>
  )
}
