import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { rolSchema } from '../lib/permisos'
import { SIN_CONEXION } from '../lib/errores-auth'
import { identificar, reportar } from '../lib/errores'
import { ContextoSesion, type Local, type Sesion, type ValorSesion } from './contexto'

const CLAVE_LOCAL = 'supplyia.local'

function leerLocalGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE_LOCAL)
  } catch {
    return null
  }
}

function guardarLocal(id: string) {
  try {
    localStorage.setItem(CLAVE_LOCAL, id)
  } catch {
    // Sin almacenamiento (modo privado): se vuelve a elegir el primero al recargar.
  }
}

type Usuario = { id: string; email: string }

async function cargarSesion(usuario: Usuario): Promise<Sesion> {
  const [miembroRes, localesRes] = await Promise.all([
    supabase
      .from('miembros')
      .select('nombre, rol, organizaciones ( id, nombre )')
      .eq('user_id', usuario.id)
      .maybeSingle(),
    supabase.from('locales').select('id, nombre').eq('activo', true).order('nombre'),
  ])

  const error = miembroRes.error ?? localesRes.error
  if (error) {
    const sinRed = !navigator.onLine || /fetch/i.test(error.message)
    // Sin señal es esperable: se le avisa al usuario y no se reporta.
    if (!sinRed) reportar(error, 'No se pudo cargar la sesión')
    return {
      estado: 'error',
      mensaje: sinRed ? SIN_CONEXION : 'No pudimos cargar los datos de tu bar. Probá de nuevo.',
    }
  }

  const miembro = miembroRes.data
  if (!miembro || !miembro.organizaciones) {
    return { estado: 'sin_membresia', email: usuario.email }
  }

  const rol = rolSchema.safeParse(miembro.rol)
  if (!rol.success) {
    reportar(new Error(`Rol desconocido: ${String(miembro.rol)}`), 'Cargar sesión')
    return {
      estado: 'error',
      mensaje: 'Tu usuario tiene un rol que la app no reconoce. Avisale a soporte.',
    }
  }

  const locales: Local[] = localesRes.data ?? []
  const guardado = leerLocalGuardado()
  const local = locales.find((l) => l.id === guardado) ?? locales[0] ?? null

  return {
    estado: 'lista',
    usuario,
    miembro: { nombre: miembro.nombre, rol: rol.data },
    org: miembro.organizaciones,
    locales,
    local,
  }
}

export function SesionProvider({ children }: { children: ReactNode }) {
  // undefined = todavía no sabemos si hay sesión.
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined)
  const [intento, setIntento] = useState(0)
  // Resultado de la última carga, marcado con el usuario e intento a los que corresponde.
  const [carga, setCarga] = useState<{ clave: string; sesion: Sesion } | null>(null)
  const claveActual = usuario ? `${usuario.id}:${intento}` : null

  let sesion: Sesion
  if (usuario === undefined) sesion = { estado: 'cargando' }
  else if (usuario === null) sesion = { estado: 'sin_sesion' }
  else if (carga?.clave === claveActual) sesion = carga.sesion
  else sesion = { estado: 'cargando' }

  // Supabase avisa cuando alguien entra o sale. Acá solo se guarda quién es;
  // los datos se cargan en el efecto de abajo (no se puede consultar la base dentro de este aviso).
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => {
      const nuevo = s?.user ? { id: s.user.id, email: s.user.email ?? '' } : null
      // Si es el mismo usuario (por ejemplo, al renovar el token), no se recarga nada.
      setUsuario((previo) => (previo && nuevo && previo.id === nuevo.id ? previo : nuevo))
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!usuario || !claveActual) return
    let vigente = true
    cargarSesion(usuario)
      .catch((error: unknown): Sesion => {
        reportar(error, 'Falla inesperada al cargar la sesión')
        return { estado: 'error', mensaje: 'Algo falló al cargar tu bar. Probá de nuevo.' }
      })
      .then((s) => {
        if (vigente) setCarga({ clave: claveActual, sesion: s })
      })
    return () => {
      vigente = false
    }
  }, [usuario, claveActual])

  // Para saber en Sentry con qué organización y rol pasó un error.
  const lista = sesion.estado === 'lista' ? sesion : null
  const usuarioId = lista?.usuario.id
  const orgId = lista?.org.id
  const rol = lista?.miembro.rol
  useEffect(() => {
    identificar(usuarioId && orgId && rol ? { usuarioId, orgId, rol } : null)
  }, [usuarioId, orgId, rol])

  const salir = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      // Aunque falle avisarle al servidor, la sesión local se borra igual.
      reportar(error, 'Error al cerrar sesión')
      await supabase.auth.signOut({ scope: 'local' })
    }
  }, [])

  const elegirLocal = useCallback((id: string) => {
    guardarLocal(id)
    setCarga((c) => {
      if (!c || c.sesion.estado !== 'lista') return c
      const local = c.sesion.locales.find((l) => l.id === id)
      return local ? { ...c, sesion: { ...c.sesion, local } } : c
    })
  }, [])

  const reintentar = useCallback(() => setIntento((n) => n + 1), [])

  const valor = useMemo<ValorSesion>(
    () => ({ sesion, salir, elegirLocal, reintentar }),
    [sesion, salir, elegirLocal, reintentar],
  )

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>
}
