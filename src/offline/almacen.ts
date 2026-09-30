// Lo que la app guarda en el celular (IndexedDB): la cola de pendientes y copias del
// catálogo y de los pedidos para poder usar la app sin señal (SPEC §8).

import { createStore, del, get, set } from 'idb-keyval'
import { reportar } from '../lib/errores'

const almacen = createStore('supplyia', 'datos')

export async function leer<T>(clave: string): Promise<T | undefined> {
  try {
    return await get<T>(clave, almacen)
  } catch (error) {
    reportar(error, `Leer del celular (${clave.split(':')[0]})`)
    return undefined
  }
}

/** Devuelve false si el celular no dejó guardar (por ejemplo, sin espacio). */
export async function guardar<T>(clave: string, valor: T): Promise<boolean> {
  try {
    await set(clave, valor, almacen)
    return true
  } catch (error) {
    reportar(error, `Guardar en el celular (${clave.split(':')[0]})`)
    return false
  }
}

export async function borrar(clave: string): Promise<void> {
  try {
    await del(clave, almacen)
  } catch (error) {
    reportar(error, `Borrar del celular (${clave.split(':')[0]})`)
  }
}
