import { useState } from 'react'
import { Link } from 'react-router'
import { LayoutDashboard, LogOut } from 'lucide-react'
import { NOMBRE_ROL, puede } from '../lib/permisos'
import { useSesion, useSesionLista } from '../sesion/contexto'
import { ControlAjustes } from './ajustes/ControlAjustes'
import { UnidadesAjustes } from './ajustes/UnidadesAjustes'

export function Ajustes() {
  const { salir, elegirLocal } = useSesion()
  const { usuario, miembro, org, locales, local } = useSesionLista()
  const [saliendo, setSaliendo] = useState(false)
  const esAdmin = puede(miembro.rol, 'ajustes_org')

  async function cerrarSesion() {
    setSaliendo(true)
    await salir()
  }

  return (
    <>
      <div>
        <div className="sobretitulo">{org.nombre}</div>
        <h1>{esAdmin ? 'Ajustes' : 'Tu cuenta'}</h1>
      </div>

      {locales.length > 1 && (
        <section className="card formulario">
          <label className="campo">
            <span className="campo__etiqueta">Local en el que estás</span>
            <select value={local?.id ?? ''} onChange={(e) => elegirLocal(e.target.value)}>
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {esAdmin && (
        <Link to="/admin" className="boton boton--secundario">
          <LayoutDashboard size={18} aria-hidden="true" />
          Panel de administración
        </Link>
      )}

      {esAdmin && <ControlAjustes />}

      {esAdmin && <UnidadesAjustes />}

      <section className="card formulario">
        <dl className="datos">
          <div>
            <dt>Nombre</dt>
            <dd>{miembro.nombre}</dd>
          </div>
          <div>
            <dt>Mail</dt>
            <dd>{usuario.email}</dd>
          </div>
          <div>
            <dt>Rol</dt>
            <dd>{NOMBRE_ROL[miembro.rol]}</dd>
          </div>
        </dl>
        <button className="boton boton--secundario" onClick={cerrarSesion} disabled={saliendo}>
          <LogOut size={18} aria-hidden="true" />
          {saliendo ? 'Saliendo…' : 'Cerrar sesión'}
        </button>
      </section>
    </>
  )
}
