// Instalar la app en el dispositivo (PWA). No hay nada que bajar de una tienda: el navegador la
// agrega como una app más. En Android y en Chrome/Edge de computadora el navegador avisa que se
// puede instalar y se le puede mostrar un botón; en iPhone hay que hacerlo desde "Compartir".

import { useSyncExternalStore } from 'react'

export type Plataforma = 'iphone' | 'android' | 'computadora'

type AvisoDeInstalacion = Event & { prompt: () => Promise<{ outcome: 'accepted' | 'dismissed' }> }

let aviso: AvisoDeInstalacion | null = null
let instalada = false
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach((o) => o())

/** Qué dispositivo es, por lo que declara el navegador (para mostrar los pasos que le tocan). */
export function plataformaDe(agente: string, puntosTactiles = 0): Plataforma {
  // Los iPad nuevos se presentan como Mac, pero con pantalla táctil.
  if (/iPhone|iPad|iPod/i.test(agente) || (/Macintosh/i.test(agente) && puntosTactiles > 1))
    return 'iphone'
  if (/Android/i.test(agente)) return 'android'
  return 'computadora'
}

/** Se llama una vez al abrir la app: el aviso del navegador llega temprano y hay que guardarlo. */
export function escucharInstalacion() {
  const modo = window.matchMedia('(display-mode: standalone)')
  const revisar = () => {
    instalada = modo.matches || (navigator as { standalone?: boolean }).standalone === true
    avisar()
  }
  revisar()
  modo.addEventListener('change', revisar)
  window.addEventListener('beforeinstallprompt', (evento) => {
    evento.preventDefault() // el botón lo muestra la app, cuando la persona lo busca
    aviso = evento as AvisoDeInstalacion
    avisar()
  })
  window.addEventListener('appinstalled', () => {
    aviso = null
    instalada = true
    avisar()
  })
}

const suscribir = (oyente: () => void) => {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

export function useInstalacion() {
  const estaInstalada = useSyncExternalStore(suscribir, () => instalada)
  const puedeInstalar = useSyncExternalStore(suscribir, () => aviso !== null)
  return {
    instalada: estaInstalada,
    /** El navegador ofrece instalarla con un botón (Android, Chrome o Edge en computadora). */
    puedeInstalar,
    plataforma: plataformaDe(navigator.userAgent, navigator.maxTouchPoints),
    async instalar() {
      const pendiente = aviso
      if (!pendiente) return
      aviso = null
      avisar()
      await pendiente.prompt()
    },
  }
}
