import { useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { EsperarCatalogo } from '../../catalogo/EsperarCatalogo'
import { useCatalogo } from '../../catalogo/contexto'
import { importarCatalogo } from '../../catalogo/acciones'
import {
  prepararImportacion,
  type Celda,
  type ResultadoImportacion,
} from '../../catalogo/importacion'
import { bajarPlantilla } from '../../catalogo/plantilla'
import type { Catalogo } from '../../catalogo/tipos'
import { TituloPantalla } from '../../components/TituloPantalla'
import { reportar } from '../../lib/errores'

export function Importar() {
  return (
    <>
      <TituloPantalla
        titulo="Importar desde Excel"
        volver="/proveedores"
        subtitulo="Proveedores y productos, todos juntos"
      />
      <EsperarCatalogo>{(catalogo) => <Pasos catalogo={catalogo} />}</EsperarCatalogo>
    </>
  )
}

type Estado =
  | { paso: 'elegir' }
  | { paso: 'leyendo' }
  | { paso: 'revisar'; archivo: string; resultado: ResultadoImportacion }
  | { paso: 'importando'; archivo: string; resultado: ResultadoImportacion }
  | { paso: 'listo'; resultado: ResultadoImportacion }

function Pasos({ catalogo }: { catalogo: Catalogo }) {
  const { recargar } = useCatalogo()
  const entrada = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<Estado>({ paso: 'elegir' })
  const [error, setError] = useState('')
  const [bajando, setBajando] = useState(false)

  async function plantilla() {
    setBajando(true)
    setError('')
    try {
      await bajarPlantilla()
    } catch (e) {
      reportar(e, 'Bajar plantilla')
      setError('No pudimos armar la plantilla. Probá de nuevo.')
    }
    setBajando(false)
  }

  async function leer(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    e.target.value = '' // así se puede volver a elegir el mismo archivo después de corregirlo
    if (!archivo) return
    setError('')
    setEstado({ paso: 'leyendo' })
    try {
      const { default: leerExcel } = await import('read-excel-file/browser')
      const hojas = await leerExcel(archivo)
      const resultado = prepararImportacion(
        // Los tipos de la librería incluyen constructores; en la práctica llegan valores.
        hojas.map((h) => ({ nombre: h.sheet, filas: h.data as Celda[][] })),
        catalogo,
      )
      setEstado({ paso: 'revisar', archivo: archivo.name, resultado })
    } catch (e) {
      console.error('No se pudo leer la planilla', e)
      setEstado({ paso: 'elegir' })
      setError(
        'No pudimos leer el archivo. Tiene que ser una planilla de Excel (.xlsx), como la plantilla.',
      )
    }
  }

  async function importar() {
    if (estado.paso !== 'revisar') return
    setError('')
    setEstado({ ...estado, paso: 'importando' })
    const r = await importarCatalogo(estado.resultado.datos)
    if (!r.ok) {
      setEstado({ ...estado, paso: 'revisar' })
      return setError(r.mensaje)
    }
    await recargar()
    setEstado({ paso: 'listo', resultado: estado.resultado })
  }

  if (estado.paso === 'listo') {
    return (
      <section className="card formulario">
        <p className="aviso aviso--ok" role="status">
          <strong>Listo.</strong> Se importaron {resumen(estado.resultado)}.
        </p>
        <Link to="/proveedores" className="boton boton--primario">
          Ver proveedores
        </Link>
        <button className="boton boton--texto" onClick={() => setEstado({ paso: 'elegir' })}>
          Importar otra planilla
        </button>
      </section>
    )
  }

  const revisando = estado.paso === 'revisar' || estado.paso === 'importando'

  return (
    <>
      <section className="card formulario">
        <h2>1. Bajá la plantilla</h2>
        <p className="formulario__ayuda">
          Tiene una hoja para proveedores, otra para productos y las instrucciones.
        </p>
        <button className="boton boton--secundario" onClick={plantilla} disabled={bajando}>
          <Download size={18} aria-hidden="true" />
          {bajando ? 'Armando…' : 'Bajar plantilla'}
        </button>
      </section>

      <section className="card formulario">
        <h2>2. Completala y subila</h2>
        <p className="formulario__ayuda">
          Antes de guardar te mostramos qué se va a importar y si alguna fila tiene un error.
        </p>
        <input
          ref={entrada}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={leer}
          hidden
          aria-label="Elegir planilla"
        />
        <button
          className={revisando ? 'boton boton--secundario' : 'boton boton--primario'}
          onClick={() => entrada.current?.click()}
          disabled={estado.paso === 'leyendo' || estado.paso === 'importando'}
        >
          <Upload size={18} aria-hidden="true" />
          {estado.paso === 'leyendo'
            ? 'Leyendo…'
            : revisando
              ? 'Elegir otra planilla'
              : 'Elegir planilla'}
        </button>
      </section>

      {error && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}

      {revisando && (
        <Revision
          archivo={estado.archivo}
          resultado={estado.resultado}
          importando={estado.paso === 'importando'}
          onImportar={importar}
        />
      )}
    </>
  )
}

function Revision({
  archivo,
  resultado,
  importando,
  onImportar,
}: {
  archivo: string
  resultado: ResultadoImportacion
  importando: boolean
  onImportar: () => void
}) {
  const { errores, avisos, datos } = resultado
  const vacia = datos.proveedores.length === 0 && datos.productos.length === 0

  return (
    <section className="card formulario" aria-labelledby="titulo-revision">
      <h2 id="titulo-revision">
        <FileSpreadsheet size={18} aria-hidden="true" /> {archivo}
      </h2>

      {errores.length > 0 ? (
        <>
          <p className="aviso aviso--error" role="alert">
            <strong>
              {errores.length === 1
                ? 'Hay 1 fila con error'
                : `Hay ${errores.length} filas con error`}
              .
            </strong>{' '}
            Corregilas en la planilla y volvé a subirla. Todavía no se importó nada.
          </p>
          <ListaProblemas problemas={errores} />
        </>
      ) : vacia ? (
        <p className="aviso aviso--atencion">No hay nada nuevo para importar en esta planilla.</p>
      ) : (
        <p className="aviso aviso--ok">Todo bien. Se van a importar {resumen(resultado)}.</p>
      )}

      {avisos.length > 0 && (
        <>
          <p className="formulario__ayuda">
            <strong>Ya estaban cargados</strong> (no se cambian):
          </p>
          <ListaProblemas problemas={avisos} />
        </>
      )}

      {errores.length === 0 && !vacia && (
        <button className="boton boton--primario" onClick={onImportar} disabled={importando}>
          {importando ? 'Importando…' : 'Importar todo'}
        </button>
      )}
    </section>
  )
}

function ListaProblemas({ problemas }: { problemas: ResultadoImportacion['errores'] }) {
  return (
    <ul className="errores-importacion">
      {problemas.map((p, i) => (
        <li key={i}>
          <span className="mono">
            {p.hoja.slice(0, 4)}.{p.fila ? ` ${p.fila}` : ''}
          </span>
          <span>{p.mensaje}</span>
        </li>
      ))}
    </ul>
  )
}

function resumen({ datos }: ResultadoImportacion): string {
  const partes = [
    [datos.proveedores.length, 'proveedor', 'proveedores'],
    [datos.productos.length, 'producto', 'productos'],
    [datos.presentaciones.length, 'presentación', 'presentaciones'],
    [datos.precios.length, 'precio', 'precios'],
  ] as const
  const textos = partes
    .filter(([n]) => n > 0)
    .map(([n, uno, varios]) => `${n} ${n === 1 ? uno : varios}`)
  if (textos.length <= 1) return textos[0] ?? 'nada'
  const ultimo = textos.pop()
  return `${textos.join(', ')} y ${ultimo}`
}
