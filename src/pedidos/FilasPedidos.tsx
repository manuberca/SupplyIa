import { Link } from 'react-router'
import type { Catalogo } from '../catalogo/tipos'
import { pesos } from '../lib/formato'
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
                <span className="mono">{numeroPedido(p.numero)}</span> · {detalle(p, catalogo)}
              </span>
            </span>
            <span className={`pastilla ${estado.clase}`}>{estado.texto}</span>
          </Link>
        )
      })}
    </section>
  )
}

/** "Llegó hoy 10:42 · faltó Entraña" · "Recibido completo · $186.300" · "Enviado hace 2 h" */
function detalle(p: Pedido, catalogo: Catalogo): string {
  const r = p.recepcion
  if (r && !p.subida) {
    if (r.faltantes.length) {
      const nombres = r.faltantes.map(
        (id) => catalogo.productos.find((x) => x.id === id)?.nombre ?? 'un producto',
      )
      const cuales =
        nombres.length > 2
          ? `${nombres.slice(0, 2).join(', ')} y ${nombres.length - 2} más`
          : nombres.join(' y ')
      return `Llegó ${cuando(r.recibidoAt)} · faltó ${cuales}`
    }
    return `Recibido completo${r.total ? ` · ${pesos(r.total)}` : ''}`
  }
  return `${p.items.length} ${p.items.length === 1 ? 'producto' : 'productos'} · ${p.subida ? 'hecho' : 'enviado'} ${hace(p.creado_at)}`
}

/** "hoy 10:42" · "ayer 18:05" · "hace 3 días" */
function cuando(iso: string): string {
  const d = new Date(iso)
  const hoy = new Date()
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === hoy.toDateString()) return `hoy ${hora}`
  const ayer = new Date(hoy.getTime() - 86_400_000)
  if (d.toDateString() === ayer.toDateString()) return `ayer ${hora}`
  return hace(iso)
}
