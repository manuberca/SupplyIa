import { useState } from 'react'
import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { EsperarCatalogo } from '../../catalogo/EsperarCatalogo'
import { puede } from '../../lib/permisos'
import { usePedidos } from '../../pedidos/contexto'
import { FilasPedidos } from '../../pedidos/FilasPedidos'
import { EN_CURSO } from '../../pedidos/tipos'
import { useSesionLista } from '../../sesion/contexto'

export function Pedidos() {
  const { miembro, local } = useSesionLista()
  const { pedidos, estado, mensajeError, recargar } = usePedidos()
  const [todos, setTodos] = useState(false)
  const visibles = todos ? pedidos : pedidos.filter((p) => p.subida || EN_CURSO.includes(p.estado))

  return (
    <>
      <div className="seccion-encabezado">
        <div>
          <div className="sobretitulo">{local?.nombre}</div>
          <h1>Pedidos</h1>
        </div>
        {puede(miembro.rol, 'pedir') && (
          <Link to="/pedir" className="boton boton--primario">
            <Plus size={18} aria-hidden="true" />
            Nuevo
          </Link>
        )}
      </div>

      <div className="chips" role="group" aria-label="Qué pedidos ver">
        <button className="chip" aria-pressed={!todos} onClick={() => setTodos(false)}>
          En curso
        </button>
        <button className="chip" aria-pressed={todos} onClick={() => setTodos(true)}>
          Todos
        </button>
      </div>

      {mensajeError && (
        <p className="aviso aviso--atencion" role="status">
          {mensajeError} {pedidos.length > 0 && 'Te mostramos los últimos que guardó el celular.'}{' '}
          <button className="enlace-accion" onClick={() => void recargar()}>
            Probar de nuevo
          </button>
        </p>
      )}

      {estado === 'cargando' ? (
        <p className="texto-gris">Cargando pedidos…</p>
      ) : (
        <EsperarCatalogo>
          {(catalogo) => (
            <FilasPedidos
              pedidos={visibles}
              catalogo={catalogo}
              vacia={todos ? 'Todavía no hay pedidos en este local.' : 'No hay pedidos en curso.'}
            />
          )}
        </EsperarCatalogo>
      )}
    </>
  )
}
