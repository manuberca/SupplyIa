import { describe, expect, it } from 'vitest'
import { ERROR_DB_DESCONOCIDO, SIN_PERMISO, esReintentoDeAlta, mensajeErrorDb } from './errores-db'
import { SIN_CONEXION } from './errores-auth'

const repetido = (indice: string) => ({
  code: '23505',
  message: `duplicate key value violates unique constraint "${indice}"`,
})

describe('mensajeErrorDb', () => {
  it('explica cada repetido', () => {
    expect(mensajeErrorDb(repetido('proveedores_nombre_unico'))).toMatch(
      /Ya hay un proveedor con ese nombre/,
    )
    expect(mensajeErrorDb(repetido('proveedores_whatsapp_unico'))).toMatch(/WhatsApp ya lo tiene/)
    expect(mensajeErrorDb(repetido('unidades_nombre_unico'))).toMatch(
      /"cajas" es lo mismo que "caja"/,
    )
  })

  it('muestra tal cual las reglas de la base escritas en castellano', () => {
    const e = {
      code: '23514',
      message: 'La unidad "kg" la usan: Papa. Cambiales la unidad antes de archivarla.',
    }
    expect(mensajeErrorDb(e)).toBe(e.message)
  })

  it('no muestra los mensajes técnicos en inglés', () => {
    const e = {
      code: '23514',
      message: 'new row for relation "proveedores" violates check constraint "x"',
    }
    expect(mensajeErrorDb(e)).toMatch(/Algún dato no es válido/)
  })

  it('permisos, conexión y lo desconocido', () => {
    expect(mensajeErrorDb({ code: '42501', message: 'permission denied' })).toBe(SIN_PERMISO)
    expect(mensajeErrorDb({ message: 'TypeError: Failed to fetch' })).toBe(SIN_CONEXION)
    expect(mensajeErrorDb({ code: 'XX000', message: 'raro' })).toBe(ERROR_DB_DESCONOCIDO)
    expect(mensajeErrorDb(null)).toBe('')
  })

  it('reconoce un reintento de un alta que ya había entrado', () => {
    expect(esReintentoDeAlta(repetido('proveedores_pkey'))).toBe(true)
    expect(esReintentoDeAlta(repetido('proveedores_nombre_unico'))).toBe(false)
  })
})
