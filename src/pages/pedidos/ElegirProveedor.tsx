import { useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Search } from 'lucide-react'
import { EsperarCatalogo } from '../../catalogo/EsperarCatalogo'
import type { Catalogo } from '../../catalogo/tipos'
import { normalizar } from '../../lib/normalizar'
import { diasHastaEntrega, textoProximaEntrega } from '../../lib/tiempo'
import { leerBorrador } from '../../pedidos/borrador'
import { useSesionLista } from '../../sesion/contexto'

export function ElegirProveedor() {
  return (
    <>
      <div>
        <div className="sobretitulo">Nuevo pedido</div>
        <h1>¿A quién le pedís?</h1>
      </div>
      <EsperarCatalogo>{(catalogo) => <Lista catalogo={catalogo} />}</EsperarCatalogo>
    </>
  )
}

function Lista({ catalogo }: { catalogo: Catalogo }) {
  const { usuario } = useSesionLista()
  const [busqueda, setBusqueda] = useState('')

  const productosPor = new Map<string, number>()
  for (const p of catalogo.productos) {
    if (p.activo) productosPor.set(p.proveedor_id, (productosPor.get(p.proveedor_id) ?? 0) + 1)
  }
  // Primero los que entregan antes; los que no tienen días fijos, al final.
  const orden = (dias: number[]) => diasHastaEntrega(dias) ?? 99
  const proveedores = catalogo.proveedores
    .filter((p) => p.activo)
    .sort(
      (a, b) => orden(a.dias_entrega) - orden(b.dias_entrega) || a.nombre.localeCompare(b.nombre),
    )
  const q = normalizar(busqueda)
  const visibles = q ? proveedores.filter((p) => normalizar(p.nombre).includes(q)) : proveedores

  if (proveedores.length === 0) {
    return (
      <section className="card formulario">
        <p className="formulario__ayuda">
          <strong>Todavía no hay proveedores.</strong> Cargalos en Proveedores y después volvé acá
          para pedir.
        </p>
        <Link to="/proveedores/nuevo" className="boton boton--primario">
          Agregar proveedor
        </Link>
      </section>
    )
  }

  return (
    <>
      {proveedores.length > 6 && (
        <label className="buscador">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="Buscar proveedor"
            aria-label="Buscar proveedor"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
      )}
      <section className="lista" aria-label="Proveedores">
        {visibles.length === 0 && (
          <p className="lista__vacia">Ningún proveedor coincide con la búsqueda.</p>
        )}
        {visibles.map((p) => {
          const cantidad = productosPor.get(p.id) ?? 0
          const borrador = leerBorrador(usuario.id, p.id)
          return (
            <Link key={p.id} to={`/pedir/${p.id}`} className="lista__fila">
              <span className="lista__texto">
                <span className="lista__titulo">{p.nombre}</span>
                <span className="lista__detalle">
                  {textoProximaEntrega(p.dias_entrega)}
                  {p.hora_limite ? ` · pedir antes de ${p.hora_limite}` : ''} · {cantidad}{' '}
                  {cantidad === 1 ? 'producto' : 'productos'}
                </span>
              </span>
              {borrador ? (
                <span className="pastilla pastilla--atencion">Sin enviar</span>
              ) : (
                <ChevronRight size={20} className="texto-gris" aria-hidden="true" />
              )}
            </Link>
          )
        })}
      </section>
    </>
  )
}
