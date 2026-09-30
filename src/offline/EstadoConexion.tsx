import { Link } from 'react-router'
import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { queHay } from './cola'
import { useCola } from './contexto'

/** Aviso arriba de todo: sin señal, pendientes de subir o pendientes con error (SPEC §8). */
export function EstadoConexion() {
  const { pendientes, enLinea, subiendo } = useCola()
  const conError = pendientes.filter((o) => o.error)
  const esperando = pendientes.filter((o) => !o.error)
  const uno = (n: number, singular: string, plural: string) => (n === 1 ? singular : plural)

  if (conError.length > 0) {
    return (
      <Link to="/pedidos" className="conexion conexion--error" role="alert">
        <TriangleAlert size={16} aria-hidden="true" />
        {queHay(conError)}: no se {uno(conError.length, 'pudo', 'pudieron')} subir. Tocá para ver
        qué pasó.
      </Link>
    )
  }
  if (!enLinea) {
    return (
      <p className="conexion conexion--sin-senal" role="status">
        <CloudOff size={16} aria-hidden="true" />
        Sin conexión.{' '}
        {esperando.length > 0
          ? `${queHay(esperando)}: ${uno(esperando.length, 'queda guardado y se sube solo', 'quedan guardados y se suben solos')} al volver la señal.`
          : 'Podés seguir pidiendo: se sube solo al volver la señal.'}
      </p>
    )
  }
  if (esperando.length > 0) {
    return (
      <p className="conexion conexion--subiendo" role="status">
        <RefreshCw size={16} aria-hidden="true" />
        {subiendo ? 'Subiendo' : 'Pendiente de subir:'} {queHay(esperando)}…
      </p>
    )
  }
  return null
}
