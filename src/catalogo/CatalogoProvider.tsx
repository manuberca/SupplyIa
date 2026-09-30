import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { reportar } from '../lib/errores'
import { SIN_CONEXION } from '../lib/errores-auth'
import { guardar, leer } from '../offline/almacen'
import { useSesionLista } from '../sesion/contexto'
import { ContextoCatalogo, type EstadoCatalogo, type ValorCatalogo } from './contexto'
import { AJUSTES_POR_DEFECTO, type Catalogo, type TipoUnidad, type UltimoPrecio } from './tipos'

// En el celular se guarda una copia para poder pedir sin señal (SPEC §8).
type CopiaCatalogo = Omit<Catalogo, 'precios'> & { precios: UltimoPrecio[] }

const aCopia = (c: Catalogo): CopiaCatalogo => ({ ...c, precios: [...c.precios.values()] })
const deCopia = (c: CopiaCatalogo): Catalogo => ({
  ...c,
  // Las copias guardadas antes de la etapa 4 no traían los ajustes.
  ajustes: c.ajustes ?? AJUSTES_POR_DEFECTO,
  precios: new Map(c.precios.map((p) => [p.producto_id, p])),
})

// El catálogo de un bar son decenas o cientos de filas: se carga entero una vez y se
// recarga después de cada cambio.
async function cargar(): Promise<EstadoCatalogo> {
  const [ajustes, unidades, proveedores, productos, presentaciones, precios] = await Promise.all([
    supabase
      .from('ajustes')
      .select('umbral_alerta_pct, tolerancia_peso_pct, tolerancia_unidad_pct')
      .maybeSingle(),
    supabase.from('unidades').select('id, nombre, tipo, archivada').order('nombre'),
    supabase
      .from('proveedores')
      .select('id, nombre, whatsapp, dias_entrega, hora_limite, umbral_alerta_pct, activo')
      .order('nombre'),
    supabase
      .from('productos')
      .select('id, proveedor_id, nombre, unidad_base_id, umbral_alerta_pct, activo')
      .order('nombre'),
    supabase
      .from('presentaciones')
      .select('id, producto_id, nombre, factor_a_base, aproximada')
      .eq('activa', true)
      .order('factor_a_base'),
    supabase.from('ultimos_precios').select('producto_id, precio_base, fecha'),
  ])

  const error =
    ajustes.error ??
    unidades.error ??
    proveedores.error ??
    productos.error ??
    presentaciones.error ??
    precios.error
  if (error) {
    const sinRed = !navigator.onLine || /fetch/i.test(error.message)
    if (!sinRed) reportar(error, 'No se pudo cargar el catálogo')
    return {
      estado: 'error',
      mensaje: sinRed ? SIN_CONEXION : 'No pudimos cargar proveedores y productos. Probá de nuevo.',
    }
  }

  const catalogo: Catalogo = {
    ajustes: ajustes.data ?? AJUSTES_POR_DEFECTO,
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

const cargarSeguro = () =>
  cargar().catch((error: unknown): EstadoCatalogo => {
    reportar(error, 'Falla inesperada al cargar el catálogo')
    return { estado: 'error', mensaje: 'Algo falló al cargar el catálogo. Probá de nuevo.' }
  })

export function CatalogoProvider({ children }: { children: ReactNode }) {
  const { org } = useSesionLista()
  const clave = `catalogo:${org.id}`
  const [catalogo, setCatalogo] = useState<EstadoCatalogo>({ estado: 'cargando' })

  // Si ya había catálogo y falla una recarga (por ejemplo, sin señal), se sigue mostrando el que había.
  const aplicar = useCallback(
    (nuevo: EstadoCatalogo) => {
      setCatalogo((previo) =>
        nuevo.estado === 'error' && previo.estado === 'listo' ? previo : nuevo,
      )
      if (nuevo.estado === 'listo') void guardar(clave, aCopia(nuevo.catalogo))
    },
    [clave],
  )

  const recargar = useCallback(async () => aplicar(await cargarSeguro()), [aplicar])

  useEffect(() => {
    let vigente = true
    // Primero la copia del celular (abre al instante y sin señal); después, la de la base.
    leer<CopiaCatalogo>(clave).then((copia) => {
      if (vigente && copia) {
        setCatalogo((previo) =>
          // Sin señal el error de la base puede llegar antes que la copia: la copia gana.
          previo.estado === 'listo' ? previo : { estado: 'listo', catalogo: deCopia(copia) },
        )
      }
    })
    cargarSeguro().then((c) => {
      if (vigente) aplicar(c)
    })
    return () => {
      vigente = false
    }
  }, [clave, aplicar])

  const valor = useMemo<ValorCatalogo>(() => ({ catalogo, recargar }), [catalogo, recargar])
  return <ContextoCatalogo.Provider value={valor}>{children}</ContextoCatalogo.Provider>
}
