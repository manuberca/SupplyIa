// Conciliación de una recepción (SPEC §6): lo pedido contra lo que llegó, en la unidad base
// de cada producto, con las tolerancias y el umbral de aumento configurados.

import { numero, pesos, porcentaje } from '../lib/formato'
import { normalizarUnidad } from '../lib/normalizar'
import { cantidadBase } from '../lib/presentaciones'
import { textoCantidad } from '../pedidos/logica'

export type Resultado = 'ok' | 'faltante' | 'exceso' | 'precio_subio' | 'precio_bajo' | 'no_pedido'

export type Ajustes = {
  umbral_alerta_pct: number
  tolerancia_peso_pct: number
  tolerancia_unidad_pct: number
}

export type ProductoConciliable = {
  id: string
  nombre: string
  unidad: { nombre: string; tipo: string }
  presentaciones: { id: string; nombre: string; factor_a_base: number; aproximada: boolean }[]
  umbral: number | null
  /** Último precio pagado antes de esta recepción, por unidad base. */
  precioAnterior: number | null
}

export type ItemPedido = {
  producto_id: string
  presentacion_id: string | null
  cantidad: number
  precio_estimado_base: number | null
}

/** Un renglón del remito, leído por la IA o cargado a mano. */
export type RenglonRemito = {
  id: string
  texto: string
  productoId: string | null
  cantidad: number | null
  unidad: string | null
  precioUnit: number | null
  subtotal: number | null
}

export type Fila = {
  productoId: string | null
  /** Solo en los renglones sin asignar: el id del renglón del remito. */
  renglonId: string | null
  nombre: string
  textos: string[]
  unidadBase: string
  pedidoBase: number | null
  llegoBase: number | null
  precioBase: number | null
  precioAnterior: number | null
  variacionPct: number | null
  subtotal: number | null
  resultado: Resultado
  detalle: string
  /** Alguna unidad del remito no se pudo convertir: se tomó como unidad base. */
  unidadDudosa: boolean
}

export type Diferencia = {
  productoId: string | null
  tipo: 'faltante' | 'exceso' | 'precio'
  monto: number | null
  detalle: string
}

export type Conciliacion = {
  filas: Fila[]
  diferencias: Diferencia[]
  resumen: {
    correctos: number
    faltantes: number
    aumentos: number
    excesos: number
    noPedidos: number
    sinAsignar: number
  }
  estadoPedido: 'a_pagar' | 'revisar'
  totalRemito: number
  totalPedidoEstimado: number | null
}

/** Cuántas unidades base trae una unidad del remito: "kg" → 1, "caja" → 18, "g" con base kg → 0,001. */
export function factorDeUnidad(
  unidad: string | null,
  producto: ProductoConciliable,
): { factor: number; aproximada: boolean; dudosa: boolean } {
  const u = normalizarUnidad(unidad)
  const base = normalizarUnidad(producto.unidad.nombre)
  if (!u || u === base) return { factor: 1, aproximada: false, dudosa: false }
  const presentacion = producto.presentaciones.find((p) => normalizarUnidad(p.nombre) === u)
  if (presentacion)
    return {
      factor: presentacion.factor_a_base,
      aproximada: presentacion.aproximada,
      dudosa: false,
    }
  const conversiones: Record<string, number> = {
    'g>kg': 0.001,
    'kg>g': 1000,
    'ml>lt': 0.001,
    'lt>ml': 1000,
  }
  const factor = conversiones[`${u}>${base}`]
  if (factor) return { factor, aproximada: false, dudosa: false }
  return { factor: 1, aproximada: false, dudosa: true }
}

const redondear = (n: number, decimales = 4) => Math.round(n * 10 ** decimales) / 10 ** decimales

export function conciliar(datos: {
  productos: Map<string, ProductoConciliable>
  pedido: ItemPedido[] | null
  remito: RenglonRemito[]
  ajustes: Ajustes
  umbralProveedor: number | null
  /** false si las cuentas del remito no cierran (validarRemito): el pedido queda para revisar. */
  cuentasOk?: boolean
}): Conciliacion {
  const { productos, pedido, remito, ajustes } = datos
  const filas: Fila[] = []
  const diferencias: Diferencia[] = []

  // Lo pedido, en unidad base, por producto.
  const pedidoPor = new Map<
    string,
    { base: number; aproximada: boolean; estimado: number | null }
  >()
  for (const i of pedido ?? []) {
    const p = productos.get(i.producto_id)
    const presentacion = p?.presentaciones.find((x) => x.id === i.presentacion_id)
    const previo = pedidoPor.get(i.producto_id)
    pedidoPor.set(i.producto_id, {
      base: (previo?.base ?? 0) + cantidadBase(i.cantidad, presentacion?.factor_a_base ?? 1),
      aproximada: (previo?.aproximada ?? false) || !!presentacion?.aproximada,
      estimado: i.precio_estimado_base ?? previo?.estimado ?? null,
    })
  }

  // Lo que llegó, en unidad base, por producto (un producto puede venir en varios renglones).
  const llegoPor = new Map<
    string,
    {
      base: number
      plata: number
      conPrecio: number
      textos: string[]
      aproximada: boolean
      dudosa: boolean
      subtotal: number | null
    }
  >()
  const sinAsignar: RenglonRemito[] = []
  for (const r of remito) {
    const p = r.productoId ? productos.get(r.productoId) : undefined
    if (!p) {
      sinAsignar.push(r)
      continue
    }
    const { factor, aproximada, dudosa } = factorDeUnidad(r.unidad, p)
    const base = cantidadBase(r.cantidad ?? 0, factor)
    const acc = llegoPor.get(p.id) ?? {
      base: 0,
      plata: 0,
      conPrecio: 0,
      textos: [],
      aproximada: false,
      dudosa: false,
      subtotal: null,
    }
    acc.base += base
    // Precio por unidad base: del subtotal si está (incluye descuentos), si no del precio unitario.
    const plata =
      r.subtotal ??
      (r.precioUnit !== null && r.cantidad !== null ? r.precioUnit * r.cantidad : null)
    if (plata !== null && base > 0) {
      acc.plata += plata
      acc.conPrecio += base
    }
    if (r.subtotal !== null) acc.subtotal = (acc.subtotal ?? 0) + r.subtotal
    if (r.texto.trim()) acc.textos.push(r.texto.trim())
    acc.aproximada ||= aproximada
    acc.dudosa ||= dudosa
    llegoPor.set(p.id, acc)
  }

  const ids = [...new Set([...pedidoPor.keys(), ...llegoPor.keys()])]
  for (const id of ids) {
    const p = productos.get(id)
    if (!p) continue
    const pedidoItem = pedidoPor.get(id)
    const llego = llegoPor.get(id)
    const pedidoBase = pedidoItem ? redondear(pedidoItem.base) : null
    const llegoBase = llego ? redondear(llego.base) : 0
    const precioBase =
      llego && llego.conPrecio > 0 ? redondear(llego.plata / llego.conPrecio, 2) : null
    const cant = (n: number) => textoCantidad(n, p.unidad)
    const esPeso =
      p.unidad.tipo === 'peso' ||
      p.unidad.tipo === 'volumen' ||
      !!pedidoItem?.aproximada ||
      !!llego?.aproximada
    const tolerancia = esPeso ? ajustes.tolerancia_peso_pct : ajustes.tolerancia_unidad_pct

    const partes: string[] = []
    let resultado: Resultado = 'ok'

    // Cantidades
    if (pedido && pedidoBase === null) {
      resultado = 'no_pedido'
      partes.push('No estaba en el pedido')
    } else if (pedidoBase !== null) {
      const minimo = pedidoBase * (1 - tolerancia / 100)
      const maximo = pedidoBase * (1 + tolerancia / 100)
      if (llegoBase === 0) {
        resultado = 'faltante'
        partes.push('No vino en el remito')
      } else if (llegoBase < minimo - 1e-9) {
        resultado = 'faltante'
        partes.push(`Faltó: llegó ${cant(llegoBase)} de ${cant(pedidoBase)}`)
      } else if (llegoBase > maximo + 1e-9) {
        resultado = 'exceso'
        partes.push(`Llegó de más: ${cant(llegoBase)} de ${cant(pedidoBase)}`)
      } else if (Math.abs(llegoBase - pedidoBase) > 1e-9) {
        partes.push(
          `Correcto · dentro del ${numero(tolerancia)}% de tolerancia${esPeso ? ' en peso' : ''}`,
        )
      } else {
        partes.push('Correcto')
      }
      const precio = precioBase ?? p.precioAnterior ?? pedidoItem?.estimado ?? null
      if (resultado === 'faltante') {
        diferencias.push({
          productoId: id,
          tipo: 'faltante',
          monto: precio !== null ? Math.round((pedidoBase - llegoBase) * precio) : null,
          detalle:
            llegoBase === 0
              ? `No vino ${p.nombre} (${cant(pedidoBase)})`
              : `${pedidoBase - llegoBase === 1 ? 'Faltó' : 'Faltaron'} ${cant(redondear(pedidoBase - llegoBase))} de ${p.nombre}`,
        })
      }
      if (resultado === 'exceso') {
        diferencias.push({
          productoId: id,
          tipo: 'exceso',
          monto: precio !== null ? Math.round((llegoBase - pedidoBase) * precio) : null,
          detalle: `Llegaron ${cant(redondear(llegoBase - pedidoBase))} de más de ${p.nombre}`,
        })
      }
    } else {
      partes.push('Recibido')
    }

    // Precio contra el último pagado (umbral del producto, si no el del proveedor, si no el general).
    let variacionPct: number | null = null
    if (precioBase !== null && p.precioAnterior !== null && p.precioAnterior > 0) {
      variacionPct = redondear(((precioBase - p.precioAnterior) / p.precioAnterior) * 100, 1)
      const umbral = p.umbral ?? datos.umbralProveedor ?? ajustes.umbral_alerta_pct
      const antes = `antes ${pesos(p.precioAnterior)}/${p.unidad.nombre}`
      if (variacionPct > umbral) {
        // Si la cantidad estaba bien, lo que importa es el precio (como en el diseño).
        if (resultado === 'ok') {
          resultado = 'precio_subio'
          if (partes[0]?.startsWith('Correcto')) partes.shift()
        }
        partes.push(`Subió ${porcentaje(variacionPct).replace('+', '')} · ${antes}`)
        diferencias.push({
          productoId: id,
          tipo: 'precio',
          monto: Math.round((precioBase - p.precioAnterior) * llegoBase),
          detalle: `${p.nombre} subió ${porcentaje(variacionPct)}: de ${pesos(p.precioAnterior)} a ${pesos(precioBase)} por ${p.unidad.nombre}`,
        })
      } else if (variacionPct < -umbral) {
        partes.push(`Bajó ${porcentaje(-variacionPct).replace('+', '')} · ${antes}`)
        if (resultado === 'ok') resultado = 'precio_bajo'
      }
    }
    if (llego?.dudosa) partes.push('Revisá la unidad: no coincide con la del producto')

    filas.push({
      productoId: id,
      renglonId: null,
      nombre: p.nombre,
      textos: llego?.textos ?? [],
      unidadBase: p.unidad.nombre,
      pedidoBase,
      llegoBase: llego ? llegoBase : pedidoBase !== null ? 0 : null,
      precioBase,
      precioAnterior: p.precioAnterior,
      variacionPct,
      subtotal: llego?.subtotal ?? null,
      resultado,
      detalle: partes.join(' · '),
      unidadDudosa: !!llego?.dudosa,
    })
  }

  // Renglones del remito que no se pudieron asignar a un producto.
  for (const r of sinAsignar) {
    filas.push({
      productoId: null,
      renglonId: r.id,
      nombre: r.texto || 'Renglón sin nombre',
      textos: r.texto ? [r.texto] : [],
      unidadBase: r.unidad ?? '',
      pedidoBase: null,
      llegoBase: r.cantidad,
      precioBase: r.precioUnit,
      precioAnterior: null,
      variacionPct: null,
      subtotal: r.subtotal,
      resultado: 'no_pedido',
      detalle: 'Elegí a qué producto corresponde',
      unidadDudosa: false,
    })
  }

  const cuenta = (r: Resultado) => filas.filter((f) => f.productoId && f.resultado === r).length
  const resumen = {
    correctos: cuenta('ok') + cuenta('precio_bajo'),
    faltantes: cuenta('faltante'),
    aumentos: diferencias.filter((d) => d.tipo === 'precio').length,
    excesos: cuenta('exceso'),
    noPedidos: cuenta('no_pedido'),
    sinAsignar: sinAsignar.length,
  }
  const totalRemito = Math.round(remito.reduce((s, r) => s + (r.subtotal ?? 0), 0) * 100) / 100
  const estimados = [...pedidoPor.values()]
  const totalPedidoEstimado = pedido
    ? estimados.some((e) => e.estimado !== null)
      ? Math.round(estimados.reduce((s, e) => s + (e.estimado ?? 0) * e.base, 0))
      : null
    : null
  const revisar =
    diferencias.length > 0 ||
    sinAsignar.length > 0 ||
    resumen.noPedidos > 0 ||
    datos.cuentasOk === false

  return {
    filas,
    diferencias,
    resumen,
    estadoPedido: revisar ? 'revisar' : 'a_pagar',
    totalRemito,
    totalPedidoEstimado,
  }
}
