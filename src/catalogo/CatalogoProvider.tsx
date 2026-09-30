import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { reportar } from '../lib/errores'
import { SIN_CONEXION } from '../lib/errores-auth'
import { ContextoCatalogo, type EstadoCatalogo, type ValorCatalogo } from './contexto'
import type { Catalogo, TipoUnidad, UltimoPrecio } from './tipos'

// El catálogo de un bar son decenas o cientos de filas: se carga entero una vez y se
// recarga después de cada cambio. En la etapa 3 se guarda también en el celular para pedir sin señal.
async function cargar(): Promise<EstadoCatalogo> {
  const [unidades, proveedores, productos, presentaciones, precios] = await Promise.all([
    supabase.from('unidades').select('id, nombre, tipo, archivada').order('nombre'),
    supabase
      .from('proveedores')
      .select('id, nombre, whatsapp, dias_entrega, hora_limite, activo')
      .order('nombre'),
    supabase
      .from('productos')
      .select('id, proveedor_id, nombre, unidad_base_id, activo')
      .order('nombre'),
    supabase
      .from('presentaciones')
      .select('id, producto_id, nombre, factor_a_base, aproximada')
      .eq('activa', true)
      .order('factor_a_base'),
    supabase.from('ultimos_precios').select('producto_id, precio_base, fecha'),
  ])

  const error =
    unidades.error ?? proveedores.error ?? productos.error ?? presentaciones.error ?? precios.error
  if (error) {
    const sinRed = !navigator.onLine || /fetch/i.test(error.message)
    if (!sinRed) reportar(error, 'No se pudo cargar el catálogo')
    return {
      estado: 'error',
      mensaje: sinRed ? SIN_CONEXION : 'No pudimos cargar proveedores y productos. Probá de nuevo.',
    }
  }

  const catalogo: Catalogo = {
    unidades: (unidades.data ?? []).map((u) => ({ ...u, tipo: u.tipo as TipoUnidad })),
    proveedores: proveedores.data ?? [],
    productos: productos.data ?? [],
    presentaciones: presentaciones.data ?? [],
    precios: new Map(
      (precios.data ?? [])
        .filter((p): p is UltimoPrecio => !!p.producto_id && p.precio_base !== null && !!p.fecha)
        .map((p) => [p.producto_id, p]),
    ),
  }
  return { estado: 'listo', catalogo }
}

export function CatalogoProvider({ children }: { children: ReactNode }) {
  const [catalogo, setCatalogo] = useState<EstadoCatalogo>({ estado: 'cargando' })

  const recargar = useCallback(async () => {
    const nuevo = await cargar().catch((error: unknown): EstadoCatalogo => {
      reportar(error, 'Falla inesperada al cargar el catálogo')
      return { estado: 'error', mensaje: 'Algo falló al cargar el catálogo. Probá de nuevo.' }
    })
    // Si ya había catálogo y falla una recarga, se sigue mostrando el que había.
    setCatalogo((previo) =>
      nuevo.estado === 'error' && previo.estado === 'listo' ? previo : nuevo,
    )
  }, [])

  useEffect(() => {
    let vigente = true
    cargar()
      .catch((error: unknown): EstadoCatalogo => {
        reportar(error, 'Falla inesperada al cargar el catálogo')
        return { estado: 'error', mensaje: 'Algo falló al cargar el catálogo. Probá de nuevo.' }
      })
      .then((c) => {
        if (vigente) setCatalogo(c)
      })
    return () => {
      vigente = false
    }
  }, [])

  const valor = useMemo<ValorCatalogo>(() => ({ catalogo, recargar }), [catalogo, recargar])
  return <ContextoCatalogo.Provider value={valor}>{children}</ContextoCatalogo.Provider>
}
