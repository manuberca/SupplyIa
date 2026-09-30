import { useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, PackageOpen } from 'lucide-react'
import { EsperarCatalogo } from '../../catalogo/EsperarCatalogo'
import type { Catalogo } from '../../catalogo/tipos'
import { hace } from '../../lib/tiempo'
import { usePedidos } from '../../pedidos/contexto'
import { numeroPedido } from '../../pedidos/tipos'

/** Estados de un pedido que todavía puede llegar. */
const POR_LLEGAR = ['enviado', 'no_llego', 'recibido_parcial'] as const

export function Recibir() {
  return (
    <>
      <div>
        <div className="sobretitulo">Recibir mercadería</div>
        <h1>¿Qué llegó?</h1>
      </div>
      <EsperarCatalogo>{(catalogo) => <Opciones catalogo={catalogo} />}</EsperarCatalogo>
    </>
  )
}

function Opciones({ catalogo }: { catalogo: Catalogo }) {
  const { pedidos, estado } = usePedidos()
  const [sinPedido, setSinPedido] = useState(false)
  const porLlegar = pedidos.filter(
    (p) => !p.subida && (POR_LLEGAR as readonly string[]).includes(p.estado),
  )
  const proveedores = catalogo.proveedores.filter((p) => p.activo)

  return (
    <>
      <section className="lista" aria-label="Pedidos por llegar">
        {estado === 'cargando' && <p className="lista__vacia">Cargando pedidos…</p>}
        {estado !== 'cargando' && porLlegar.length === 0 && (
          <p className="lista__vacia">No hay pedidos esperando en este local.</p>
        )}
        {porLlegar.map((p) => {
          const proveedor = catalogo.proveedores.find((x) => x.id === p.proveedor_id)
          return (
            <Link key={p.id} to={`/recibir/pedido/${p.id}`} className="lista__fila">
              <span className="lista__texto">
                <span className="lista__titulo">{proveedor?.nombre ?? 'Proveedor'}</span>
                <span className="lista__detalle">
                  <span className="mono">{numeroPedido(p.numero)}</span> · {p.items.length}{' '}
                  {p.items.length === 1 ? 'producto' : 'productos'} · pedido {hace(p.creado_at)}
                </span>
              </span>
              <ChevronRight size={20} className="texto-gris" aria-hidden="true" />
            </Link>
          )
        })}
      </section>

      {sinPedido ? (
        <>
          <h2>¿De qué proveedor?</h2>
          <section className="lista" aria-label="Proveedores">
            {proveedores.length === 0 && (
              <p className="lista__vacia">Todavía no hay proveedores cargados.</p>
            )}
            {proveedores.map((p) => (
              <Link key={p.id} to={`/recibir/proveedor/${p.id}`} className="lista__fila">
                <span className="lista__titulo">{p.nombre}</span>
                <ChevronRight size={20} className="texto-gris" aria-hidden="true" />
              </Link>
            ))}
          </section>
        </>
      ) : (
        <button className="boton boton--secundario" onClick={() => setSinPedido(true)}>
          <PackageOpen size={18} aria-hidden="true" />
          Llegó algo sin pedido
        </button>
      )}
    </>
  )
}
