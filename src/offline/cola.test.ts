import { describe, expect, it } from 'vitest'
import { procesarCola, type Operacion, type ResultadoEnvio } from './cola'

const op = (id: string, error: string | null = null): Operacion => ({
  id,
  tipo: 'crear_pedido',
  datos: {
    id,
    local_id: 'l',
    proveedor_id: 'p',
    observaciones: '',
    creado_at: '2026-09-30T10:00:00Z',
    enviado_at: '2026-09-30T10:00:00Z',
    items: [],
  },
  creada: '2026-09-30T10:00:00Z',
  intentos: 0,
  error,
})

function enviarCon(respuestas: Record<string, ResultadoEnvio>) {
  const enviadas: string[] = []
  const enviar = async (o: Operacion) => {
    enviadas.push(o.id)
    return respuestas[o.id] ?? { ok: true as const }
  }
  return { enviar, enviadas }
}

describe('procesarCola', () => {
  it('sube todas cuando hay señal', async () => {
    const { enviar } = enviarCon({})
    const r = await procesarCola([op('a'), op('b')], enviar)
    expect(r.subidas.map((o) => o.id)).toEqual(['a', 'b'])
    expect(r.restantes).toEqual([])
  })

  it('sin señal deja esa y las siguientes para después, sin intentarlas', async () => {
    const { enviar, enviadas } = enviarCon({ b: { ok: false, reintentar: true } })
    const r = await procesarCola([op('a'), op('b'), op('c')], enviar)
    expect(enviadas).toEqual(['a', 'b'])
    expect(r.subidas.map((o) => o.id)).toEqual(['a'])
    expect(r.restantes.map((o) => [o.id, o.intentos, o.error])).toEqual([
      ['b', 1, null],
      ['c', 0, null],
    ])
  })

  it('si la base rechaza una, la marca con el error y sigue con las demás', async () => {
    const { enviar } = enviarCon({
      a: { ok: false, reintentar: false, mensaje: 'Proveedor archivado' },
    })
    const r = await procesarCola([op('a'), op('b')], enviar)
    expect(r.subidas.map((o) => o.id)).toEqual(['b'])
    expect(r.restantes).toMatchObject([{ id: 'a', error: 'Proveedor archivado', intentos: 1 }])
  })

  it('las que ya tienen error no se reintentan solas', async () => {
    const { enviar, enviadas } = enviarCon({})
    const r = await procesarCola([op('a', 'Algo falló')], enviar)
    expect(enviadas).toEqual([])
    expect(r.restantes).toHaveLength(1)
  })
})
