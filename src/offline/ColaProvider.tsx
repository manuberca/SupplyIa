import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { reportar } from '../lib/errores'
import { ERROR_DB_DESCONOCIDO, mensajeErrorDb } from '../lib/errores-db'
import { SIN_CONEXION } from '../lib/errores-auth'
import { useSesionLista } from '../sesion/contexto'
import { guardar, leer } from './almacen'
import type { Json } from '../lib/database.types'
import {
  procesarCola,
  type Operacion,
  type PedidoParaGuardar,
  type RecepcionParaGuardar,
  type ResultadoEnvio,
} from './cola'
import { ContextoCola, type ValorCola } from './contexto'

const CADA = 20_000 // mientras haya pendientes, reintenta cada 20 segundos

async function enviar(op: Operacion): Promise<ResultadoEnvio> {
  if (!navigator.onLine) return { ok: false, reintentar: true }
  try {
    const { error } =
      op.tipo === 'crear_pedido'
        ? await supabase.rpc('guardar_pedido', { pedido: op.datos })
        : await supabase.rpc('confirmar_recepcion', { recepcion: op.datos as unknown as Json })
    if (!error) return { ok: true }
    // Sin señal o sesión vencida (se renueva sola): se reintenta más tarde.
    if (!error.code || error.code.startsWith('PGRST3') || mensajeErrorDb(error) === SIN_CONEXION) {
      return { ok: false, reintentar: true }
    }
    const mensaje = mensajeErrorDb(error)
    if (mensaje === ERROR_DB_DESCONOCIDO) reportar(error, `Subir de la cola: ${op.tipo}`)
    return { ok: false, reintentar: false, mensaje }
  } catch {
    return { ok: false, reintentar: true }
  }
}

export function ColaProvider({ children }: { children: ReactNode }) {
  const { usuario } = useSesionLista()
  const clave = `cola:${usuario.id}`
  const [pendientes, setPendientes] = useState<Operacion[]>([])
  const [enLinea, setEnLinea] = useState(() => navigator.onLine)
  const [subiendo, setSubiendo] = useState(false)
  const [version, setVersion] = useState(0)
  // La cola real vive acá (y en el celular); el estado es para mostrarla.
  const cola = useRef<Operacion[]>([])
  const cargada = useRef(false)
  const ocupada = useRef(false)

  const escribir = useCallback(
    async (nueva: Operacion[]) => {
      cola.current = nueva
      setPendientes(nueva)
      return guardar(clave, nueva)
    },
    [clave],
  )

  const procesar = useCallback(async () => {
    if (ocupada.current || !cargada.current || !navigator.onLine) return
    if (!cola.current.some((o) => !o.error)) return
    ocupada.current = true
    setSubiendo(true)
    try {
      const antes = cola.current
      const { restantes, subidas } = await procesarCola(antes, enviar)
      // Lo que se agregó mientras subía queda al final.
      const agregadas = cola.current.filter((o) => !antes.some((a) => a.id === o.id))
      await escribir([...restantes, ...agregadas])
      if (subidas.length) setVersion((v) => v + 1)
    } finally {
      ocupada.current = false
      setSubiendo(false)
    }
  }, [escribir])

  // Al entrar: lo que quedó pendiente de otra vez, y a subirlo.
  useEffect(() => {
    let vigente = true
    cargada.current = false
    leer<Operacion[]>(clave).then((guardadas) => {
      if (!vigente) return
      cola.current = guardadas ?? []
      setPendientes(cola.current)
      cargada.current = true
      void procesar()
    })
    return () => {
      vigente = false
    }
  }, [clave, procesar])

  // Cuando vuelve la señal, cuando se vuelve a la app y cada tanto.
  useEffect(() => {
    const conSenal = () => {
      setEnLinea(true)
      void procesar()
    }
    const sinSenal = () => setEnLinea(false)
    const alVolver = () => {
      if (document.visibilityState === 'visible') void procesar()
    }
    window.addEventListener('online', conSenal)
    window.addEventListener('offline', sinSenal)
    document.addEventListener('visibilitychange', alVolver)
    const intervalo = window.setInterval(() => void procesar(), CADA)
    return () => {
      window.removeEventListener('online', conSenal)
      window.removeEventListener('offline', sinSenal)
      document.removeEventListener('visibilitychange', alVolver)
      window.clearInterval(intervalo)
    }
  }, [procesar])

  const agregar = useCallback(
    async (op: Operacion) => {
      if (cola.current.some((o) => o.id === op.id)) return true
      const ok = await escribir([...cola.current, op])
      void procesar()
      return ok
    },
    [escribir, procesar],
  )

  const agregarPedido = useCallback(
    (pedido: PedidoParaGuardar) =>
      agregar({
        id: pedido.id,
        tipo: 'crear_pedido',
        datos: pedido,
        creada: new Date().toISOString(),
        intentos: 0,
        error: null,
      }),
    [agregar],
  )

  const agregarRecepcion = useCallback(
    (recepcion: RecepcionParaGuardar) =>
      agregar({
        id: recepcion.id,
        tipo: 'confirmar_recepcion',
        datos: recepcion,
        creada: new Date().toISOString(),
        intentos: 0,
        error: null,
      }),
    [agregar],
  )

  const reintentar = useCallback(
    (id: string) => {
      void escribir(cola.current.map((o) => (o.id === id ? { ...o, error: null } : o))).then(() =>
        procesar(),
      )
    },
    [escribir, procesar],
  )

  const descartar = useCallback(
    async (id: string) => {
      await escribir(cola.current.filter((o) => o.id !== id))
    },
    [escribir],
  )

  const valor = useMemo<ValorCola>(
    () => ({
      pendientes,
      enLinea,
      subiendo,
      agregarPedido,
      agregarRecepcion,
      reintentar,
      descartar,
      version,
    }),
    [
      pendientes,
      enLinea,
      subiendo,
      agregarPedido,
      agregarRecepcion,
      reintentar,
      descartar,
      version,
    ],
  )
  return <ContextoCola.Provider value={valor}>{children}</ContextoCola.Provider>
}
