// Contraseña provisoria para quien se suma al equipo: la genera el servidor, se muestra una sola
// vez y la persona la cambia después. Sin letras ni números que se confundan al dictarla o
// copiarla (i, l, o, 0, 1), en tres grupos: "k7mq-p9xw-4hnd".

const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789'
export const LARGO_MINIMO_CLAVE = 8

export function generarClave(): string {
  const letras: string[] = []
  while (letras.length < 12) {
    const [byte] = crypto.getRandomValues(new Uint8Array(1))
    // Se descartan los valores que harían que unas letras salgan más que otras.
    if (byte! < 248) letras.push(ALFABETO[byte! % ALFABETO.length]!)
  }
  return [0, 4, 8].map((i) => letras.slice(i, i + 4).join('')).join('-')
}
