import { Link, useLocation } from 'react-router'
import { cambiosDePrecio, comprasPorProveedor, resumen } from '../../admin/resumen'
import { pesos } from '../../lib/formato'
import { usePanel } from './contexto'
import { Barras, Diferencias, TablaCambios } from './partes'

export function Resumen() {
  const { datos, periodo, proveedor } = usePanel()
  const { search } = useLocation()
  const r = resumen(datos.recepciones, datos.pedidos)
  const cambios = cambiosDePrecio(datos.precios, periodo.desde, periodo.hasta)
  const compras = comprasPorProveedor(datos.recepciones)

  return (
    <>
      <div className="kpis">
        <Kpi
          titulo="Compras del período"
          valor={pesos(r.compras)}
          detalle={`${r.proveedores} ${r.proveedores === 1 ? 'proveedor' : 'proveedores'}`}
        />
        <Kpi titulo="Pedidos" valor={String(r.pedidos)} detalle={`${r.enCamino} en camino`} />
        <Kpi
          titulo="Cumplimiento promedio"
          valor={r.cumplimiento === null ? '—' : `${r.cumplimiento}%`}
          detalle="pedido contra recibido"
        />
        <Kpi
          titulo="Diferencias detectadas"
          valor={pesos(r.diferencias)}
          detalle={`en ${r.recepcionesConDiferencias} ${r.recepcionesConDiferencias === 1 ? 'recepción' : 'recepciones'}`}
          aviso={r.diferencias > 0}
        />
      </div>

      <div className="panel__columnas">
        <section className="bloque">
          <header className="bloque__encabezado">
            <h2>Cambios de precio por proveedor</h2>
            <span>
              {cambios.length} {cambios.length === 1 ? 'cambio' : 'cambios'}
            </span>
          </header>
          <TablaCambios cambios={cambios.slice(0, 10)} />
          {cambios.length > 10 && (
            <Link className="bloque__pie" to={{ pathname: '/admin/precios', search }}>
              Ver los {cambios.length} cambios
            </Link>
          )}
        </section>

        <section className="bloque">
          <header className="bloque__encabezado">
            <h2>Diferencias en recepción</h2>
            <span>pedido contra remito</span>
          </header>
          <Diferencias
            recepciones={datos.recepciones.filter((x) => x.diferencias.length > 0)}
            limite={6}
          />
        </section>
      </div>

      <section className="bloque">
        <header className="bloque__encabezado">
          <h2>Compras por proveedor</h2>
          <span>{periodo.nombre}</span>
        </header>
        <Barras
          filas={compras.slice(0, 10).map((c) => ({
            clave: c.proveedor_id,
            texto: proveedor(c.proveedor_id),
            valor: c.monto,
          }))}
        />
      </section>
    </>
  )
}

function Kpi({
  titulo,
  valor,
  detalle,
  aviso,
}: {
  titulo: string
  valor: string
  detalle: string
  aviso?: boolean
}) {
  return (
    <div className="kpi">
      <span className="kpi__titulo">{titulo}</span>
      <strong className={aviso ? 'kpi__valor kpi__valor--aviso' : 'kpi__valor'}>{valor}</strong>
      <span className="kpi__detalle">{detalle}</span>
    </div>
  )
}
