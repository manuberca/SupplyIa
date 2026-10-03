import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useCatalogo } from '../catalogo/contexto'
import { supabase } from '../lib/supabase'
import { todasLasFilas } from '../lib/paginar'
import { reportar } from '../lib/errores'
import { SIN_CONEXION } from '../lib/errores-auth'
import { puede } from '../lib/permisos'
import { useCola } from '../offline/contexto'
import { useSesionLista } from '../sesion/contexto'
import { ContextoControl, type ValorControl } from './contexto'
import {
  alertasDeAumento,
  aumentoProveedor,
  gastoPorProducto,
  metricasProveedores,
  variaciones,
  type PrecioHistorico,
  type RenglonRecibido,
} from './metricas'

const DIA = 86_400_000
const HISTORIA_DIAS = 180 // para el gráfico de precios
const VENTANA_DIAS = 60 // recepciones: alcanza para los 30 días de las métricas

type Crudo = { precios: PrecioHistorico[]; renglones: RenglonRecibido[] }

async function cargar(): Promise<Crudo | { error: string }> {
  const desdePrecios = new Date(Date.now() - HISTORIA_DIAS * DIA).toISOString()
  const desdeRecepciones = new Date(Date.now() - VENTANA_DIAS * DIA).toISOString()
  const [precios, renglones] = await Promise.all([
    todasLasFilas((a, b) =>
      supabase
        .from('precios')
        .select('producto_id, proveedor_id, precio_base, fecha')
        .gte('fecha', desdePrecios)
        .order('fecha')
        .order('id')
        .range(a, b),
    ),
    todasLasFilas((a, b) =>
      supabase
        .from('recepcion_items')
        .select(
          'producto_id, cantidad_pedida_base, cantidad_base, precio_unit_base, resultado, recepciones!inner ( id, proveedor_id, recibido_at, pedido_id, pedidos ( enviado_at ) )',
        )
        .gte('recepciones.recibido_at', desdeRecepciones)
        .order('id')
        .range(a, b),
    ),
  ])
  const error = precios.error ?? renglones.error
  if (error) {
    const sinRed = !navigator.onLine || /fetch/i.test(error.message)
    if (!sinRed) reportar(error, 'No se pudieron cargar los datos de control')
    return { error: sinRed ? SIN_CONEXION : 'No pudimos cargar los precios. Probá de nuevo.' }
  }
  return {
    precios: precios.data,
    renglones: renglones.data.map((r) => ({
      proveedor_id: r.recepciones.proveedor_id,
      producto_id: r.producto_id,
      recepcion_id: r.recepciones.id,
      recibido_at: r.recepciones.recibido_at,
      pedido_id: r.recepciones.pedido_id,
      enviado_at: r.recepciones.pedidos?.enviado_at ?? null,
      cantidad_pedida_base: r.cantidad_pedida_base,
      cantidad_base: r.cantidad_base,
      precio_unit_base: r.precio_unit_base,
      resultado: r.resultado,
    })),
  }
}

/** Precios, ranking y alertas (solo para quien ve Precios: administración y encargado). */
export function ControlProvider({ children }: { children: ReactNode }) {
  const { miembro } = useSesionLista()
  const { catalogo } = useCatalogo()
  const { version } = useCola()
  const habilitado = puede(miembro.rol, 'precios')
  const [crudo, setCrudo] = useState<Crudo | { error: string } | null>(null)

  // Se recarga cuando la cola sube algo (una recepción nueva trae precios nuevos).
  useEffect(() => {
    if (!habilitado) return
    let vigente = true
    cargar()
      .catch((e: unknown) => {
        reportar(e, 'Falla inesperada al cargar control')
        return { error: 'Algo falló al cargar los precios. Probá de nuevo.' }
      })
      .then((r) => {
        // Sin señal se sigue mostrando lo que había.
        if (vigente)
          setCrudo((previo) => ('error' in r && previo && !('error' in previo) ? previo : r))
      })
    return () => {
      vigente = false
    }
  }, [habilitado, version])

  const valor = useMemo<ValorControl>(() => {
    if (!crudo) return { estado: 'cargando' }
    if ('error' in crudo) return { estado: 'error', mensaje: crudo.error }
    const ahora = new Date()
    const vars = variaciones(crudo.precios, ahora)
    const gasto = gastoPorProducto(crudo.renglones, ahora)
    const cat = catalogo.estado === 'listo' ? catalogo.catalogo : null
    const alertas = cat
      ? alertasDeAumento(
          crudo.precios,
          {
            general: cat.ajustes.umbral_alerta_pct,
            proveedor: (id) => cat.proveedores.find((p) => p.id === id)?.umbral_alerta_pct ?? null,
            producto: (id) => cat.productos.find((p) => p.id === id)?.umbral_alerta_pct ?? null,
          },
          ahora,
        ).filter((a) => cat.productos.some((p) => p.id === a.producto_id && p.activo))
      : []
    return {
      estado: 'listo',
      datos: {
        precios: crudo.precios,
        renglones: crudo.renglones,
        variaciones: vars,
        gasto,
        metricas: metricasProveedores(crudo.renglones, ahora),
        aumentoDe: (id) => aumentoProveedor(id, vars, gasto),
        alertas,
      },
    }
  }, [crudo, catalogo])

  return <ContextoControl.Provider value={valor}>{children}</ContextoControl.Provider>
}
