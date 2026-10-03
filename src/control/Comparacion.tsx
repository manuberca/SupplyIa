import { useState } from 'react'
import { Scale, Search } from 'lucide-react'
import { compararProductos, dejarDeComparar } from '../catalogo/acciones'
import { useCatalogo } from '../catalogo/contexto'
import type { Catalogo, Producto } from '../catalogo/tipos'
import { numero, pesos, porcentaje } from '../lib/formato'
import { normalizar } from '../lib/normalizar'
import { hace } from '../lib/tiempo'
import {
  ahorroPosible,
  candidatosParaComparar,
  cantidadPorProducto,
  compararOpciones,
  opcionesDelGrupo,
} from './comparar'
import type { DatosControl } from './contexto'

/** En Precios: el mismo producto en otros proveedores, quién lo vende más barato y el ahorro. */
export function Comparacion({
  producto,
  catalogo,
  datos,
}: {
  producto: Producto
  catalogo: Catalogo
  datos: DatosControl
}) {
  const { recargar } = useCatalogo()
  const [eligiendo, setEligiendo] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const unidad = catalogo.unidades.find((u) => u.id === producto.unidad_base_id)?.nombre ?? ''
  const proveedor = (id: string) => catalogo.proveedores.find((p) => p.id === id)?.nombre ?? ''

  async function hacer(accion: () => Promise<{ ok: true } | { ok: false; mensaje: string }>) {
    setGuardando(true)
    setError('')
    const r = await accion()
    if (r.ok) {
      await recargar()
      setEligiendo(false)
      setBusqueda('')
    } else setError(r.mensaje)
    setGuardando(false)
  }

  const ahora = new Date()
  const opciones = compararOpciones(opcionesDelGrupo(producto, catalogo), ahora)
  const aviso = error && (
    <p className="aviso aviso--error" role="alert">
      {error}
    </p>
  )

  if (opciones.length >= 2) {
    const comprado = cantidadPorProducto(datos.renglones, ahora).get(producto.id) ?? 0
    const ahorro = ahorroPosible(opciones, producto.id, comprado)
    const esta = opciones.find((o) => o.productoId === producto.id)
    return (
      <section className="comparacion" aria-label="Comparación entre proveedores">
        <div className="lista__titulo">
          <Scale size={16} aria-hidden="true" /> El mismo producto en otros proveedores
        </div>
        <ul className="comparacion__lista">
          {opciones.map((o) => (
            <li key={o.productoId} data-actual={o.productoId === producto.id}>
              <span className="lista__texto">
                <span className="lista__titulo">{proveedor(o.proveedorId)}</span>
                <span className="lista__detalle">
                  {o.nombre}
                  {o.fecha ? ` · ${hace(o.fecha)}` : ''}
                </span>
              </span>
              <span className="mono">
                {o.precio === null ? '—' : `${pesos(o.precio)}/${unidad}`}
              </span>
              {o.esLaMasBarata ? (
                <span className="pastilla pastilla--ok">El más barato</span>
              ) : o.masCaraPct !== null ? (
                <span className="pastilla pastilla--error">{porcentaje(o.masCaraPct)}</span>
              ) : (
                <span className="pastilla pastilla--gris">
                  {o.precio === null ? 'Sin precio' : 'Precio viejo'}
                </span>
              )}
            </li>
          ))}
        </ul>
        {ahorro ? (
          <p className="aviso aviso--atencion">
            En 30 días le compraste {numero(comprado, 2)} {unidad} a{' '}
            {proveedor(producto.proveedor_id)}. Con {proveedor(ahorro.mejor.proveedorId)} hubieras
            pagado <strong>{pesos(ahorro.ahorro)} menos</strong>.
          </p>
        ) : esta?.esLaMasBarata ? (
          <p className="aviso aviso--ok">Se lo estás comprando al más barato.</p>
        ) : !opciones.some((o) => o.esLaMasBarata) ? (
          <p className="campo__ayuda">
            Hacen falta dos precios de los últimos 3 meses para comparar. Aparecen al recibir
            mercadería de cada proveedor.
          </p>
        ) : null}
        {aviso}
        <button
          className="boton boton--texto"
          disabled={guardando}
          onClick={() =>
            hacer(() =>
              dejarDeComparar(
                producto,
                catalogo.productos.filter((p) => p.comparable_id === producto.comparable_id),
              ),
            )
          }
        >
          Dejar de comparar este producto
        </button>
      </section>
    )
  }

  if (!eligiendo) {
    return (
      <button className="enlace-accion" onClick={() => setEligiendo(true)}>
        <Scale size={16} aria-hidden="true" />
        Comparar con otro proveedor
      </button>
    )
  }

  const q = normalizar(busqueda)
  const candidatos = candidatosParaComparar(producto, catalogo.productos)
    .filter((p) => !q || normalizar(`${p.nombre} ${proveedor(p.proveedor_id)}`).includes(q))
    .slice(0, 8)

  return (
    <section className="comparacion" aria-label="Elegir con qué comparar">
      <div className="lista__titulo">¿En qué otro proveedor comprás lo mismo?</div>
      <p className="campo__ayuda">
        Elegí el producto que es el mismo que {producto.nombre} (también en {unidad}). Los nombres
        no tienen que coincidir.
      </p>
      <label className="buscador">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          placeholder="Buscar producto o proveedor"
          aria-label="Buscar producto para comparar"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </label>
      {candidatos.length === 0 ? (
        <p className="campo__ayuda">
          No hay productos de otros proveedores en {unidad}
          {q ? ' que coincidan con la búsqueda' : ''}.
        </p>
      ) : (
        <div className="lista">
          {candidatos.map((p) => {
            const precio = catalogo.precios.get(p.id)
            return (
              <button
                key={p.id}
                className="lista__fila fila-boton"
                disabled={guardando}
                onClick={() => hacer(() => compararProductos(producto, p))}
              >
                <span className="lista__texto">
                  <span className="lista__titulo">{p.nombre}</span>
                  <span className="lista__detalle">{proveedor(p.proveedor_id)}</span>
                </span>
                <span className="mono">
                  {precio ? `${pesos(precio.precio_base)}/${unidad}` : '—'}
                </span>
              </button>
            )
          })}
        </div>
      )}
      {aviso}
      <button className="boton boton--texto" onClick={() => setEligiendo(false)}>
        Cancelar
      </button>
    </section>
  )
}
