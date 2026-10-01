// Las claves se pegan a mano en el panel de Netlify, y es fácil que queden con algo de más: un
// salto de línea, espacios, comillas, el renglón entero ("NOMBRE=valor") o varios renglones del
// archivo. Con eso la clave no sirve, o ni siquiera se puede mandar (un salto de línea en el medio
// hace que el pedido no salga). Acá se limpia lo que sin dudas no es parte de la clave.

export function limpiarSecreto(
  nombre: string,
  crudo: string | undefined,
): { valor: string; corregido: boolean } {
  const original = crudo ?? ''
  const renglones = original
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean)
  // Si pegaron renglones del archivo, el que vale es el de esta clave: NOMBRE=valor
  const propio = renglones.find((r) => r.startsWith(`${nombre}=`))
  // Si no, lo pegado es la clave (partida en renglones, si vino así).
  let valor = propio ? propio.slice(nombre.length + 1) : renglones.join('')
  // Comillas alrededor, y espacios que hayan quedado: una clave nunca los lleva.
  valor = valor
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, '')
  return { valor, corregido: valor !== original }
}
