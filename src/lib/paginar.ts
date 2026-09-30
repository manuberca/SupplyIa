// Supabase devuelve como máximo 1.000 filas por consulta (max_rows). Para historiales y catálogos
// grandes hay que pedir de a páginas; si no, se calcula con datos incompletos sin darse cuenta.

const PAGINA = 1000

type Respuesta<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** Trae todas las filas pidiendo de a páginas. `consulta(desde, hasta)` tiene que ordenar siempre igual. */
export async function todasLasFilas<T>(
  consulta: (desde: number, hasta: number) => Respuesta<T>,
  maximo = 50_000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const filas: T[] = []
  for (let desde = 0; desde < maximo; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1)
    if (error) return { data: filas, error }
    filas.push(...(data ?? []))
    if (!data || data.length < PAGINA) break
  }
  return { data: filas, error: null }
}
