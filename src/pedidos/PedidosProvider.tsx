import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { reportar } from '../lib/errores'
import { SIN_CONEXION } from '../lib/errores-auth'
import { ERROR_DB_DESCONOCIDO, mensajeErrorDb } from '../lib/errores-db'
import { guardar, leer } from '../offline/almacen'
import { useCola } from '../offline/contexto'
import { useSesionLista } from '../sesion/contexto'
import { ContextoPedidos, type ValorPedidos } from './contexto'
import type { EstadoPedido, Pedido } from './tipos'

type Guardado = Omit<Pedido, 'subida'>

async function cargar(localId: string): Promise<Guardado[] | { error: string }> {
  const { data, error } = await supabase
    .from('pedidos')
    .select(
      'id, numero, estado, local_id, proveedor_id, observaciones, creado_at, pedido_items ( id, producto_id, presentacion_id, cantidad, precio_estimado_base )',
    )
    .eq('local_id', localId)
    .order('creado_at', { ascending: false })
    .limit(100)
  if (error) {
    const sinRed = !navigator.onLine || /fetch/i.test(error.message)
    if (!sinRed) reportar(error, 'No se pudieron cargar los pedidos')
    return { error: sinRed ? SIN_CONEXION : 'No pudimos cargar los pedidos. Probá de nuevo.' }
  }
  return data.map(({ pedido_items, ...p }) => ({
    ...p,
    estado: p.estado as EstadoPedido,
    items: pedido_items,
  }))
}

const cargarSeguro = (localId: string) =>
  cargar(localId).catch((e: unknown) => {
    reportar(e, 'Falla inesperada al cargar pedidos')
    return { error: 'Algo falló al cargar los pedidos. Probá de nuevo.' }
  })

export function PedidosProvider({ children }: { children: ReactNode }) {
  const { usuario, local } = useSesionLista()
  const { pendientes, version } = useCola()
  const clave = local ? `pedidos:${usuario.id}:${local.id}` : null
  // Los datos quedan marcados con el local al que corresponden (al cambiar de local no se mezclan).
  const [datos, setDatos] = useState<{
    clave: string
    pedidos: Guardado[]
    mensajeError: string
  } | null>(null)
  const guardados = datos?.clave === clave ? datos.pedidos : null
  const mensajeError = datos?.clave === clave ? datos.mensajeError : ''

  const aplicar = useCallback((claveDe: string, r: Guardado[] | { error: string }) => {
    if ('error' in r) {
      // Sin señal se siguen mostrando los que había.
      setDatos((previo) =>
        previo?.clave === claveDe
          ? { ...previo, mensajeError: r.error }
          : { clave: claveDe, pedidos: [], mensajeError: r.error },
      )
      return
    }
    setDatos({ clave: claveDe, pedidos: r, mensajeError: '' })
    void guardar(claveDe, r)
  }, [])

  const recargar = useCallback(async () => {
    if (!local || !clave) return
    aplicar(clave, await cargarSeguro(local.id))
  }, [local, clave, aplicar])

  // Al cambiar de local: primero la copia del celular, después la base (y cada vez que la cola sube algo).
  useEffect(() => {
    if (!local || !clave) return
    let vigente = true
    leer<Guardado[]>(clave).then((copia) => {
      if (vigente && copia) {
        // Si la base ya respondió, gana la base; si falló (sin señal), la copia.
        setDatos((previo) =>
          previo?.clave === clave && !previo.mensajeError
            ? previo
            : {
                clave,
                pedidos: copia,
                mensajeError: previo?.clave === clave ? previo.mensajeError : '',
              },
        )
      }
    })
    cargarSeguro(local.id).then((r) => {
      if (vigente) aplicar(clave, r)
    })
    return () => {
      vigente = false
    }
  }, [local, clave, version, aplicar])

  const cambiarEstado = useCallback<ValorPedidos['cambiarEstado']>(
    async (id, estado) => {
      if (!navigator.onLine) return { ok: false, mensaje: SIN_CONEXION }
      const { error } = await supabase.from('pedidos').update({ estado }).eq('id', id)
      if (error) {
        const mensaje = mensajeErrorDb(error)
        if (mensaje === ERROR_DB_DESCONOCIDO) reportar(error, 'Cambiar estado de pedido')
        return { ok: false, mensaje }
      }
      await recargar()
      return { ok: true }
    },
    [recargar],
  )

  const valor = useMemo<ValorPedidos>(() => {
    const enCola: Pedido[] = pendientes
      .filter((op) => op.datos.local_id === local?.id)
      .filter((op) => !guardados?.some((g) => g.id === op.id))
      .map((op) => ({
        id: op.id,
        numero: null,
        estado: 'enviado',
        local_id: op.datos.local_id,
        proveedor_id: op.datos.proveedor_id,
        observaciones: op.datos.observaciones || null,
        creado_at: op.datos.creado_at,
        items: op.datos.items,
        subida: { error: op.error },
      }))
    const pedidos = [...enCola, ...(guardados ?? []).map((g) => ({ ...g, subida: null }))].sort(
      (a, b) => b.creado_at.localeCompare(a.creado_at),
    )
    return {
      estado:
        guardados?.length || enCola.length || (guardados && !mensajeError)
          ? 'listo'
          : mensajeError
            ? 'error'
            : 'cargando',
      pedidos,
      mensajeError,
      recargar,
      cambiarEstado,
    }
  }, [pendientes, guardados, mensajeError, local, recargar, cambiarEstado])

  return <ContextoPedidos.Provider value={valor}>{children}</ContextoPedidos.Provider>
}
