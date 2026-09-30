// Espejo exacto de privado.normalizar y privado.normalizar_unidad
// (supabase/migrations/20260930130000_catalogo.sql). Si se cambia una, cambiar la otra.

const SIN_TILDE: Record<string, string> = {
  Á: 'A',
  É: 'E',
  Í: 'I',
  Ó: 'O',
  Ú: 'U',
  Ü: 'U',
  á: 'a',
  é: 'e',
  í: 'i',
  ó: 'o',
  ú: 'u',
  ü: 'u',
}

/** Para comparar nombres: sin mayúsculas, tildes ni espacios de más. */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .replace(/[ÁÉÍÓÚÜáéíóúü]/g, (l) => SIN_TILDE[l] ?? l)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

const ALIAS: [string[], string][] = [
  [['u', 'un', 'unid', 'unidad', 'unidades'], 'unidad'],
  [['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos'], 'kg'],
  [['g', 'gr', 'grs', 'gramo', 'gramos'], 'g'],
  [['l', 'lt', 'lts', 'litro', 'litros'], 'lt'],
  [['ml', 'mililitro', 'mililitros'], 'ml'],
]

/** Unidades: además, sin distinguir plural ni abreviatura ("kilos" = "kg", "cajas" = "caja"). */
export function normalizarUnidad(texto: string | null | undefined): string {
  const v = normalizar(texto)
  for (const [variantes, unidad] of ALIAS) if (variantes.includes(v)) return unidad
  if (v.endsWith('ones') || v.endsWith('iles')) return v.slice(0, -2)
  if (v.length > 3 && v.endsWith('s') && !v.endsWith('ss')) return v.slice(0, -1)
  return v
}
