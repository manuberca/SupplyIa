import { Link } from 'react-router'
import { Package } from 'lucide-react'

export function Marca() {
  return (
    <Link to="/" className="marca" aria-label="SupplyIA, ir al inicio">
      <span className="marca__logo">
        <Package size={18} strokeWidth={2} aria-hidden="true" />
      </span>
      <span>
        Supply<span className="marca__ia">IA</span>
      </span>
    </Link>
  )
}
