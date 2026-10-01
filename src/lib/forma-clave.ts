// Describe una clave SIN mostrarla: sirve para saber qué se pegó mal en el panel de Netlify.
// De un JWT de Supabase se puede leer, sin secreto alguno, de qué proyecto y de qué rol es
// (eso va en la parte del medio, que no es la firma).

export type FormaClave = {
  largo: number
  formato: 'jwt' | 'sb_secret' | 'sb_publishable' | 'anthropic' | 'otro' | 'vacía'
  /** Solo en JWT de Supabase: rol (anon / service_role) y proyecto. */
  rol?: string
  proyecto?: string
}

export function formaDeClave(valor: string): FormaClave {
  const largo = valor.length
  if (!largo) return { largo, formato: 'vacía' }
  if (valor.startsWith('sb_secret_')) return { largo, formato: 'sb_secret' }
  if (valor.startsWith('sb_publishable_')) return { largo, formato: 'sb_publishable' }
  if (valor.startsWith('sk-ant-')) return { largo, formato: 'anthropic' }
  const partes = valor.split('.')
  if (partes.length === 3 && valor.startsWith('eyJ')) {
    try {
      const medio = partes[1]!.replace(/-/g, '+').replace(/_/g, '/')
      const datos = JSON.parse(atob(medio)) as { role?: unknown; ref?: unknown }
      return {
        largo,
        formato: 'jwt',
        rol: typeof datos.role === 'string' ? datos.role : undefined,
        proyecto: typeof datos.ref === 'string' ? datos.ref : undefined,
      }
    } catch {
      return { largo, formato: 'otro' }
    }
  }
  return { largo, formato: 'otro' }
}
