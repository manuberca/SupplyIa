import { Navigate, Outlet, Route, Routes } from 'react-router'
import { Estructura } from './components/Estructura'
import { PantallaEstado } from './components/PantallaEstado'
import { Protegida } from './components/Protegida'
import { CatalogoProvider } from './catalogo/CatalogoProvider'
import { ColaProvider } from './offline/ColaProvider'
import { PedidosProvider } from './pedidos/PedidosProvider'
import { ControlProvider } from './control/ControlProvider'
import { Precios } from './pages/precios/Precios'
import { DetallePedido } from './pages/pedidos/DetallePedido'
import { ElegirProveedor } from './pages/pedidos/ElegirProveedor'
import { NuevoPedido } from './pages/pedidos/NuevoPedido'
import { Pedidos } from './pages/pedidos/Pedidos'
import { NuevaRecepcion } from './pages/recepcion/NuevaRecepcion'
import { Recibir } from './pages/recepcion/Recibir'
import { Admin } from './pages/admin/Admin'
import { Resumen } from './pages/admin/Resumen'
import {
  PagosPanel,
  PedidosPanel,
  PreciosPanel,
  ProveedoresPanel,
  RecepcionesPanel,
} from './pages/admin/Secciones'
import { Ajustes } from './pages/Ajustes'
import { Inicio } from './pages/Inicio'
import { Instalar } from './pages/Instalar'
import { Login } from './pages/Login'
import { FichaProveedor } from './pages/proveedores/FichaProveedor'
import { FormProducto } from './pages/proveedores/FormProducto'
import { FormProveedor } from './pages/proveedores/FormProveedor'
import { Importar } from './pages/proveedores/Importar'
import { Proveedores } from './pages/proveedores/Proveedores'
import { useSesion } from './sesion/contexto'

export function App() {
  const { sesion, salir, reintentar } = useSesion()

  switch (sesion.estado) {
    case 'cargando':
      return <PantallaEstado titulo="Cargando…" cargando />
    case 'sin_sesion':
      return <Login />
    case 'error':
      return (
        <PantallaEstado titulo="No pudimos entrar">
          <p className="aviso aviso--error" role="alert">
            {sesion.mensaje}
          </p>
          <button className="boton boton--primario" onClick={reintentar}>
            Probar de nuevo
          </button>
          <button className="boton boton--texto" onClick={salir}>
            Cerrar sesión
          </button>
        </PantallaEstado>
      )
    case 'sin_membresia':
      return (
        <PantallaEstado titulo="Todavía no tenés acceso">
          <p className="formulario__ayuda">
            Entraste como <strong>{sesion.email}</strong>, pero ese usuario no está en ningún bar.
            Pedile a quien administra tu bar que te invite.
          </p>
          <button className="boton boton--secundario" onClick={salir}>
            Entrar con otro mail
          </button>
        </PantallaEstado>
      )
    case 'lista':
      return (
        <CatalogoProvider>
          <ColaProvider>
            <PedidosProvider>
              <ControlProvider>
                <Routes>
                  {/* Panel de escritorio: sin la barra de abajo, con su propio menú. */}
                  <Route
                    path="admin"
                    element={
                      <Protegida seccion="ajustes_org">
                        <Admin />
                      </Protegida>
                    }
                  >
                    <Route index element={<Resumen />} />
                    <Route path="pedidos" element={<PedidosPanel />} />
                    <Route path="recepciones" element={<RecepcionesPanel />} />
                    <Route path="proveedores" element={<ProveedoresPanel />} />
                    <Route path="precios" element={<PreciosPanel />} />
                    <Route path="pagos" element={<PagosPanel />} />
                  </Route>
                  <Route element={<Estructura />}>
                    <Route index element={<Inicio />} />
                    <Route
                      path="pedir"
                      element={
                        <Protegida seccion="pedir">
                          <Outlet />
                        </Protegida>
                      }
                    >
                      <Route index element={<ElegirProveedor />} />
                      <Route path=":proveedorId" element={<NuevoPedido />} />
                    </Route>
                    <Route path="pedidos" element={<Pedidos />} />
                    <Route path="pedidos/:id" element={<DetallePedido />} />
                    <Route path="recibir" element={<Recibir />} />
                    <Route path="recibir/pedido/:pedidoId" element={<NuevaRecepcion />} />
                    <Route path="recibir/proveedor/:proveedorId" element={<NuevaRecepcion />} />
                    <Route
                      path="proveedores"
                      element={
                        <Protegida seccion="proveedores">
                          <Outlet />
                        </Protegida>
                      }
                    >
                      <Route index element={<Proveedores />} />
                      <Route path="nuevo" element={<FormProveedor />} />
                      <Route path="importar" element={<Importar />} />
                      <Route path=":id" element={<FichaProveedor />} />
                      <Route path=":id/editar" element={<FormProveedor />} />
                      <Route path=":id/productos/nuevo" element={<FormProducto />} />
                      <Route path=":id/productos/:productoId" element={<FormProducto />} />
                    </Route>
                    <Route
                      path="precios"
                      element={
                        <Protegida seccion="precios">
                          <Precios />
                        </Protegida>
                      }
                    />
                    <Route path="ajustes" element={<Ajustes />} />
                    <Route path="instalar" element={<Instalar />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
              </ControlProvider>
            </PedidosProvider>
          </ColaProvider>
        </CatalogoProvider>
      )
  }
}
