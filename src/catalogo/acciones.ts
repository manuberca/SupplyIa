// Escrituras del catálogo. Cada alta lleva un id generado en la app: si se reintenta
// (por ejemplo, porque se cortó la señal justo después de guardar), no se duplica.
// En la etapa 3 estas mismas operaciones pasan por la cola sin conexión (SPEC §8).

import { supabase } from '../lib/supabase'
import { reportar } from '../lib/errores'
import { SIN_CONEXION } from '../lib/errores-auth'
import {
  ERROR_DB_DESCONOCIDO,
  esReintentoDeAlta,
  mensajeErrorDb,
  type ErrorDb,
} from '../lib/errores-db'
import type { DatosImportacion } from './importacion'
import type { TipoUnidad } from './tipos'

export type Resultado = { ok: true } | { ok: false; mensaje: string }

const OK: Resultado = { ok: true }

function fallo(error: ErrorDb, contexto: string): Resultado {
  const mensaje = mensajeErrorDb(error)
  if (mensaje === ERROR_DB_DESCONOCIDO) reportar(error, contexto)
  return { ok: false, mensaje }
}

/** Corre los pasos en orden y corta en el primer error. Sin señal ni lo intenta. */
async function ejecutar(
  contexto: string,
  pasos: (() => PromiseLike<{ error: ErrorDb }>)[],
): Promise<Resultado> {
  if (!navigator.onLine) return { ok: false, mensaje: SIN_CONEXION }
  try {
    for (const paso of pasos) {
      const { error } = await paso()
      if (error && !esReintentoDeAlta(error)) return fallo(error, contexto)
    }
    return OK
  } catch (error) {
    return fallo(error as ErrorDb, contexto)
  }
}

// ─── Proveedores ───────────────────────────────────────────────────────────

export type DatosProveedor = {
  id: string
  nombre: string
  whatsapp: string
  dias_entrega: number[]
  hora_limite: string | null
}

export function crearProveedor(orgId: string, p: DatosProveedor) {
  return ejecutar('Crear proveedor', [
    () => supabase.from('proveedores').insert({ ...p, org_id: orgId }),
  ])
}

export function editarProveedor({ id, ...cambios }: DatosProveedor) {
  return ejecutar('Editar proveedor', [
    () => supabase.from('proveedores').update(cambios).eq('id', id),
  ])
}

export function archivarProveedor(id: string, archivar: boolean) {
  return ejecutar(archivar ? 'Archivar proveedor' : 'Reactivar proveedor', [
    () => supabase.from('proveedores').update({ activo: !archivar }).eq('id', id),
  ])
}

// ─── Productos y presentaciones ────────────────────────────────────────────

export type DatosPresentacion = {
  id: string
  nombre: string
  factor_a_base: number
  aproximada: boolean
}

export type DatosProducto = {
  id: string
  proveedor_id: string
  nombre: string
  unidad_base_id: string
  presentaciones: DatosPresentacion[]
}

export function crearProducto(orgId: string, { presentaciones, ...producto }: DatosProducto) {
  return ejecutar('Crear producto', [
    () => supabase.from('productos').insert({ ...producto, org_id: orgId }),
    ...(presentaciones.length
      ? [
          () =>
            supabase.from('presentaciones').upsert(
              presentaciones.map((p) => ({ ...p, org_id: orgId, producto_id: producto.id })),
              { onConflict: 'id', ignoreDuplicates: true },
            ),
        ]
      : []),
  ])
}

/**
 * Guarda los cambios de un producto: las presentaciones nuevas se agregan,
 * las cambiadas se actualizan y las que se sacaron se archivan (nada se borra).
 */
export function editarProducto(
  orgId: string,
  { id, proveedor_id, nombre, unidad_base_id, presentaciones }: DatosProducto,
  antes: DatosPresentacion[],
) {
  const idsAntes = new Set(antes.map((p) => p.id))
  const idsAhora = new Set(presentaciones.map((p) => p.id))
  const nuevas = presentaciones.filter((p) => !idsAntes.has(p.id))
  const cambiadas = presentaciones.filter((p) => {
    const previa = antes.find((a) => a.id === p.id)
    return (
      previa &&
      (previa.nombre !== p.nombre ||
        previa.factor_a_base !== p.factor_a_base ||
        previa.aproximada !== p.aproximada)
    )
  })
  const sacadas = antes.filter((p) => !idsAhora.has(p.id))

  return ejecutar('Editar producto', [
    () => supabase.from('productos').update({ proveedor_id, nombre, unidad_base_id }).eq('id', id),
    // Primero se archivan las que se sacaron, así una nueva puede reusar el nombre.
    ...sacadas.map(
      (p) => () => supabase.from('presentaciones').update({ activa: false }).eq('id', p.id),
    ),
    ...cambiadas.map(
      ({ id: presId, ...c }) =>
        () =>
          supabase.from('presentaciones').update(c).eq('id', presId),
    ),
    ...(nuevas.length
      ? [
          () =>
            supabase.from('presentaciones').upsert(
              nuevas.map((p) => ({ ...p, org_id: orgId, producto_id: id })),
              { onConflict: 'id', ignoreDuplicates: true },
            ),
        ]
      : []),
  ])
}

export function archivarProducto(id: string, archivar: boolean) {
  return ejecutar(archivar ? 'Archivar producto' : 'Reactivar producto', [
    () => supabase.from('productos').update({ activo: !archivar }).eq('id', id),
  ])
}

// ─── Unidades ──────────────────────────────────────────────────────────────

export function crearUnidad(orgId: string, u: { id: string; nombre: string; tipo: TipoUnidad }) {
  return ejecutar('Crear unidad', [() => supabase.from('unidades').insert({ ...u, org_id: orgId })])
}

export function archivarUnidad(id: string, archivar: boolean) {
  return ejecutar(archivar ? 'Archivar unidad' : 'Reactivar unidad', [
    () => supabase.from('unidades').update({ archivada: archivar }).eq('id', id),
  ])
}

// ─── Importación ───────────────────────────────────────────────────────────

/** Guarda todo lo de la planilla de una vez: si algo falla, no entra nada. */
export function importarCatalogo(datos: DatosImportacion) {
  return ejecutar('Importar catálogo', [() => supabase.rpc('importar_catalogo', { datos })])
}

// ─── Ajustes de control (solo administración) ────────────────────────────

export function guardarAjustes(
  orgId: string,
  cambios: Partial<{
    umbral_alerta_pct: number
    tolerancia_peso_pct: number
    tolerancia_unidad_pct: number
  }>,
) {
  return ejecutar('Guardar ajustes', [
    () => supabase.from('ajustes').update(cambios).eq('org_id', orgId),
  ])
}

/** Excepción de umbral para un proveedor o un producto (null la saca). */
export function cambiarUmbral(tipo: 'proveedor' | 'producto', id: string, umbral: number | null) {
  const tabla = tipo === 'proveedor' ? 'proveedores' : 'productos'
  return ejecutar('Cambiar umbral', [
    () => supabase.from(tabla).update({ umbral_alerta_pct: umbral }).eq('id', id),
  ])
}
