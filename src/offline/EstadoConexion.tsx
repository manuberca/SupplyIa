import { Link } from 'react-router'
import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { useCola } from './contexto'

/** Aviso arriba de todo: sin señal, pendientes de subir o pendientes con error (SPEC §8). */
export function EstadoConexion() {
  const { pendientes, enLinea, subiendo } = useCola()
  const conError = pendientes.filter((o) => o.error).length
  const esperando = pendientes.length - conError
  const pedidos = (n: number) => `${n} ${n === 1 ? 'pedido' : 'pedidos'}`

  if (conError > 0) {
    return (
      <Link to="/pedidos" className="conexion conexion--error" role="alert">
        <TriangleAlert size={16} aria-hidden="true" />
        {pedidos(conError)} no se {conError === 1 ? 'pudo' : 'pudieron'} subir. Tocá para ver qué
        pasó.
      </Link>
    )
  }
  if (!enLinea) {
    return (
      <p className="conexion conexion--sin-senal" role="status">
        <CloudOff size={16} aria-hidden="true" />
        Sin conexión.{' '}
        {esperando > 0
          ? esperando === 1
            ? '1 pedido queda guardado y se sube solo al volver la señal.'
            : `${esperando} pedidos quedan guardados y se suben solos al volver la señal.`
          : 'Podés seguir pidiendo: se sube solo al volver la señal.'}
      </p>
    )
  }
  if (esperando > 0) {
    return (
      <p className="conexion conexion--subiendo" role="status">
        <RefreshCw size={16} aria-hidden="true" />
        {subiendo ? 'Subiendo' : 'Pendiente de subir:'} {pedidos(esperando)}…
      </p>
    )
  }
  return null
}
