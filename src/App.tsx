import { Navigate, Route, Routes } from 'react-router'
import { Estructura } from './components/Estructura'
import { Inicio } from './pages/Inicio'
import { Pendiente } from './pages/Pendiente'

export function App() {
  return (
    <Routes>
      <Route element={<Estructura />}>
        <Route index element={<Inicio />} />
        <Route path="pedir" element={<Pendiente titulo="Nuevo pedido" etapa={3} />} />
        <Route path="recibir" element={<Pendiente titulo="Recibir mercadería" etapa={4} />} />
        <Route path="proveedores" element={<Pendiente titulo="Proveedores" etapa={2} />} />
        <Route path="precios" element={<Pendiente titulo="Precios" etapa={5} />} />
        <Route path="ajustes" element={<Pendiente titulo="Ajustes" etapa={2} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
