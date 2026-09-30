import { revisarConfig } from './config'

const resultado = revisarConfig(import.meta.env)

if (!resultado.ok) {
  // main.tsx revisa la configuración antes de cargar la app y muestra qué falta;
  // esto solo salta si algún módulo se importa por otro camino.
  throw new Error('Configuración incompleta: ' + resultado.faltantes.join(' · '))
}

export const env = resultado.config
