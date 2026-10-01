// La foto del remito se achica en el celular antes de mandarla (SPEC §7.5): lado largo de
// 1600 px en JPEG al 80 %. Pesa ~10 veces menos y la lectura entra en el tiempo de Netlify.

const LADO_LARGO = 1600
const CALIDAD = 0.8

export type FotoLista = { blob: Blob; base64: string; tipo: 'image/jpeg' }

export async function comprimirFoto(archivo: Blob): Promise<FotoLista> {
  // createImageBitmap ya endereza las fotos según cómo se sacó (EXIF).
  const imagen = await createImageBitmap(archivo)
  const escala = Math.min(1, LADO_LARGO / Math.max(imagen.width, imagen.height))
  const ancho = Math.round(imagen.width * escala)
  const alto = Math.round(imagen.height * escala)
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('El navegador no permite procesar la foto')
  ctx.drawImage(imagen, 0, 0, ancho, alto)
  imagen.close()
  return exportar(lienzo)
}

async function exportar(lienzo: HTMLCanvasElement): Promise<FotoLista> {
  const blob = await new Promise<Blob>((resolver, rechazar) =>
    lienzo.toBlob(
      (b) => (b ? resolver(b) : rechazar(new Error('No se pudo comprimir la foto'))),
      'image/jpeg',
      CALIDAD,
    ),
  )
  const base64 = await new Promise<string>((resolver, rechazar) => {
    const lector = new FileReader()
    lector.onload = () => resolver(String(lector.result).split(',')[1] ?? '')
    lector.onerror = () => rechazar(lector.error)
    lector.readAsDataURL(blob)
  })
  return { blob, base64, tipo: 'image/jpeg' }
}

/** La misma foto, girada en sentido horario (para enderezar una boleta sacada de costado). */
export async function girarFoto(foto: FotoLista, grados: 90 | 180 | 270): Promise<FotoLista> {
  const imagen = await createImageBitmap(foto.blob)
  const deCostado = grados !== 180
  const lienzo = document.createElement('canvas')
  lienzo.width = deCostado ? imagen.height : imagen.width
  lienzo.height = deCostado ? imagen.width : imagen.height
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('El navegador no permite procesar la foto')
  ctx.translate(lienzo.width / 2, lienzo.height / 2)
  ctx.rotate((grados * Math.PI) / 180)
  ctx.drawImage(imagen, -imagen.width / 2, -imagen.height / 2)
  imagen.close()
  return exportar(lienzo)
}
