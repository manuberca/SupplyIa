import { useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { cambiarMiClave } from '../../equipo/acciones'
import { LARGO_MINIMO_CLAVE } from '../../equipo/clave'
import { useSesion } from '../../sesion/contexto'

/** Ajustes → Cambiar contraseña (cualquier rol). */
export function CambiarClave() {
  const { claveProvisoria } = useSesion()
  const [abierto, setAbierto] = useState(false)
  const [clave, setClave] = useState('')
  const [repetida, setRepetida] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [lista, setLista] = useState(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (clave.length < LARGO_MINIMO_CLAVE)
      return setError(`La contraseña tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`)
    if (clave !== repetida) return setError('Las dos contraseñas no son iguales.')
    setGuardando(true)
    setError('')
    const r = await cambiarMiClave(clave)
    setGuardando(false)
    if (!r.ok) return setError(r.mensaje)
    setClave('')
    setRepetida('')
    setAbierto(false)
    setLista(true)
  }

  if (!abierto) {
    return (
      <>
        {claveProvisoria && !lista && (
          <p className="aviso aviso--atencion">
            Estás usando la contraseña provisoria que te pasaron. Cambiala por una tuya.
          </p>
        )}
        {lista && (
          <p className="aviso aviso--ok" role="status">
            Listo: ya tenés tu contraseña nueva.
          </p>
        )}
        <button className="boton boton--secundario" onClick={() => setAbierto(true)}>
          <KeyRound size={18} aria-hidden="true" />
          Cambiar contraseña
        </button>
      </>
    )
  }

  return (
    <form className="formulario" onSubmit={guardar} noValidate>
      <label className="campo">
        <span className="campo__etiqueta">Contraseña nueva</span>
        <input
          type="password"
          autoComplete="new-password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
        />
        <span className="campo__ayuda">Al menos {LARGO_MINIMO_CLAVE} caracteres.</span>
      </label>
      <label className="campo">
        <span className="campo__etiqueta">Repetila</span>
        <input
          type="password"
          autoComplete="new-password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
        />
      </label>
      {error && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}
      <button className="boton boton--primario" disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar contraseña'}
      </button>
      <button type="button" className="boton boton--texto" onClick={() => setAbierto(false)}>
        Cancelar
      </button>
    </form>
  )
}
