// Exportar a Excel (SPEC §10). Se arma en el navegador con la misma librería que la plantilla
// de importación: mismo archivo que con una función del servidor, sin el corte de 26 s de
// Netlify y sin gastar créditos de funciones. La librería se carga solo al exportar.

import type { Catalogo } from '../catalogo/tipos'
import { ESTADOS, type EstadoPedido } from '../pedidos/tipos'
import { ESTADOS_DIFERENCIA, type EstadoDiferencia } from './estados'
import type { DatosPanel } from './cargar'
import { cambiosDePrecio, comprasPorProveedor, montoRecepcion, resumen } from './resumen'

type Celda = {
  value?: string | number | Date | null
  type?: typeof String | typeof Number | typeof Date
  format?: string
  fontWeight?: 'bold'
}

const titulo = (t: string): Celda => ({ value: t, fontWeight: 'bold' })
const texto = (t: string | null | undefined): Celda => ({ value: t ?? '', type: String })
const plata = (n: number | null | undefined): Celda =>
  n === null || n === undefined ? { value: null } : { value: n, type: Number, format: '#,##0.00' }
const numero = (n: number | null | undefined): Celda =>
  n === null || n === undefined ? { value: null } : { value: n, type: Number }
const fecha = (iso: string | null | undefined): Celda =>
  iso ? { value: new Date(iso), type: Date, format: 'dd/mm/yyyy hh:mm' } : { value: null }

const estadoPedido = (e: string) => ESTADOS[e as EstadoPedido]?.texto ?? e
const estadoDiferencia = (e: string) => ESTADOS_DIFERENCIA[e as EstadoDiferencia]?.texto ?? e

export type Periodo = { nombre: string; desde: Date; hasta: Date }

export function hojasDelPanel(
  datos: DatosPanel,
  catalogo: Catalogo,
  periodo: Periodo,
  locales: Map<string, string>,
) {
  const proveedor = (id: string) => catalogo.proveedores.find((p) => p.id === id)?.nombre ?? ''
  const producto = (id: string | null) =>
    id ? (catalogo.productos.find((p) => p.id === id)?.nombre ?? '') : ''
  const unidad = (id: string) => {
    const p = catalogo.productos.find((x) => x.id === id)
    return catalogo.unidades.find((u) => u.id === p?.unidad_base_id)?.nombre ?? ''
  }
  const r = resumen(datos.recepciones, datos.pedidos)

  return [
    {
      sheet: 'Resumen',
      columns: [{ width: 34 }, { width: 18 }],
      data: [
        [titulo(`Resumen de compras · ${periodo.nombre}`)],
        [],
        [texto('Compras del período'), plata(r.compras)],
        [texto('Proveedores con compras'), numero(r.proveedores)],
        [texto('Pedidos hechos'), numero(r.pedidos)],
        [texto('Pedidos en camino'), numero(r.enCamino)],
        [texto('Cumplimiento promedio (%)'), numero(r.cumplimiento)],
        [texto('Diferencias detectadas'), plata(r.diferencias)],
        [texto('Recepciones con diferencias'), numero(r.recepcionesConDiferencias)],
      ],
    },
    {
      sheet: 'Compras por proveedor',
      columns: [{ width: 34 }, { width: 18 }, { width: 14 }],
      data: [
        [titulo('Proveedor'), titulo('Compras'), titulo('Recepciones')],
        ...comprasPorProveedor(datos.recepciones).map((c) => [
          texto(proveedor(c.proveedor_id)),
          plata(c.monto),
          numero(c.recepciones),
        ]),
      ],
    },
    {
      sheet: 'Pedidos',
      columns: [
        { width: 10 },
        { width: 18 },
        { width: 30 },
        { width: 18 },
        { width: 16 },
        { width: 18 },
      ],
      data: [
        [
          titulo('Número'),
          titulo('Fecha'),
          titulo('Proveedor'),
          titulo('Local'),
          titulo('Estado'),
          titulo('Estimado'),
        ],
        ...datos.pedidos.map((p) => [
          numero(p.numero),
          fecha(p.creado_at),
          texto(proveedor(p.proveedor_id)),
          texto(locales.get(p.local_id) ?? ''),
          texto(estadoPedido(p.estado)),
          plata(p.estimado),
        ]),
      ],
    },
    {
      sheet: 'Recepciones',
      columns: [
        { width: 18 },
        { width: 30 },
        { width: 20 },
        { width: 10 },
        { width: 18 },
        { width: 12 },
        { width: 12 },
      ],
      data: [
        [
          titulo('Llegó'),
          titulo('Proveedor'),
          titulo('Remito'),
          titulo('Pedido'),
          titulo('Total'),
          titulo('Cargado'),
          titulo('Diferencias'),
        ],
        ...datos.recepciones.map((x) => [
          fecha(x.recibido_at),
          texto(proveedor(x.proveedor_id)),
          texto(x.nro_remito),
          numero(x.pedido_numero),
          plata(montoRecepcion(x)),
          texto(x.origen === 'ia' ? 'Con IA' : 'A mano'),
          numero(x.diferencias.length),
        ]),
      ],
    },
    {
      sheet: 'Diferencias',
      columns: [
        { width: 18 },
        { width: 30 },
        { width: 10 },
        { width: 50 },
        { width: 16 },
        { width: 16 },
      ],
      data: [
        [
          titulo('Llegó'),
          titulo('Proveedor'),
          titulo('Pedido'),
          titulo('Detalle'),
          titulo('Monto'),
          titulo('Estado'),
        ],
        ...datos.recepciones.flatMap((x) =>
          x.diferencias.map((d) => [
            fecha(x.recibido_at),
            texto(proveedor(x.proveedor_id)),
            numero(x.pedido_numero),
            texto(d.detalle),
            plata(d.monto !== null ? Math.abs(d.monto) : null),
            texto(estadoDiferencia(d.estado)),
          ]),
        ),
      ],
    },
    {
      sheet: 'Cambios de precio',
      columns: [
        { width: 18 },
        { width: 30 },
        { width: 34 },
        { width: 10 },
        { width: 14 },
        { width: 14 },
        { width: 12 },
        { width: 22 },
      ],
      data: [
        [
          titulo('Fecha'),
          titulo('Proveedor'),
          titulo('Producto'),
          titulo('Unidad'),
          titulo('Antes'),
          titulo('Ahora'),
          titulo('Var. %'),
          titulo('Nota'),
        ],
        ...cambiosDePrecio(datos.precios, periodo.desde, periodo.hasta).map((c) => [
          fecha(c.fecha),
          texto(proveedor(c.proveedor_id)),
          texto(producto(c.producto_id)),
          texto(unidad(c.producto_id)),
          plata(c.antes),
          plata(c.ahora),
          numero(c.variacionPct),
          texto(c.saltoRaro ? 'Revisar la unidad' : ''),
        ]),
      ],
    },
    {
      sheet: 'A pagar',
      columns: [{ width: 10 }, { width: 30 }, { width: 18 }, { width: 16 }, { width: 18 }],
      data: [
        [titulo('Pedido'), titulo('Proveedor'), titulo('Llegó'), titulo('Estado'), titulo('Monto')],
        ...datos.aPagar.map((p) => [
          numero(p.numero),
          texto(proveedor(p.proveedor_id)),
          fecha(p.recibido_at),
          texto(estadoPedido(p.estado)),
          plata(p.monto),
        ]),
      ],
    },
  ]
}

export async function exportarPanel(
  datos: DatosPanel,
  catalogo: Catalogo,
  periodo: Periodo,
  locales: Map<string, string>,
  organizacion: string,
) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const hojas = hojasDelPanel(datos, catalogo, periodo, locales)
  await writeXlsxFile(hojas as never).toFile(`SupplyIA - ${organizacion} - ${periodo.nombre}.xlsx`)
}
