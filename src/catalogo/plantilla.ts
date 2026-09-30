// Plantilla de Excel para la carga inicial (SPEC §9). La librería se carga solo al usarla.

import { COLUMNAS_PRODUCTOS, COLUMNAS_PROVEEDORES } from './importacion'

const INSTRUCCIONES = [
  'Cómo completar la planilla',
  '',
  'Hoja Proveedores: una fila por proveedor.',
  '  • WhatsApp: con código de área, por ejemplo 341 555-1234 (el 0 y el 15 se sacan solos).',
  '  • Días de entrega: por ejemplo "lun a sáb", "L M X J V" o "lunes, miércoles y viernes".',
  '  • Pedir antes de: texto libre, por ejemplo "18:00 del día anterior".',
  '',
  'Hoja Productos: una fila por producto (o una por cada presentación del mismo producto).',
  '  • Proveedor: tal cual está en la hoja Proveedores o en la app.',
  '  • Unidad: en la que se compra y viene en el remito: kg, g, lt, unidad, atado, caja, bolsa…',
  '  • Presentación y Cantidad por presentación: por ejemplo Caja y 18 (una caja trae 18 kg).',
  '    Si es aproximado (pieza, horma), escribí ≈ o "aprox" antes del número: ≈ 4,5.',
  '  • Cómo figura en el remito: el nombre que usa el proveedor, así la IA lo reconoce.',
  '  • Último precio: por unidad (por kg, por unidad…). Es opcional.',
  '',
  'Ejemplo de Productos:',
  'Verdulería Don Tito | Tomate perita | kg | Caja | 18 | TOMATE PERITA X KG | 2900',
  'Frigorífico San Jorge | Vacío | kg | Pieza | ≈ 4,5 | VACIO | 12500',
  '',
  'Lo que ya está cargado en la app se deja como está. Si alguna fila tiene un error,',
  'la app te dice cuál y no importa nada hasta que lo corrijas.',
]

export async function bajarPlantilla() {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const titulos = (columnas: readonly string[]) => [
    columnas.map((c) => ({
      value: c,
      fontWeight: 'bold' as const,
      backgroundColor: '#DCE8EC' /* --petroleo-suave */,
    })),
  ]
  await writeXlsxFile([
    {
      sheet: 'Proveedores',
      data: titulos(COLUMNAS_PROVEEDORES),
      columns: [{ width: 30 }, { width: 18 }, { width: 20 }, { width: 24 }],
      stickyRowsCount: 1,
    },
    {
      sheet: 'Productos',
      data: titulos(COLUMNAS_PRODUCTOS),
      columns: [
        { width: 28 },
        { width: 28 },
        { width: 10 },
        { width: 14 },
        { width: 14 },
        { width: 28 },
        { width: 14 },
      ],
      stickyRowsCount: 1,
    },
    {
      sheet: 'Instrucciones',
      data: INSTRUCCIONES.map((t, i) => [
        { value: t, fontWeight: i === 0 ? ('bold' as const) : undefined },
      ]),
      columns: [{ width: 100 }],
    },
  ]).toFile('SupplyIA - plantilla de proveedores y productos.xlsx')
}
