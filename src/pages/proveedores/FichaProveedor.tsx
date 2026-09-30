import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Archive, Pencil, Plus, RotateCcw } from 'lucide-react'
import { EsperarCatalogo } from '../../catalogo/EsperarCatalogo'
import { useCatalogo } from '../../catalogo/contexto'
import { archivarProveedor } from '../../catalogo/acciones'
import type { Catalogo, Proveedor } from '../../catalogo/tipos'
import { TituloPantalla } from '../../components/TituloPantalla'
import { textoDias } from '../../lib/dias'
import { pesos } from '../../lib/formato'
import { textoUnidades } from '../../lib/presentaciones'
import { formatearWhatsapp } from '../../lib/whatsapp'

export function FichaProveedor() {
  const { id } = useParams()
  return (
    <EsperarCatalogo>
      {(catalogo) => {
        const proveedor = catalogo.proveedores.find((p) => p.id === id)
        if (!proveedor) {
          return (
            <>
              <TituloPantalla titulo="Proveedor" volver="/proveedores" />
              <p className="aviso aviso--error">No encontramos ese proveedor.</p>
            </>
          )
        }
        return <Ficha catalogo={catalogo} proveedor={proveedor} />
      }}
    </EsperarCatalogo>
  )
}

function Ficha({ catalogo, proveedor }: { catalogo: Catalogo; proveedor: Proveedor }) {
  const [verArchivados, setVerArchivados] = useState(false)
  const productos = catalogo.productos.filter((p) => p.proveedor_id === proveedor.id)
  const activos = productos.filter((p) => p.activo)
  const archivados = productos.filter((p) => !p.activo)
  const entrega = [
    textoDias(proveedor.dias_entrega),
    proveedor.hora_limite && `antes de ${proveedor.hora_limite}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <TituloPantalla titulo={proveedor.nombre} volver="/proveedores" />

      {!proveedor.activo && (
        <p className="aviso aviso--atencion">
          <strong>Proveedor archivado.</strong> No aparece para hacer pedidos. Podés reactivarlo
          abajo.
        </p>
      )}

      <section className="card">
        <dl className="datos">
          <div>
            <dt>WhatsApp</dt>
            <dd className="mono">{formatearWhatsapp(proveedor.whatsapp)}</dd>
          </div>
          <div>
            <dt>Entrega</dt>
            <dd>{entrega}</dd>
          </div>
          <div>
            <dt>Cumple · demora</dt>
            <dd className="texto-gris">Sin pedidos todavía</dd>
          </div>
        </dl>
      </section>

      <div className="seccion-encabezado">
        <h2>Productos ({activos.length})</h2>
        {proveedor.activo && (
          <Link to={`/proveedores/${proveedor.id}/productos/nuevo`} className="enlace-accion">
            <Plus size={16} aria-hidden="true" />
            Agregar producto
          </Link>
        )}
      </div>

      <FilasProductos catalogo={catalogo} proveedor={proveedor} lista={activos} />

      {activos.length === 0 && proveedor.activo && (
        <Link to="/proveedores/importar" className="boton boton--secundario">
          Importar productos desde Excel
        </Link>
      )}

      {archivados.length > 0 && (
        <button className="boton boton--texto" onClick={() => setVerArchivados((v) => !v)}>
          {verArchivados
            ? 'Ocultar productos archivados'
            : `Ver productos archivados (${archivados.length})`}
        </button>
      )}
      {verArchivados && (
        <FilasProductos catalogo={catalogo} proveedor={proveedor} lista={archivados} />
      )}

      <div className="acciones">
        <Link to={`/proveedores/${proveedor.id}/editar`} className="boton boton--secundario">
          <Pencil size={18} aria-hidden="true" />
          Editar proveedor
        </Link>
        <ArchivarProveedor proveedor={proveedor} />
      </div>
    </>
  )
}

function FilasProductos({
  catalogo,
  proveedor,
  lista,
}: {
  catalogo: Catalogo
  proveedor: Proveedor
  lista: Catalogo['productos']
}) {
  if (lista.length === 0) {
    return (
      <section className="lista">
        <p className="lista__vacia">Todavía no tiene productos.</p>
      </section>
    )
  }
  return (
    <section className="lista" aria-label="Productos">
      {lista.map((p) => {
        const unidad = catalogo.unidades.find((u) => u.id === p.unidad_base_id)
        const presentaciones = catalogo.presentaciones.filter((x) => x.producto_id === p.id)
        const precio = catalogo.precios.get(p.id)
        return (
          <Link
            key={p.id}
            to={`/proveedores/${proveedor.id}/productos/${p.id}`}
            className="lista__fila"
          >
            <span className="lista__texto">
              <span className="lista__titulo">{p.nombre}</span>
              <span className="lista__detalle">
                {unidad ? textoUnidades(unidad, presentaciones) : 'Sin unidad'}
              </span>
            </span>
            <span className="lista__dato mono">
              {!p.activo ? (
                <span className="pastilla pastilla--gris">Archivado</span>
              ) : precio ? (
                `${pesos(precio.precio_base)}/${unidad?.nombre ?? ''}`
              ) : (
                <span className="texto-gris">—</span>
              )}
            </span>
          </Link>
        )
      })}
    </section>
  )
}

function ArchivarProveedor({ proveedor }: { proveedor: Proveedor }) {
  const { recargar } = useCatalogo()
  const [confirmando, setConfirmando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function cambiar(archivar: boolean) {
    setGuardando(true)
    setError('')
    const r = await archivarProveedor(proveedor.id, archivar)
    if (r.ok) await recargar()
    else setError(r.mensaje)
    setGuardando(false)
    setConfirmando(false)
  }

  if (!proveedor.activo) {
    return (
      <>
        {error && (
          <p className="aviso aviso--error" role="alert">
            {error}
          </p>
        )}
        <button
          className="boton boton--secundario"
          disabled={guardando}
          onClick={() => cambiar(false)}
        >
          <RotateCcw size={18} aria-hidden="true" />
          {guardando ? 'Reactivando…' : 'Reactivar proveedor'}
        </button>
      </>
    )
  }

  if (!confirmando) {
    return (
      <button className="boton boton--texto" onClick={() => setConfirmando(true)}>
        <Archive size={18} aria-hidden="true" />
        Archivar proveedor
      </button>
    )
  }

  return (
    <section className="card formulario">
      <p className="formulario__ayuda">
        <strong>¿Archivar {proveedor.nombre}?</strong> Deja de aparecer para pedir. Su historial de
        pedidos y precios se guarda, y lo podés reactivar cuando quieras.
      </p>
      {error && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}
      <button className="boton boton--primario" disabled={guardando} onClick={() => cambiar(true)}>
        {guardando ? 'Archivando…' : 'Sí, archivar'}
      </button>
      <button
        className="boton boton--texto"
        disabled={guardando}
        onClick={() => setConfirmando(false)}
      >
        Cancelar
      </button>
    </section>
  )
}
