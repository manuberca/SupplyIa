# SupplyIA

App web (PWA) de compras y recepción de mercadería para gastronómicos. La especificación completa está en `SPEC.md`; leela antes de cada etapa. Las pantallas de referencia están en `diseno/`.

## Cómo trabajar

- Construí por las etapas de `SPEC.md` §12, en orden. No arranques una etapa sin que la anterior esté probada.
- Antes de escribir código de una etapa, proponé un plan corto y esperá mi OK.
- Pedime confirmación antes de: deployar a producción, correr migraciones contra la base de producción, o cualquier cosa que borre datos.
- Cada deploy de Netlify consume créditos del mes: agrupá cambios y probá todo en local antes de subir.
- Nunca modifiques la carpeta de la app de La Bodeguita (`labode-nueva`). Es la que usa el bar hoy. Solo se lee como referencia.
- SupplyIA es un proyecto personal: todas sus cuentas y gastos (Anthropic, Supabase, Netlify, Sentry, GitHub) son de Manu, con su mail personal. Nunca usar cuentas, claves ni créditos de La Bodeguita, y nunca gastar desde ahí. De La Bodeguita solo se leen datos (proveedores, boletas) con las consultas de lectura de su app.
- Textos de la app en castellano rioplatense ("Elegí", "Sacá la foto"), claros y cortos. Números en formato argentino.

## Comandos

- `npm install` — dependencias
- `npm run dev` — app en local
- `npm test` — tests unitarios (Vitest)
- `npm run e2e` — tests de flujos (Playwright)
- `netlify dev` — app + funciones en local
- `npx supabase db push` — aplicar migraciones (confirmar antes si es producción)

## Reglas del código

- TypeScript estricto. Validación con zod en cliente y funciones.
- Colores y tipografías solo desde los tokens de `src/styles/tokens.css` (copiados de `SPEC.md` §4).
- Secretos solo en variables de entorno. `.env.local` nunca va a git.
- Toda escritura a la base pasa por la cola sin conexión (§8) con UUID generado en el cliente.
- Ningún error silencioso: se muestra al usuario con qué hacer, o se reporta a Sentry.

## Dos computadoras (Mac y Windows)

- El código vive en GitHub; en cada máquina: `git pull` al empezar, `git push` al terminar.
- `.gitattributes` con `* text=auto eol=lf` para que Windows no cambie los finales de línea.
- Misma versión de Node en ambas (ver `.nvmrc`).
- Usá scripts de npm, no comandos de shell que solo existan en Mac o solo en Windows.
