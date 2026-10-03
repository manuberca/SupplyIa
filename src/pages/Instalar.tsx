import { CheckCircle2, Download, MonitorSmartphone } from 'lucide-react'
import { TituloPantalla } from '../components/TituloPantalla'
import { useInstalacion, type Plataforma } from '../lib/instalar'

const PASOS: Record<Plataforma, { titulo: string; pasos: string[] }> = {
  iphone: {
    titulo: 'En iPhone o iPad',
    pasos: [
      'Abrí esta página en Safari (no desde WhatsApp ni desde otra app).',
      'Tocá el botón Compartir: el cuadrado con la flecha hacia arriba.',
      'Bajá y elegí "Agregar a inicio".',
      'Tocá "Agregar". El ícono de SupplyIA queda con tus otras apps.',
    ],
  },
  android: {
    titulo: 'En Android',
    pasos: [
      'Abrí esta página en Chrome.',
      'Tocá los tres puntos, arriba a la derecha.',
      'Elegí "Instalar app" (o "Agregar a pantalla principal").',
      'Confirmá. El ícono de SupplyIA queda con tus otras apps.',
    ],
  },
  computadora: {
    titulo: 'En la computadora',
    pasos: [
      'Abrí esta página en Chrome o Edge.',
      'En la barra de direcciones, a la derecha, tocá el ícono de instalar (una pantalla con una flecha).',
      'Confirmá. SupplyIA se abre en su propia ventana, como un programa más.',
      'Si usás otro navegador, guardá la página en favoritos: funciona igual.',
    ],
  },
}

/** Cómo dejar la app instalada en cada dispositivo. No hay nada que bajar de una tienda. */
export function Instalar() {
  const { instalada, puedeInstalar, plataforma, instalar } = useInstalacion()
  const otras = (Object.keys(PASOS) as Plataforma[]).filter((p) => p !== plataforma)

  return (
    <>
      <TituloPantalla titulo="Instalá la app" volver="/ajustes" />

      <section className="card formulario">
        <p className="formulario__ayuda">
          SupplyIA no se baja de una tienda: se instala desde el navegador y queda con su ícono, a
          pantalla completa. Los pedidos y las recepciones a mano andan también sin señal, y se
          actualiza sola.
        </p>
        {instalada ? (
          <p className="aviso aviso--ok" role="status">
            <CheckCircle2 size={16} aria-hidden="true" /> <strong>Ya la tenés instalada</strong> en
            este dispositivo.
          </p>
        ) : (
          puedeInstalar && (
            <button className="boton boton--primario" onClick={instalar}>
              <Download size={18} aria-hidden="true" />
              Instalar en este dispositivo
            </button>
          )
        )}
      </section>

      {!instalada && <Pasos plataforma={plataforma} destacado />}

      <section className="card formulario">
        <p className="lista__titulo">
          <MonitorSmartphone size={18} aria-hidden="true" /> En otro dispositivo
        </p>
        <p className="formulario__ayuda">
          Entrá a <strong className="mono">{window.location.host}</strong> con tu mail y tu
          contraseña, y seguí los pasos que correspondan. Se puede usar en todos los que quieras.
        </p>
      </section>

      {otras.map((p) => (
        <Pasos key={p} plataforma={p} />
      ))}
    </>
  )
}

function Pasos({ plataforma, destacado }: { plataforma: Plataforma; destacado?: boolean }) {
  const { titulo, pasos } = PASOS[plataforma]
  return (
    <section className="card formulario" aria-label={titulo}>
      <p className="lista__titulo">
        {titulo}
        {destacado && <span className="pastilla pastilla--info pasos__este">Este dispositivo</span>}
      </p>
      <ol className="pasos">
        {pasos.map((paso) => (
          <li key={paso}>{paso}</li>
        ))}
      </ol>
    </section>
  )
}
