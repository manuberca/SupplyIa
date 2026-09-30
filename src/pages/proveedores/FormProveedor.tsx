import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Check } from 'lucide-react'
import { EsperarCatalogo } from '../../catalogo/EsperarCatalogo'
import { useCatalogo } from '../../catalogo/contexto'
import { crearProveedor, editarProveedor } from '../../catalogo/acciones'
import { erroresPorCampo, proveedorSchema } from '../../catalogo/esquemas'
import type { Catalogo, Proveedor } from '../../catalogo/tipos'
import { TituloPantalla } from '../../components/TituloPantalla'
import { DIAS } from '../../lib/dias'
import { normalizar } from '../../lib/normalizar'
import { normalizarWhatsapp, whatsappParaEditar } from '../../lib/whatsapp'
import { useSesionLista } from '../../sesion/contexto'

export function FormProveedor() {
  const { id } = useParams()
  return (
    <EsperarCatalogo>
      {(catalogo) => {
        const existente = id ? catalogo.proveedores.find((p) => p.id === id) : undefined
        if (id && !existente) {
          return (
            <>
              <TituloPantalla titulo="Proveedor" volver="/proveedores" />
              <p className="aviso aviso--error">No encontramos ese proveedor.</p>
            </>
          )
        }
        // key: si cambia de proveedor, el formulario arranca de cero.
        return <Formulario key={id ?? 'nuevo'} catalogo={catalogo} existente={existente} />
      }}
    </EsperarCatalogo>
  )
}

function Formulario({ catalogo, existente }: { catalogo: Catalogo; existente?: Proveedor }) {
  const navigate = useNavigate()
  const { org } = useSesionLista()
  const { recargar } = useCatalogo()

  const [id] = useState(() => existente?.id ?? crypto.randomUUID())
  const [nombre, setNombre] = useState(existente?.nombre ?? '')
  const [whatsapp, setWhatsapp] = useState(existente ? whatsappParaEditar(existente.whatsapp) : '')
  const [dias, setDias] = useState<number[]>(existente?.dias_entrega ?? [])
  const [horaLimite, setHoraLimite] = useState(existente?.hora_limite ?? '')
  const [salioDelWhatsapp, setSalioDelWhatsapp] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const otros = catalogo.proveedores.filter((p) => p.activo && p.id !== id)
  const numero = normalizarWhatsapp(whatsapp)
  const repetidoNumero = numero.ok ? otros.find((p) => p.whatsapp === numero.numero) : undefined
  const repetidoNombre = otros.find(
    (p) => normalizar(p.nombre) === normalizar(nombre) && nombre.trim(),
  )

  function alternarDia(n: number) {
    setDias((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort((a, b) => a - b)))
  }

  async function guardar(e: FormEvent, despues: 'ficha' | 'importar') {
    e.preventDefault()
    setError('')
    const r = proveedorSchema.safeParse({
      nombre,
      whatsapp,
      dias_entrega: dias,
      hora_limite: horaLimite,
    })
    const nuevosErrores = r.success ? {} : erroresPorCampo(r.error)
    if (repetidoNombre)
      nuevosErrores.nombre = `Ya hay un proveedor que se llama "${repetidoNombre.nombre}".`
    if (repetidoNumero) nuevosErrores.whatsapp = `Ese número ya lo tiene ${repetidoNumero.nombre}.`
    setErrores(nuevosErrores)
    if (!r.success || Object.keys(nuevosErrores).length) return

    setGuardando(true)
    const datos = { id, ...r.data }
    const resultado = existente ? await editarProveedor(datos) : await crearProveedor(org.id, datos)
    if (!resultado.ok) {
      setGuardando(false)
      return setError(resultado.mensaje)
    }
    await recargar()
    navigate(despues === 'importar' ? '/proveedores/importar' : `/proveedores/${id}`, {
      replace: true,
    })
  }

  const ayudaWhatsapp = (() => {
    if (errores.whatsapp)
      return <p className="campo__ayuda campo__ayuda--error">{errores.whatsapp}</p>
    if (repetidoNumero) {
      return (
        <p className="campo__ayuda campo__ayuda--error">
          Ese número ya lo tiene {repetidoNumero.nombre}.
        </p>
      )
    }
    // Mientras escribe no molesta; al salir del campo avisa si está mal.
    if (!numero.ok && salioDelWhatsapp && whatsapp.trim()) {
      return <p className="campo__ayuda campo__ayuda--error">{numero.mensaje}</p>
    }
    if (numero.ok) {
      return (
        <p className="campo__ayuda campo__ayuda--ok">
          <Check size={16} aria-hidden="true" />
          Número válido · no está repetido en otro proveedor
        </p>
      )
    }
    return <p className="campo__ayuda">Con código de área, sin 0 ni 15. Ejemplo: 341 555-1234.</p>
  })()

  return (
    <>
      <TituloPantalla
        titulo={existente ? 'Editar proveedor' : 'Nuevo proveedor'}
        volver={existente ? `/proveedores/${existente.id}` : '/proveedores'}
      />

      <form className="formulario" onSubmit={(e) => guardar(e, 'ficha')} noValidate>
        <label className="campo">
          <span className="campo__etiqueta">Nombre</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoCapitalize="words"
            aria-invalid={!!(errores.nombre || repetidoNombre)}
          />
          {(errores.nombre || repetidoNombre) && (
            <span className="campo__ayuda campo__ayuda--error">
              {errores.nombre ?? `Ya hay un proveedor que se llama "${repetidoNombre!.nombre}".`}
            </span>
          )}
        </label>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor="whatsapp">
            WhatsApp para pedidos
          </label>
          <div className="whatsapp">
            <span className="whatsapp__prefijo" aria-hidden="true">
              +54 9
            </span>
            <input
              id="whatsapp"
              className="mono"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="341 555-1234"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              onBlur={() => setSalioDelWhatsapp(true)}
              aria-invalid={!!(errores.whatsapp || repetidoNumero)}
              aria-describedby="whatsapp-ayuda"
            />
          </div>
          <div id="whatsapp-ayuda">{ayudaWhatsapp}</div>
        </div>

        <fieldset className="grupo">
          <legend className="campo__etiqueta">Días que entrega</legend>
          <div className="dias">
            {DIAS.map((d) => (
              <button
                key={d.n}
                type="button"
                className="chip"
                aria-pressed={dias.includes(d.n)}
                aria-label={d.largo}
                onClick={() => alternarDia(d.n)}
              >
                {d.letra}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="campo">
          <span className="campo__etiqueta">Pedir antes de</span>
          <input
            value={horaLimite}
            onChange={(e) => setHoraLimite(e.target.value)}
            placeholder="Ej: 18:00 del día anterior"
            aria-invalid={!!errores.hora_limite}
          />
          {errores.hora_limite && (
            <span className="campo__ayuda campo__ayuda--error">{errores.hora_limite}</span>
          )}
        </label>

        {!existente && (
          <p className="nota">
            <strong>Productos</strong>
            Después de guardar, cargalos uno por uno o subí la planilla de Excel con todos juntos.
          </p>
        )}

        {error && (
          <p className="aviso aviso--error" role="alert">
            {error}
          </p>
        )}

        <div className="acciones">
          <button className="boton boton--primario" disabled={guardando}>
            {guardando ? 'Guardando…' : existente ? 'Guardar cambios' : 'Guardar proveedor'}
          </button>
          {!existente && (
            <button
              type="button"
              className="boton boton--secundario"
              disabled={guardando}
              onClick={(e) => guardar(e, 'importar')}
            >
              Guardar e importar productos
            </button>
          )}
        </div>
      </form>
    </>
  )
}
