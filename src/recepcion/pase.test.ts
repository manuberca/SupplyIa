import { describe, expect, it } from 'vitest'
import { abrirPase, firmarPase, type Pase } from './pase'

const pase: Pase = {
  org: 'org-1',
  proveedor: 'prov-1',
  desde: 38,
  ultimo: '"AÑEJO PATRÓN 750" · cantidad 6',
  usadas: 12,
  tope: 300,
  vuelta: 1,
  vence: 2_000,
}

describe('pase para seguir una boleta larga', () => {
  it('se abre con la misma clave y trae lo que se firmó (con eñes y acentos)', async () => {
    const texto = await firmarPase('clave-del-servidor', pase)
    expect(await abrirPase('clave-del-servidor', texto, 1_000)).toEqual(pase)
  })

  it('vencido, con otra clave o tocado, no vale', async () => {
    const texto = await firmarPase('clave-del-servidor', pase)
    expect(await abrirPase('clave-del-servidor', texto, 2_001)).toBeNull()
    expect(await abrirPase('otra-clave', texto, 1_000)).toBeNull()
    // Alguien cambia el contenido (para no contar en el tope) y deja la firma vieja.
    const [, firma] = texto.split('.')
    const trucho = btoa(JSON.stringify({ ...pase, desde: 0 })).replace(/=+$/, '')
    expect(await abrirPase('clave-del-servidor', `${trucho}.${firma}`, 1_000)).toBeNull()
    for (const basura of ['', 'a', 'a.b', 'a.b.c', '###.###']) {
      expect(await abrirPase('clave-del-servidor', basura, 1_000)).toBeNull()
    }
  })
})
