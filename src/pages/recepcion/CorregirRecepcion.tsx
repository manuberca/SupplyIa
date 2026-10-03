import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { linkDeFoto } from '../../admin/acciones'
import { EsperarCatalogo } from '../../catalogo/EsperarCatalogo'
import type { Catalogo } from '../../catalogo/tipos'
import { TituloPantalla } from '../../components/TituloPantalla'
import { reportar } from '../../lib/errores'
import { SIN_CONEXION } from '../../lib/errores-auth'
import { supabase } from '../../lib/supabase'
import type { EstadoPedido, Pedido } from '../../pedidos/tipos'
import { Recepcion, type RecepcionGuardada } from './NuevaRecepcion'

type Cargada = {
  proveedorId: string
  pedido: Pedido | null
  guardada: RecepcionGuardada
}

/** Trae la recepción con sus renglones y su pedido (aunque sea de otro local o de hace mucho). */
async function cargar(id: string): Promise<Cargada | { error: string }> {
  const { data, error } = await supabase
    .from('recepciones')
    .select(
      `id, proveedor_id, recibido_at, origen, nro_remito, total_remito, foto_path, lectura_ia,
       recepcion_items ( producto_id, texto_remito, cantidad_base, precio_unit_base, precio_anterior_base, subtotal ),
       pedidos ( id, numero, estado, local_id, proveedor_id, observaciones, creado_at,
                 pedido_items ( id, producto_id, presentacion_id, cantidad, precio_estimado_base ) )`,
    )
    .eq('id', id)
    .maybeSingle()
  if (error) {
    const sinRed = !navigator.onLine || /fetch/i.test(error.message)
    if (!sinRed) reportar(error, 'Cargar recepción para corregir')
    return { error: sinRed ? SIN_CONEXION : 'No pudimos cargar la recepción. Probá de nuevo.' }
  }
  if (!data) return { error: 'No encontramos esa recepción.' }

  const foto = data.foto_path ? await linkDeFoto(data.foto_path) : null
  // Lo que había leído la IA del pie de la boleta, para que el total siga cerrando.
  const totales = (
    data.lectura_ia as { totales?: { iva?: number | null; percepciones?: number | null } } | null
  )?.totales
  const p = data.pedidos
  return {
    proveedorId: data.proveedor_id,
    pedido: p
      ? {
          id: p.id,
          numero: p.numero,
          estado: p.estado as EstadoPedido,
          local_id: p.local_id,
          proveedor_id: p.proveedor_id,
          observaciones: p.observaciones,
          creado_at: p.creado_at,
          items: p.pedido_items,
          subida: null,
        }
      : null,
    guardada: {
      id: data.id,
      recibidoAt: data.recibido_at,
      origen: data.origen === 'ia' ? 'ia' : 'manual',
      nroRemito: data.nro_remito,
      total: data.total_remito,
      urlFoto: foto && 'url' in foto ? foto.url : null,
      impuestos: (totales?.iva ?? 0) + (totales?.percepciones ?? 0),
      renglones: data.recepcion_items.map((i) => ({
        id: crypto.randomUUID(),
        texto: i.texto_remito,
        productoId: i.producto_id,
        cantidad: i.cantidad_base,
        // Lo guardado ya está en la unidad base del producto.
        unidad: null,
        precioUnit: i.precio_unit_base,
        subtotal: i.subtotal,
      })),
      preciosAnteriores: new Map(
        data.recepcion_items.flatMap((i) =>
          i.producto_id ? [[i.producto_id, i.precio_anterior_base] as const] : [],
        ),
      ),
    },
  }
}

/** Corregir una recepción ya confirmada: la misma pantalla de revisión, con lo que quedó guardado. */
export function CorregirRecepcion() {
  const { recepcionId = '' } = useParams()
  const [cargada, setCargada] = useState<Cargada | { error: string } | null>(null)

  useEffect(() => {
    let vigente = true
    cargar(recepcionId).then((r) => {
      if (vigente) setCargada(r)
    })
    return () => {
      vigente = false
    }
  }, [recepcionId])

  if (!cargada) return <p className="texto-gris">Cargando la recepción…</p>
  if ('error' in cargada) return <NoSePuede mensaje={cargada.error} />
  return (
    <EsperarCatalogo>
      {(catalogo) => <Pantalla catalogo={catalogo} cargada={cargada} />}
    </EsperarCatalogo>
  )
}

function Pantalla({ catalogo, cargada }: { catalogo: Catalogo; cargada: Cargada }) {
  const proveedor = catalogo.proveedores.find((p) => p.id === cargada.proveedorId)
  if (!proveedor) return <NoSePuede mensaje="No encontramos el proveedor de esta recepción." />
  const estado = cargada.pedido?.estado
  if (estado === 'pagado' || estado === 'cancelado') {
    return (
      <NoSePuede
        mensaje={`El pedido ya está ${estado}: la recepción no se puede corregir.`}
        volver={`/pedidos/${cargada.pedido!.id}`}
      />
    )
  }
  return (
    <Recepcion
      key={cargada.guardada.id}
      catalogo={catalogo}
      proveedor={proveedor}
      pedido={cargada.pedido}
      corrigiendo={cargada.guardada}
    />
  )
}

function NoSePuede({ mensaje, volver = '/' }: { mensaje: string; volver?: string }) {
  return (
    <>
      <TituloPantalla titulo="Corregir recepción" volver={volver} />
      <p className="aviso aviso--atencion" role="alert">
        {mensaje}
      </p>
      <Link to={volver} className="boton boton--secundario">
        Volver
      </Link>
    </>
  )
}
