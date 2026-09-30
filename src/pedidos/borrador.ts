// Lo que se va cargando en un pedido queda en el celular hasta enviarlo, así no se pierde
// si se cierra la app o se cambia de pantalla.

export type Borrador = {
  cantidades: Record<string, { texto: string; presentacionId: string | null }>
  observaciones: string
}

const clave = (usuarioId: string, proveedorId: string) =>
  `supplyia.borrador:${usuarioId}:${proveedorId}`

export function leerBorrador(usuarioId: string, proveedorId: string): Borrador | null {
  try {
    const texto = localStorage.getItem(clave(usuarioId, proveedorId))
    return texto ? (JSON.parse(texto) as Borrador) : null
  } catch {
    return null
  }
}

export function guardarBorrador(usuarioId: string, proveedorId: string, b: Borrador) {
  try {
    const vacio =
      !b.observaciones.trim() && Object.values(b.cantidades).every((c) => !c.texto.trim())
    if (vacio) localStorage.removeItem(clave(usuarioId, proveedorId))
    else localStorage.setItem(clave(usuarioId, proveedorId), JSON.stringify(b))
  } catch {
    // Sin almacenamiento el borrador vive solo mientras la pantalla está abierta.
  }
}

export function borrarBorrador(usuarioId: string, proveedorId: string) {
  try {
    localStorage.removeItem(clave(usuarioId, proveedorId))
  } catch {
    // nada que hacer
  }
}
