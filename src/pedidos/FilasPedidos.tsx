import { Link } from 'react-router'
import type { Catalogo } from '../catalogo/tipos'
import { hace } from '../lib/tiempo'
import { ESTADOS, numeroPedido, type Pedido } from './tipos'

/** Filas de pedidos (Inicio y lista de pedidos): proveedor, número, cuándo y estado. */
export function FilasPedidos({
  pedidos,
  catalogo,
  vacia,
}: {
  pedidos: Pedido[]
  catalogo: Catalogo
  vacia: string
}) {
  return (
    <section className="lista" aria-label="Pedidos">
      {pedidos.length === 0 && <p className="lista__vacia">{vacia}</p>}
      {pedidos.map((p) => {
        const proveedor = catalogo.proveedores.find((x) => x.id === p.proveedor_id)
        const estado = p.subida
          ? p.subida.error
            ? { texto: 'No se pudo subir', clase: 'pastilla--error' }
            : { texto: 'Pendiente de subir', clase: 'pastilla--atencion' }
          : ESTADOS[p.estado]
        return (
          <Link key={p.id} to={`/pedidos/${p.id}`} className="lista__fila">
            <span className="lista__texto">
              <span className="lista__titulo">{proveedor?.nombre ?? 'Proveedor'}</span>
              <span className="lista__detalle">
                <span className="mono">{numeroPedido(p.numero)}</span> · {p.items.length}{' '}
                {p.items.length === 1 ? 'producto' : 'productos'} · {hace(p.creado_at)}
              </span>
            </span>
            <span className={`pastilla ${estado.clase}`}>{estado.texto}</span>
          </Link>
        )
      })}
    </section>
  )
}
