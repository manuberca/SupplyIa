import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Archive, Plus, RotateCcw, X } from 'lucide-react'
import { EsperarCatalogo } from '../../catalogo/EsperarCatalogo'
import { useCatalogo } from '../../catalogo/contexto'
import { archivarProducto, crearProducto, editarProducto } from '../../catalogo/acciones'
import { erroresPorCampo, productoSchema } from '../../catalogo/esquemas'
import { NuevaUnidad } from '../../catalogo/NuevaUnidad'
import type { Catalogo, Producto, Proveedor } from '../../catalogo/tipos'
import { TituloPantalla } from '../../components/TituloPantalla'
import { numero } from '../../lib/formato'
import { normalizar, normalizarUnidad } from '../../lib/normalizar'
import { useSesionLista } from '../../sesion/contexto'

export function FormProducto() {
  const { id, productoId } = useParams()
  return (
    <EsperarCatalogo>
      {(catalogo) => {
        const proveedor = catalogo.proveedores.find((p) => p.id === id)
        const producto = productoId
          ? catalogo.productos.find((p) => p.id === productoId)
          : undefined
        if (!proveedor || (productoId && !producto)) {
          return (
            <>
              <TituloPantalla
                titulo="Producto"
                volver={proveedor ? `/proveedores/${proveedor.id}` : '/proveedores'}
              />
              <p className="aviso aviso--error">No encontramos ese producto.</p>
            </>
          )
        }
        return (
          <Formulario
            key={productoId ?? 'nuevo'}
            catalogo={catalogo}
            proveedor={proveedor}
            existente={producto}
          />
        )
      }}
    </EsperarCatalogo>
  )
}

type FilaPresentacion = { id: string; nombre: string; factor: string; aproximada: boolean }

const filaVacia = (): FilaPresentacion => ({
  id: crypto.randomUUID(),
  nombre: '',
  factor: '',
  aproximada: false,
})

// Las que se muestran primero, como en el diseño. El resto aparece en "otra".
const PRINCIPALES = ['kg', 'unidad', 'atado']

function Formulario({
  catalogo,
  proveedor,
  existente,
}: {
  catalogo: Catalogo
  proveedor: Proveedor
  existente?: Producto
}) {
  const navigate = useNavigate()
  const { org } = useSesionLista()
  const { recargar } = useCatalogo()

  const antes = existente
    ? catalogo.presentaciones
        .filter((p) => p.producto_id === existente.id)
        .map(({ id, nombre, factor_a_base, aproximada }) => ({
          id,
          nombre,
          factor_a_base,
          aproximada,
        }))
    : []

  const [id] = useState(() => existente?.id ?? crypto.randomUUID())
  const [nombre, setNombre] = useState(existente?.nombre ?? '')
  const [unidadId, setUnidadId] = useState(existente?.unidad_base_id ?? '')
  const [filas, setFilas] = useState<FilaPresentacion[]>(() =>
    antes.length
      ? antes.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          factor: numero(p.factor_a_base, 4),
          aproximada: p.aproximada,
        }))
      : [filaVacia()],
  )
  const [verTodas, setVerTodas] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const unidades = catalogo.unidades.filter((u) => !u.archivada || u.id === unidadId)
  const unidad = catalogo.unidades.find((u) => u.id === unidadId)
  const orden = (nombre: string) => {
    const i = PRINCIPALES.indexOf(normalizarUnidad(nombre))
    return i === -1 ? PRINCIPALES.length : i
  }
  const principales = unidades
    .filter((u) => PRINCIPALES.includes(normalizarUnidad(u.nombre)) || u.id === unidadId)
    .sort((a, b) => orden(a.nombre) - orden(b.nombre))
  const visibles = verTodas ? unidades : principales

  const repetido = catalogo.productos.find(
    (p) =>
      p.activo &&
      p.proveedor_id === proveedor.id &&
      p.id !== id &&
      normalizar(p.nombre) === normalizar(nombre) &&
      nombre.trim(),
  )

  function cambiarFila(filaId: string, cambios: Partial<FilaPresentacion>) {
    setFilas((f) => f.map((x) => (x.id === filaId ? { ...x, ...cambios } : x)))
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError('')
    // Las filas vacías se ignoran (la primera aparece vacía para invitar a cargarla).
    const presentaciones = filas.filter((f) => f.nombre.trim() || f.factor.trim())
    const r = productoSchema.safeParse({ nombre, unidad_base_id: unidadId, presentaciones })
    const nuevosErrores = r.success ? {} : erroresPorCampo(r.error)
    if (repetido)
      nuevosErrores.nombre = `${proveedor.nombre} ya tiene un producto que se llama "${repetido.nombre}".`
    const nombres = presentaciones.map((p) => normalizarUnidad(p.nombre))
    if (new Set(nombres).size !== nombres.length) {
      nuevosErrores.presentaciones = 'Hay dos presentaciones con el mismo nombre.'
    }
    setErrores(nuevosErrores)
    if (!r.success || Object.keys(nuevosErrores).length) return

    setGuardando(true)
    const datos = {
      id,
      proveedor_id: proveedor.id,
      nombre: r.data.nombre,
      unidad_base_id: r.data.unidad_base_id,
      presentaciones: r.data.presentaciones.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        factor_a_base: p.factor,
        aproximada: p.aproximada,
      })),
    }
    const resultado = existente
      ? await editarProducto(org.id, datos, antes)
      : await crearProducto(org.id, datos)
    if (!resultado.ok) {
      setGuardando(false)
      return setError(resultado.mensaje)
    }
    await recargar()
    navigate(`/proveedores/${proveedor.id}`, { replace: true })
  }

  // Los errores de zod de las presentaciones vienen como "presentaciones.0.factor".
  const errorPresentaciones =
    errores.presentaciones ??
    Object.entries(errores).find(([k]) => k.startsWith('presentaciones.'))?.[1]

  return (
    <>
      <TituloPantalla
        titulo={existente ? 'Editar producto' : 'Nuevo producto'}
        volver={`/proveedores/${proveedor.id}`}
        subtitulo={`Para ${proveedor.nombre}`}
      />

      <form className="formulario" onSubmit={guardar} noValidate>
        <label className="campo">
          <span className="campo__etiqueta">Nombre</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            aria-invalid={!!(errores.nombre || repetido)}
          />
          {(errores.nombre || repetido) && (
            <span className="campo__ayuda campo__ayuda--error">
              {errores.nombre ??
                `${proveedor.nombre} ya tiene un producto que se llama "${repetido!.nombre}".`}
            </span>
          )}
        </label>

        <fieldset className="grupo">
          <legend className="campo__etiqueta">Unidad de compra</legend>
          <div className="chips">
            {visibles.map((u) => (
              <button
                key={u.id}
                type="button"
                className="chip"
                aria-pressed={u.id === unidadId}
                onClick={() => setUnidadId(u.id)}
              >
                {u.nombre}
                {u.archivada ? ' (archivada)' : ''}
              </button>
            ))}
            {!verTodas && (
              <button
                type="button"
                className="chip"
                aria-pressed={false}
                onClick={() => setVerTodas(true)}
              >
                otra
              </button>
            )}
          </div>
          {errores.unidad_base_id && (
            <span className="campo__ayuda campo__ayuda--error">{errores.unidad_base_id}</span>
          )}
          {verTodas && (
            <NuevaUnidad
              catalogo={catalogo}
              titulo="¿No está? Creá una unidad nueva"
              onCreada={setUnidadId}
            />
          )}
        </fieldset>

        <fieldset className="grupo">
          <legend className="campo__etiqueta">También viene en</legend>
          {filas.map((f, i) => (
            <div key={f.id} className="grupo">
              <div className="presentacion">
                <input
                  aria-label={`Presentación ${i + 1}: nombre`}
                  placeholder="Caja"
                  value={f.nombre}
                  onChange={(e) => cambiarFila(f.id, { nombre: e.target.value })}
                />
                <span aria-hidden="true">{f.aproximada ? '≈' : '='}</span>
                <input
                  className="mono presentacion__factor"
                  aria-label={`Presentación ${i + 1}: cuánto trae`}
                  inputMode="decimal"
                  placeholder="10"
                  value={f.factor}
                  onChange={(e) => cambiarFila(f.id, { factor: e.target.value })}
                />
                <span className="presentacion__unidad">{unidad?.nombre ?? '…'}</span>
                <button
                  type="button"
                  className="boton-icono"
                  aria-label={`Sacar presentación ${i + 1}`}
                  onClick={() => setFilas((x) => x.filter((y) => y.id !== f.id))}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              {unidad?.tipo !== 'unidad' && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={f.aproximada}
                    onChange={(e) => cambiarFila(f.id, { aproximada: e.target.checked })}
                  />
                  Es aproximado (pieza, horma)
                </label>
              )}
            </div>
          ))}
          {errorPresentaciones && (
            <span className="campo__ayuda campo__ayuda--error">{errorPresentaciones}</span>
          )}
          <button
            type="button"
            className="enlace-accion"
            onClick={() => setFilas((x) => [...x, filaVacia()])}
          >
            <Plus size={16} aria-hidden="true" />
            {filas.length ? 'Otra presentación' : 'Agregar presentación'}
          </button>
          <p className="campo__ayuda">
            Sirve para pedir por caja y que la IA entienda el remito en{' '}
            {unidad?.nombre ?? 'la unidad de compra'}.
          </p>
        </fieldset>

        {error && (
          <p className="aviso aviso--error" role="alert">
            {error}
          </p>
        )}

        <div className="acciones">
          <button className="boton boton--primario" disabled={guardando}>
            {guardando ? 'Guardando…' : existente ? 'Guardar cambios' : 'Guardar producto'}
          </button>
          {existente && <ArchivarProducto producto={existente} />}
        </div>
      </form>
    </>
  )
}

function ArchivarProducto({ producto }: { producto: Producto }) {
  const navigate = useNavigate()
  const { recargar } = useCatalogo()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function cambiar() {
    setGuardando(true)
    setError('')
    const r = await archivarProducto(producto.id, producto.activo)
    if (!r.ok) {
      setGuardando(false)
      return setError(r.mensaje)
    }
    await recargar()
    navigate(`/proveedores/${producto.proveedor_id}`, { replace: true })
  }

  return (
    <>
      {error && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="boton boton--texto" disabled={guardando} onClick={cambiar}>
        {producto.activo ? (
          <Archive size={18} aria-hidden="true" />
        ) : (
          <RotateCcw size={18} aria-hidden="true" />
        )}
        {producto.activo ? 'Archivar producto' : 'Reactivar producto'}
      </button>
    </>
  )
}
