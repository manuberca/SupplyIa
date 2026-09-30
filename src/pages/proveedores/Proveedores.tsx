import { useState } from 'react'
import { Link } from 'react-router'
import { FileSpreadsheet, Plus, Search } from 'lucide-react'
import { EsperarCatalogo } from '../../catalogo/EsperarCatalogo'
import { textoDias } from '../../lib/dias'
import { normalizar } from '../../lib/normalizar'
import type { Catalogo } from '../../catalogo/tipos'

export function Proveedores() {
  return (
    <>
      <div className="seccion-encabezado">
        <h1>Proveedores</h1>
        <Link to="/proveedores/nuevo" className="boton boton--primario">
          <Plus size={18} aria-hidden="true" />
          Agregar
        </Link>
      </div>
      <EsperarCatalogo>{(catalogo) => <Lista catalogo={catalogo} />}</EsperarCatalogo>
    </>
  )
}

function Lista({ catalogo }: { catalogo: Catalogo }) {
  const [busqueda, setBusqueda] = useState('')
  const [verArchivados, setVerArchivados] = useState(false)

  const productosPor = new Map<string, number>()
  for (const p of catalogo.productos) {
    if (p.activo) productosPor.set(p.proveedor_id, (productosPor.get(p.proveedor_id) ?? 0) + 1)
  }

  const activos = catalogo.proveedores.filter((p) => p.activo)
  const archivados = catalogo.proveedores.filter((p) => !p.activo)
  const q = normalizar(busqueda)
  const filtrar = (lista: typeof activos) =>
    q ? lista.filter((p) => normalizar(p.nombre).includes(q)) : lista

  if (activos.length === 0 && archivados.length === 0) {
    return (
      <>
        <section className="card formulario">
          <p className="formulario__ayuda">
            <strong>Todavía no cargaste proveedores.</strong> Agregalos de a uno, o subí una
            planilla de Excel con todos los proveedores y sus productos juntos.
          </p>
          <Link to="/proveedores/nuevo" className="boton boton--primario">
            <Plus size={18} aria-hidden="true" />
            Agregar proveedor
          </Link>
          <Link to="/proveedores/importar" className="boton boton--secundario">
            <FileSpreadsheet size={18} aria-hidden="true" />
            Importar desde Excel
          </Link>
        </section>
      </>
    )
  }

  return (
    <>
      {activos.length > 6 && (
        <label className="buscador">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="Buscar proveedor"
            aria-label="Buscar proveedor"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
      )}

      <p className="formulario__ayuda">
        Cuando haya pedidos, acá vas a ver cumplimiento, demora y aumentos de cada uno.
      </p>

      <FilasProveedores
        lista={filtrar(activos)}
        productosPor={productosPor}
        vacia="Ningún proveedor coincide con la búsqueda."
      />

      <div className="acciones">
        <Link to="/proveedores/importar" className="boton boton--secundario">
          <FileSpreadsheet size={18} aria-hidden="true" />
          Importar desde Excel
        </Link>
        {archivados.length > 0 && (
          <button className="boton boton--texto" onClick={() => setVerArchivados((v) => !v)}>
            {verArchivados ? 'Ocultar archivados' : `Ver archivados (${archivados.length})`}
          </button>
        )}
      </div>

      {verArchivados && (
        <FilasProveedores
          lista={filtrar(archivados)}
          productosPor={productosPor}
          vacia="Ningún archivado coincide."
        />
      )}
    </>
  )
}

function FilasProveedores({
  lista,
  productosPor,
  vacia,
}: {
  lista: Catalogo['proveedores']
  productosPor: Map<string, number>
  vacia: string
}) {
  return (
    <section className="lista" aria-label="Proveedores">
      {lista.length === 0 && <p className="lista__vacia">{vacia}</p>}
      {lista.map((p) => {
        const cantidad = productosPor.get(p.id) ?? 0
        return (
          <Link key={p.id} to={`/proveedores/${p.id}`} className="lista__fila">
            <span className="lista__texto">
              <span className="lista__titulo">{p.nombre}</span>
              <span className="lista__detalle">
                {textoDias(p.dias_entrega)}
                {p.hora_limite ? ` · antes de ${p.hora_limite}` : ''}
              </span>
            </span>
            <span className="lista__dato">
              {p.activo ? (
                <span className="texto-gris">
                  {cantidad} {cantidad === 1 ? 'producto' : 'productos'}
                </span>
              ) : (
                <span className="pastilla pastilla--gris">Archivado</span>
              )}
            </span>
          </Link>
        )
      })}
    </section>
  )
}
