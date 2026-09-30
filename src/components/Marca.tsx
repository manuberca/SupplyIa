import { Link } from 'react-router'
import { Package } from 'lucide-react'

/** `sinEnlace` para pantallas que se muestran fuera del router (configuración, errores). */
export function Marca({ sinEnlace }: { sinEnlace?: boolean }) {
  const contenido = (
    <>
      <span className="marca__logo">
        <Package size={18} strokeWidth={2} aria-hidden="true" />
      </span>
      <span>
        Supply<span className="marca__ia">IA</span>
      </span>
    </>
  )
  if (sinEnlace) return <div className="marca">{contenido}</div>
  return (
    <Link to="/" className="marca" aria-label="SupplyIA, ir al inicio">
      {contenido}
    </Link>
  )
}
