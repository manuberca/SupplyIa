import type { Lectura, SalidaModelo } from './lectura'
import { validarRemito } from './validar'

/** De la salida del modelo a la lectura que usa la app: ids de producto reales y cuentas controladas. */
export function armarLectura(salida: SalidaModelo, idPorRef: Map<string, string>): Lectura {
  const validacion = validarRemito(
    salida.items.map((i) => ({
      texto: i.texto_remito,
      cantidad: i.cantidad,
      unidad: i.unidad,
      precioUnit: i.precio_unit,
      descuentoLinea: i.descuento_linea,
      subtotal: i.subtotal,
      confianza: i.confianza,
      observacion: i.observacion,
    })),
    {
      subtotalNeto: salida.subtotal_neto,
      descuentoGlobal: salida.descuento_global,
      iva: salida.iva,
      percepciones: salida.percepciones,
      total: salida.total,
    },
  )
  return {
    giro: Number(salida.giro) as Lectura['giro'],
    nroRemito: salida.nro_remito?.trim() || null,
    fecha: salida.fecha,
    proveedorDetectado: salida.proveedor_detectado,
    totales: {
      subtotalNeto: salida.subtotal_neto,
      descuentoGlobal: salida.descuento_global,
      iva: salida.iva,
      percepciones: salida.percepciones,
      total: salida.total,
    },
    lineas: validacion.lineas.map((l, i) => ({
      texto: l.texto,
      // Un código que no está en el catálogo (inventado) queda sin asignar.
      productoId: idPorRef.get(salida.items[i]?.producto_ref ?? '') ?? null,
      cantidad: l.cantidad,
      unidad: l.unidad,
      precioUnit: l.precioUnit,
      descuentoLinea: l.descuentoLinea,
      subtotal: l.subtotal,
      confianza: l.confianza,
      observacion: l.observacion,
      esPromo: l.esPromo,
    })),
    validacion: { estado: validacion.estado, observaciones: validacion.observaciones },
    observaciones: salida.observaciones,
  }
}
