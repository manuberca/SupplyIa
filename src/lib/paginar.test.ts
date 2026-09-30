import { describe, expect, it } from 'vitest'
import { todasLasFilas } from './paginar'

describe('todasLasFilas', () => {
  const base = Array.from({ length: 2345 }, (_, i) => i)
  const consulta = (desde: number, hasta: number) =>
    Promise.resolve({ data: base.slice(desde, hasta + 1), error: null })

  it('junta todas las páginas', async () => {
    const r = await todasLasFilas(consulta)
    expect(r.data).toHaveLength(2345)
    expect(r.data.at(-1)).toBe(2344)
  })

  it('corta en el primer error y lo devuelve, con lo que había juntado', async () => {
    let vez = 0
    const llena = Array.from({ length: 1000 }, (_, i) => i)
    const r = await todasLasFilas(() =>
      Promise.resolve(
        vez++ === 0
          ? { data: llena, error: null }
          : { data: null, error: { message: 'sin señal' } },
      ),
    )
    expect(r.data).toHaveLength(1000)
    expect(r.error).toEqual({ message: 'sin señal' })
  })
})
