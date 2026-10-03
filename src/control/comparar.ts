// Comparar proveedores: para un producto que el bar marcó como "el mismo" en dos o más
// proveedores, quién lo vende más barato hoy y cuánto se hubiera ahorrado comprándoselo a ese.
// Solo se comparan precios recientes: uno de hace meses ya no dice nada.

import type { Catalogo, Producto } from '../catalogo/tipos'
import { parecido } from '../recepcion/puntuar'

const DIA = 24 * 60 * 60 * 1000
/** Un precio más viejo que esto no se usa para decir "es más barato". */
export const VIGENCIA_DIAS = 90

export type Opcion = {
  productoId: string
  proveedorId: string
  nombre: string
  /** Último precio por unidad base (null: nunca se le compró). */
  precio: number | null
  fecha: string | null
}

/** Las opciones de un grupo de productos comparables, con el último precio de cada una. */
export function opcionesDelGrupo(producto: Producto, catalogo: Catalogo): Opcion[] {
  if (!producto.comparable_id) return []
  return catalogo.productos
    .filter((p) => p.comparable_id === producto.comparable_id && p.activo)
    .map((p) => {
      const precio = catalogo.precios.get(p.id)
      return {
        productoId: p.id,
        proveedorId: p.proveedor_id,
        nombre: p.nombre,
        precio: precio?.precio_base ?? null,
        fecha: precio?.fecha ?? null,
      }
    })
}

/** Si el mismo producto está más barato en otro proveedor (precios vigentes), cuál y cuánto. */
export function masBaratoEnOtro(
  producto: Producto,
  catalogo: Catalogo,
  ahora: Date,
): { proveedorId: string; precio: number; menosPct: number } | null {
  const opciones = compararOpciones(opcionesDelGrupo(producto, catalogo), ahora)
  const esta = opciones.find((o) => o.productoId === producto.id)
  const mejor = opciones.find((o) => o.esLaMasBarata)
  if (!esta?.vigente || !mejor || mejor.productoId === producto.id) return null
  const menosPct = Math.round(((esta.precio! - mejor.precio!) / esta.precio!) * 1000) / 10
  // Menos de 3 % no justifica cambiar de proveedor.
  return menosPct >= 3 ? { proveedorId: mejor.proveedorId, precio: mejor.precio!, menosPct } : null
}

export type OpcionComparada = Opcion & {
  vigente: boolean
  esLaMasBarata: boolean
  /** Cuánto más cara que la más barata, en % (0 para la más barata; null si no se puede comparar). */
  masCaraPct: number | null
}

export function compararOpciones(opciones: readonly Opcion[], ahora: Date): OpcionComparada[] {
  const vigente = (o: Opcion) =>
    o.precio !== null &&
    o.precio > 0 &&
    o.fecha !== null &&
    ahora.getTime() - Date.parse(o.fecha) <= VIGENCIA_DIAS * DIA
  const vigentes = opciones.filter(vigente)
  const minimo = vigentes.length >= 2 ? Math.min(...vigentes.map((o) => o.precio!)) : null
  return [...opciones]
    .map((o) => {
      const ok = vigente(o)
      return {
        ...o,
        vigente: ok,
        esLaMasBarata: ok && minimo !== null && o.precio === minimo,
        masCaraPct:
          ok && minimo !== null ? Math.round(((o.precio! - minimo) / minimo) * 1000) / 10 : null,
      }
    })
    .sort(
      (a, b) =>
        Number(b.vigente) - Number(a.vigente) ||
        (a.precio ?? Infinity) - (b.precio ?? Infinity) ||
        a.nombre.localeCompare(b.nombre),
    )
}

/**
 * Lo que se hubiera ahorrado comprando `cantidad` (en unidad base) al más barato en vez de a este.
 * null si no hay una opción vigente más barata.
 */
export function ahorroPosible(
  opciones: readonly OpcionComparada[],
  productoId: string,
  cantidad: number,
): { ahorro: number; mejor: OpcionComparada } | null {
  const actual = opciones.find((o) => o.productoId === productoId)
  const mejor = opciones.find((o) => o.esLaMasBarata)
  if (!actual?.vigente || !mejor || mejor.productoId === productoId || cantidad <= 0) return null
  const ahorro = Math.round((actual.precio! - mejor.precio!) * cantidad)
  return ahorro > 0 ? { ahorro, mejor } : null
}

/** Con qué productos de OTROS proveedores se lo puede comparar, los más parecidos primero. */
export function candidatosParaComparar<
  P extends {
    id: string
    proveedor_id: string
    nombre: string
    unidad_base_id: string
    activo: boolean
  },
>(producto: P, productos: readonly P[]): (P & { parecido: number })[] {
  return productos
    .filter(
      (p) =>
        p.activo &&
        p.proveedor_id !== producto.proveedor_id &&
        p.unidad_base_id === producto.unidad_base_id,
    )
    .map((p) => ({ ...p, parecido: parecido(p.nombre, producto.nombre) }))
    .sort((a, b) => b.parecido - a.parecido || a.nombre.localeCompare(b.nombre))
}

/** Cuánto se recibió de cada producto en los últimos `dias` (en unidad base). */
export function cantidadPorProducto(
  renglones: readonly {
    producto_id: string | null
    recibido_at: string
    cantidad_base: number | null
  }[],
  ahora: Date,
  dias = 30,
): Map<string, number> {
  const desde = ahora.getTime() - dias * DIA
  const cantidades = new Map<string, number>()
  for (const r of renglones) {
    if (!r.producto_id || !r.cantidad_base || Date.parse(r.recibido_at) <= desde) continue
    cantidades.set(r.producto_id, (cantidades.get(r.producto_id) ?? 0) + r.cantidad_base)
  }
  return cantidades
}
