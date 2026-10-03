// "Primeros pasos" de un bar nuevo: lo que falta para estar andando, en orden. Se muestra en
// Inicio hasta que está todo hecho (o la persona lo oculta).

import type { Rol } from '../lib/permisos'

export type Avance = {
  rol: Rol
  /** Productos activos en el catálogo. */
  productos: number
  /** Personas activas en el equipo (solo lo sabe administración; null si no se sabe). */
  equipo: number | null
  hayPedidos: boolean
  hayRecepciones: boolean
  instalada: boolean
}

export type Paso = {
  clave: 'catalogo' | 'equipo' | 'pedido' | 'recepcion' | 'instalar'
  titulo: string
  detalle: string
  enlace: string
  hecho: boolean
}

export function primerosPasos(a: Avance): Paso[] {
  const pasos: Paso[] = [
    {
      clave: 'catalogo',
      titulo: 'Cargá tus proveedores y productos',
      detalle: 'A mano, o todos juntos con la planilla de Excel.',
      enlace: '/proveedores',
      hecho: a.productos > 0,
    },
    {
      clave: 'equipo',
      titulo: 'Sumá a tu equipo',
      detalle: 'Encargados y quienes reciben la mercadería, cada uno con su usuario.',
      enlace: '/ajustes',
      hecho: (a.equipo ?? 0) > 1,
    },
    {
      clave: 'pedido',
      titulo: 'Hacé tu primer pedido',
      detalle: 'Elegís el proveedor, las cantidades, y sale por WhatsApp.',
      enlace: '/pedir',
      hecho: a.hayPedidos,
    },
    {
      clave: 'recepcion',
      titulo: 'Recibí mercadería con una foto',
      detalle: 'La IA lee el remito y lo compara con lo que pediste.',
      enlace: '/recibir',
      hecho: a.hayRecepciones,
    },
    {
      clave: 'instalar',
      titulo: 'Instalá la app en tu celular',
      detalle: 'Queda con su ícono y anda sin señal.',
      enlace: '/instalar',
      hecho: a.instalada,
    },
  ]
  // El equipo lo arma administración; al resto ese paso no le toca. Recepción solo recibe.
  return pasos.filter((p) => {
    if (p.clave === 'equipo') return a.rol === 'admin'
    if (p.clave === 'catalogo' || p.clave === 'pedido') return a.rol !== 'recepcion'
    return true
  })
}
