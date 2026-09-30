// Piezas que comparten las secciones del panel.

import { useState } from 'react'
import { cambiarEstadoDiferencia } from '../../admin/acciones'
import { ESTADOS_DIFERENCIA, type EstadoDiferencia } from '../../admin/estados'
import type { CambioDePrecio, RecepcionPanel } from '../../admin/resumen'
import { numero, pesos, porcentaje } from '../../lib/formato'
import { numeroPedido } from '../../pedidos/tipos'
import { diaMes } from '../../lib/tiempo'
import { usePanel } from './contexto'

/** Precio unitario: redondo desde $100 (2.900), con centavos si es chico (0,45). */
const precio = (n: number) => numero(n >= 100 ? Math.round(n) : n)

export function Vacio({ children }: { children: string }) {
  return <p className="bloque__vacio">{children}</p>
}

export function TablaCambios({ cambios }: { cambios: CambioDePrecio[] }) {
  const { catalogo, proveedor } = usePanel()
  if (!cambios.length) return <Vacio>No hubo cambios de precio en este período.</Vacio>
  const producto = (id: string) => {
    const p = catalogo.productos.find((x) => x.id === id)
    const unidad = catalogo.unidades.find((u) => u.id === p?.unidad_base_id)?.nombre
    return `${p?.nombre ?? 'Producto'}${unidad ? ` · ${unidad}` : ''}`
  }
  return (
    <table className="tabla">
      <thead>
        <tr>
          <th>Proveedor</th>
          <th>Producto</th>
          <th className="tabla__numero">Antes</th>
          <th className="tabla__numero">Ahora</th>
          <th className="tabla__numero">Var.</th>
          <th className="tabla__numero">Fecha</th>
        </tr>
      </thead>
      <tbody>
        {cambios.map((c) => (
          <tr key={`${c.producto_id}-${c.fecha}`}>
            <td className="tabla__fuerte">{proveedor(c.proveedor_id)}</td>
            <td>
              {producto(c.producto_id)}
              {c.saltoRaro && (
                <span className="pastilla pastilla--atencion tabla__nota">Revisá la unidad</span>
              )}
            </td>
            <td className="tabla__numero tabla__gris">{precio(c.antes)}</td>
            <td className="tabla__numero">{precio(c.ahora)}</td>
            <td
              className={`tabla__numero tabla__fuerte ${
                c.saltoRaro ? 'tabla__gris' : c.variacionPct > 0 ? 'tabla__error' : 'tabla__ok'
              }`}
            >
              {porcentaje(c.variacionPct)}
            </td>
            <td className="tabla__numero tabla__gris">{diaMes(c.fecha)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Recepciones con diferencias, cada una con el estado del reclamo para ir siguiéndolo. */
export function Diferencias({
  recepciones,
  limite,
}: {
  recepciones: RecepcionPanel[]
  limite?: number
}) {
  const { proveedor, recargar } = usePanel()
  const [guardando, setGuardando] = useState<string | null>(null)
  const [error, setError] = useState('')
  if (!recepciones.length) return <Vacio>Todo llegó como se pidió.</Vacio>
  const lista = limite ? recepciones.slice(0, limite) : recepciones

  async function cambiar(id: string, estado: EstadoDiferencia) {
    setGuardando(id)
    setError('')
    const r = await cambiarEstadoDiferencia(id, estado)
    if (r.ok) await recargar()
    else setError(r.mensaje)
    setGuardando(null)
  }

  return (
    <>
      {error && (
        <p className="aviso aviso--error bloque__aviso" role="alert">
          {error}
        </p>
      )}
      <ul className="diferencias">
        {lista.map((x) => (
          <li key={x.id} className="diferencias__recepcion">
            <div className="diferencias__cabeza">
              <strong>
                {proveedor(x.proveedor_id)}
                {x.pedido_numero !== null && ` ${numeroPedido(x.pedido_numero)}`}
              </strong>
              <span className="tabla__numero tabla__error">
                {pesos(x.diferencias.reduce((s, d) => s + Math.abs(d.monto ?? 0), 0))}
              </span>
            </div>
            {x.diferencias.map((d) => (
              <div key={d.id} className="diferencias__fila">
                <span>{d.detalle}</span>
                <select
                  aria-label={`Estado de: ${d.detalle}`}
                  className={`pastilla ${ESTADOS_DIFERENCIA[d.estado as EstadoDiferencia]?.clase ?? 'pastilla--gris'}`}
                  value={d.estado}
                  disabled={guardando === d.id}
                  onChange={(e) => cambiar(d.id, e.target.value as EstadoDiferencia)}
                >
                  {Object.entries(ESTADOS_DIFERENCIA).map(([valor, { texto }]) => (
                    <option key={valor} value={valor}>
                      {texto}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </li>
        ))}
      </ul>
      {limite && recepciones.length > limite && (
        <p className="bloque__vacio">
          Y {recepciones.length - limite} más en Recepciones y remitos.
        </p>
      )}
    </>
  )
}

export function Barras({ filas }: { filas: { clave: string; texto: string; valor: number }[] }) {
  if (!filas.length) return <Vacio>No hubo compras en este período.</Vacio>
  const maximo = Math.max(...filas.map((f) => f.valor), 1)
  return (
    <ul className="barras">
      {filas.map((f) => (
        <li key={f.clave} className="barras__fila">
          <span className="barras__texto">{f.texto}</span>
          <span className="barras__pista" aria-hidden="true">
            <span className="barras__barra" style={{ width: `${(f.valor / maximo) * 100}%` }} />
          </span>
          <span className="tabla__numero tabla__fuerte">{pesos(f.valor)}</span>
        </li>
      ))}
    </ul>
  )
}
