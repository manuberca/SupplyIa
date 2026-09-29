// Datos de prueba compartidos entre el script de carga y los tests de la base.
// Ids fijos para que cargar dos veces no duplique nada.

export const ORGS = {
  a: { id: 'a0000000-0000-4000-8000-000000000001', nombre: 'Bar Prueba A' },
  b: { id: 'b0000000-0000-4000-8000-000000000001', nombre: 'Bar Prueba B' },
} as const

export const LOCALES = {
  aCentro: { id: 'a0000000-0000-4000-8000-0000000000c1', org_id: ORGS.a.id, nombre: 'Centro' },
  aPichincha: { id: 'a0000000-0000-4000-8000-0000000000c2', org_id: ORGS.a.id, nombre: 'Pichincha' },
  bUnico: { id: 'b0000000-0000-4000-8000-0000000000c1', org_id: ORGS.b.id, nombre: 'Único' },
} as const

type Rol = 'admin' | 'encargado' | 'recepcion'

export const USUARIOS: {
  clave: 'adminA' | 'encargadoA' | 'recepcionA' | 'adminB'
  email: string
  nombre: string
  org_id: string
  rol: Rol
  locales: string[] | null
}[] = [
  { clave: 'adminA', email: 'admin-a@supplyia.test', nombre: 'Ana (admin A)', org_id: ORGS.a.id, rol: 'admin', locales: null },
  { clave: 'encargadoA', email: 'encargado-a@supplyia.test', nombre: 'Elio (encargado A)', org_id: ORGS.a.id, rol: 'encargado', locales: null },
  { clave: 'recepcionA', email: 'recepcion-a@supplyia.test', nombre: 'Rita (recepción A)', org_id: ORGS.a.id, rol: 'recepcion', locales: [LOCALES.aPichincha.id] },
  { clave: 'adminB', email: 'admin-b@supplyia.test', nombre: 'Beto (admin B)', org_id: ORGS.b.id, rol: 'admin', locales: null },
]
