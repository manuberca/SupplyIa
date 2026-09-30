import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { EsperarCatalogo } from '../../catalogo/EsperarCatalogo'
import { useCatalogo } from '../../catalogo/contexto'
import { cambiarUmbral, guardarAjustes } from '../../catalogo/acciones'
import type { Catalogo } from '../../catalogo/tipos'
import { Paso } from '../../components/Paso'
import { numero } from '../../lib/formato'
import { useSesionLista } from '../../sesion/contexto'

/** Ajustes → alerta de aumento, excepciones y tolerancias (solo administración). SPEC §6. */
export function ControlAjustes() {
  return <EsperarCatalogo>{(catalogo) => <Contenido catalogo={catalogo} />}</EsperarCatalogo>
}

const pct = (v: number) => `${numero(v, 1)}%`

function Contenido({ catalogo }: { catalogo: Catalogo }) {
  const { org } = useSesionLista()
  const { recargar } = useCatalogo()
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const a = catalogo.ajustes

  async function guardar(accion: () => Promise<{ ok: true } | { ok: false; mensaje: string }>) {
    setGuardando(true)
    setError('')
    const r = await accion()
    if (r.ok) await recargar()
    else setError(r.mensaje)
    setGuardando(false)
  }

  const excepciones = [
    ...catalogo.proveedores
      .filter((p) => p.activo && p.umbral_alerta_pct !== null)
      .map((p) => ({
        tipo: 'proveedor' as const,
        id: p.id,
        nombre: p.nombre,
        detalle: 'Excepción para este proveedor',
        umbral: p.umbral_alerta_pct!,
      })),
    ...catalogo.productos
      .filter((p) => p.activo && p.umbral_alerta_pct !== null)
      .map((p) => ({
        tipo: 'producto' as const,
        id: p.id,
        nombre: p.nombre,
        detalle: `Producto de ${catalogo.proveedores.find((x) => x.id === p.proveedor_id)?.nombre ?? ''}`,
        umbral: p.umbral_alerta_pct!,
      })),
  ]

  return (
    <>
      <section className="card formulario" aria-labelledby="titulo-alerta">
        <h2 id="titulo-alerta">Alerta de aumento</h2>
        <div className="ajuste">
          <span className="formulario__ayuda">Avisar cuando un insumo sube más de</span>
          <Paso
            etiqueta="Umbral de alerta"
            valor={a.umbral_alerta_pct}
            texto={pct}
            deshabilitado={guardando}
            onCambiar={(v) => guardar(() => guardarAjustes(org.id, { umbral_alerta_pct: v }))}
          />
        </div>
        {excepciones.map((e) => (
          <div key={e.id} className="ajuste">
            <span className="lista__texto">
              <span className="lista__titulo">{e.nombre}</span>
              <span className="lista__detalle">{e.detalle}</span>
            </span>
            <span className="grupo">
              <Paso
                etiqueta={`Umbral de ${e.nombre}`}
                valor={e.umbral}
                texto={pct}
                deshabilitado={guardando}
                onCambiar={(v) => guardar(() => cambiarUmbral(e.tipo, e.id, v))}
              />
              <button
                className="enlace-accion"
                disabled={guardando}
                onClick={() => guardar(() => cambiarUmbral(e.tipo, e.id, null))}
              >
                <X size={14} aria-hidden="true" /> Sacar excepción
              </button>
            </span>
          </div>
        ))}
        <NuevaExcepcion
          catalogo={catalogo}
          deshabilitado={guardando}
          onAgregar={(tipo, id) => guardar(() => cambiarUmbral(tipo, id, a.umbral_alerta_pct))}
        />
      </section>

      <section className="card formulario" aria-labelledby="titulo-tolerancia">
        <h2 id="titulo-tolerancia">Tolerancia al recibir</h2>
        <p className="formulario__ayuda">Cuánto puede faltar sin que cuente como faltante.</p>
        <div className="ajuste">
          <span className="lista__titulo">Productos por peso</span>
          <Paso
            etiqueta="Tolerancia de productos por peso"
            valor={a.tolerancia_peso_pct}
            texto={(v) => `± ${pct(v)}`}
            max={50}
            deshabilitado={guardando}
            onCambiar={(v) => guardar(() => guardarAjustes(org.id, { tolerancia_peso_pct: v }))}
          />
        </div>
        <div className="ajuste">
          <span className="lista__titulo">Productos por unidad</span>
          <Paso
            etiqueta="Tolerancia de productos por unidad"
            valor={a.tolerancia_unidad_pct}
            texto={(v) => (v === 0 ? 'exacto' : `± ${pct(v)}`)}
            max={50}
            deshabilitado={guardando}
            onCambiar={(v) => guardar(() => guardarAjustes(org.id, { tolerancia_unidad_pct: v }))}
          />
        </div>
      </section>

      {error && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

function NuevaExcepcion({
  catalogo,
  deshabilitado,
  onAgregar,
}: {
  catalogo: Catalogo
  deshabilitado: boolean
  onAgregar: (tipo: 'proveedor' | 'producto', id: string) => void
}) {
  const [abierta, setAbierta] = useState(false)
  if (!abierta) {
    return (
      <button className="enlace-accion" onClick={() => setAbierta(true)}>
        <Plus size={16} aria-hidden="true" />
        Excepción por proveedor o producto
      </button>
    )
  }
  const proveedores = catalogo.proveedores.filter((p) => p.activo && p.umbral_alerta_pct === null)
  const productos = catalogo.productos.filter((p) => p.activo && p.umbral_alerta_pct === null)
  return (
    <label className="campo">
      <span className="campo__etiqueta">¿Para quién?</span>
      <select
        value=""
        disabled={deshabilitado}
        onChange={(e) => {
          const [tipo, id] = e.target.value.split(':') as ['proveedor' | 'producto', string]
          if (id) {
            onAgregar(tipo, id)
            setAbierta(false)
          }
        }}
      >
        <option value="">Elegí un proveedor o un producto…</option>
        <optgroup label="Proveedores">
          {proveedores.map((p) => (
            <option key={p.id} value={`proveedor:${p.id}`}>
              {p.nombre}
            </option>
          ))}
        </optgroup>
        <optgroup label="Productos">
          {productos.map((p) => (
            <option key={p.id} value={`producto:${p.id}`}>
              {p.nombre} ({catalogo.proveedores.find((x) => x.id === p.proveedor_id)?.nombre})
            </option>
          ))}
        </optgroup>
      </select>
      <span className="campo__ayuda">Arranca con el umbral general; después lo subís o bajás.</span>
    </label>
  )
}
