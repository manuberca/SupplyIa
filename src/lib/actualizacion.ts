// Actualización de la app instalada (PWA). La app queda guardada en el celular para andar sin
// señal y se actualiza sola cuando hay una versión nueva. Si no puede bajarla (por ejemplo, el
// servidor contesta 401), antes seguía mostrando la versión vieja sin avisar: ahora se avisa.

import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { reportar } from './errores'

const CADA_HORA = 60 * 60 * 1000

let fallo: string | null = null
let reportado = false
const oyentes = new Set<() => void>()

function cambiar(valor: string | null) {
  if (valor === fallo) return
  fallo = valor
  oyentes.forEach((o) => o())
}

/** Mensaje de por qué no se pudo actualizar (null si está todo bien). */
export function useFalloActualizacion(): string | null {
  return useSyncExternalStore(
    (oyente) => {
      oyentes.add(oyente)
      return () => oyentes.delete(oyente)
    },
    () => fallo,
  )
}

export function iniciarActualizaciones() {
  if (!('serviceWorker' in navigator)) return
  registerSW({
    immediate: true,
    onRegisteredSW(url, registro) {
      if (!registro) return
      const revisar = async () => {
        if (!navigator.onLine || registro.installing) return
        try {
          await registro.update()
          cambiar(null)
        } catch {
          // Sin red no es un problema: se vuelve a probar después.
          const respuesta = await fetch(url, { cache: 'no-store' }).catch(() => null)
          if (!respuesta || respuesta.ok) return
          cambiar(`el servidor respondió ${respuesta.status}`)
          if (!reportado) {
            reportado = true
            reportar(
              new Error(`No se pudo bajar la versión nueva: ${respuesta.status}`),
              'Actualizar la app',
            )
          }
        }
      }
      void revisar()
      setInterval(revisar, CADA_HORA)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void revisar()
      })
    },
    onRegisterError(error: unknown) {
      reportar(error, 'No se pudo instalar la app en el dispositivo')
    },
  })
}
