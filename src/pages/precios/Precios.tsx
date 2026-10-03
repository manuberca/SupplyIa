import { useState } from 'react'
import { EsperarCatalogo } from '../../catalogo/EsperarCatalogo'
import type { Catalogo } from '../../catalogo/tipos'
import { useControl, type DatosControl } from '../../control/contexto'
import { Comparacion } from '../../control/Comparacion'
import { GraficoPrecio } from '../../control/GraficoPrecio'
import { pesos, porcentaje } from '../../lib/formato'
import { hace } from '../../lib/tiempo'

export function Precios() {
  const control = useControl()
  return (
    <>
      <div>
        <h1>Precios</h1>
        <p className="subtitulo">Por proveedor, compra por compra</p>
      </div>
      {control.estado === 'cargando' && <p className="texto-gris">Cargando precios…</p>}
      {control.estado === 'error' && (
        <p className="aviso aviso--error" role="alert">
          {control.mensaje}
        </p>
      )}
      {control.estado === 'listo' && (
        <EsperarCatalogo>
          {(catalogo) => <Contenido catalogo={catalogo} datos={control.datos} />}
        </EsperarCatalogo>
      )}
    </>
  )
}

function Contenido({ catalogo, datos }: { catalogo: Catalogo; datos: DatosControl }) {
  // Proveedores con precios, del que más les comprás al que menos.
  const gastoDe = (proveedorId: string) =>
    catalogo.productos
      .filter((p) => p.proveedor_id === proveedorId)
      .reduce((s, p) => s + (datos.gasto.get(p.id) ?? 0), 0)
  const conPrecios = catalogo.proveedores
    .filter((p) => p.activo && [...datos.variaciones.values()].some((v) => v.proveedor_id === p.id))
    .sort((a, b) => gastoDe(b.id) - gastoDe(a.id) || a.nombre.localeCompare(b.nombre))

  const [proveedorId, setProveedorId] = useState(conPrecios[0]?.id ?? '')
  const [productoId, setProductoId] = useState<string | null>(null)

  if (conPrecios.length === 0) {
    return (
      <p className="nota">
        <strong>Todavía no hay precios.</strong>
        Aparecen cuando recibís mercadería (o importás el catálogo con el último precio).
      </p>
    )
  }

  const proveedor = conPrecios.find((p) => p.id === proveedorId) ?? conPrecios[0]!
  const productos = catalogo.productos
    .filter((p) => p.proveedor_id === proveedor.id && p.activo && datos.variaciones.has(p.id))
    .map((p) => ({ producto: p, variacion: datos.variaciones.get(p.id)! }))
    .sort(
      (a, b) =>
        // Los saltos raros (otra unidad) al final: no son aumentos.
        Number(a.variacion.saltoRaro) - Number(b.variacion.saltoRaro) ||
        (b.variacion.variacionPct ?? -999) - (a.variacion.variacionPct ?? -999),
    )
  const elegido = productos.find((p) => p.producto.id === productoId) ?? productos[0]
  const unidadDe = (id: string) => catalogo.unidades.find((u) => u.id === id)?.nombre ?? ''
  const aumento = datos.aumentoDe(proveedor.id)

  return (
    <>
      <div className="chips chips--desliza" role="tablist" aria-label="Proveedor">
        {conPrecios.map((p) => (
          <button
            key={p.id}
            role="tab"
            className="chip chip--oscuro"
            aria-selected={p.id === proveedor.id}
            aria-pressed={p.id === proveedor.id}
            onClick={() => {
              setProveedorId(p.id)
              setProductoId(null)
            }}
          >
            {p.nombre}
          </button>
        ))}
      </div>

      {aumento !== null && (
        <p
          className={`aviso ${aumento > catalogo.ajustes.umbral_alerta_pct ? 'aviso--error' : aumento < 0 ? 'aviso--ok' : 'aviso--info'}`}
        >
          {proveedor.nombre} {aumento > 0 ? 'subió' : aumento < 0 ? 'bajó' : 'mantuvo sus precios:'}{' '}
          {aumento !== 0 && <strong>{porcentaje(Math.abs(aumento)).replace('+', '')}</strong>} en 30
          días, según lo que le comprás.
        </p>
      )}

      {elegido && (
        <section
          className="card tarjeta-precio"
          aria-label={`Precio de ${elegido.producto.nombre}`}
        >
          <div className="seccion-encabezado">
            <div>
              <div className="lista__titulo">{elegido.producto.nombre}</div>
              <div className="precio-grande">
                {pesos(elegido.variacion.ultimo)}
                <span>/{unidadDe(elegido.producto.unidad_base_id)}</span>
              </div>
            </div>
            {elegido.variacion.saltoRaro ? (
              <span className="pastilla pastilla--atencion">Revisá la unidad</span>
            ) : (
              elegido.variacion.variacionPct !== null && (
                <span
                  className={`pastilla ${elegido.variacion.variacionPct > 0 ? 'pastilla--error' : 'pastilla--ok'}`}
                >
                  {porcentaje(elegido.variacion.variacionPct)} en el mes
                </span>
              )
            )}
          </div>
          {elegido.variacion.saltoRaro && (
            <p className="aviso aviso--atencion">
              El precio cambió demasiado para ser un aumento: seguramente se cargó en otra unidad
              (por caja en vez de por {unidadDe(elegido.producto.unidad_base_id)}, o al revés). No
              se cuenta en los aumentos.
            </p>
          )}
          <GraficoPrecio
            serie={elegido.variacion.serie}
            unidad={unidadDe(elegido.producto.unidad_base_id)}
          />
          <p className="campo__ayuda">Última compra {hace(elegido.variacion.fechaUltimo)}</p>
          <Comparacion
            key={elegido.producto.id}
            producto={elegido.producto}
            catalogo={catalogo}
            datos={datos}
          />
        </section>
      )}

      <h2>Lo que le comprás a {proveedor.nombre}</h2>
      <section className="lista" aria-label="Productos">
        {productos.map(({ producto, variacion }) => (
          <button
            key={producto.id}
            className="lista__fila fila-boton"
            aria-pressed={producto.id === elegido?.producto.id}
            onClick={() => setProductoId(producto.id)}
          >
            <span className="lista__texto">
              <span className="lista__titulo">{producto.nombre}</span>
              <span className="lista__detalle mono">
                {pesos(variacion.ultimo)}/{unidadDe(producto.unidad_base_id)}
              </span>
            </span>
            {variacion.saltoRaro ? (
              <span className="pastilla pastilla--atencion">Revisá la unidad</span>
            ) : variacion.variacionPct !== null ? (
              <span
                className={`pastilla ${variacion.variacionPct > 0 ? 'pastilla--error' : 'pastilla--ok'}`}
              >
                {porcentaje(variacion.variacionPct)}
              </span>
            ) : (
              <span className="texto-gris">—</span>
            )}
          </button>
        ))}
      </section>
    </>
  )
}
