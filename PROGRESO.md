# Progreso

Se actualiza al terminar cada paso, así cualquier computadora sabe dónde seguir.

## Etapa 1 — Base (en curso)

- [x] 1. Esqueleto: Vite + React + TS estricto, ESLint, Prettier, `.nvmrc` (Node 24), `.gitattributes`
- [x] 2. Diseño base: tokens, tipografías, encabezado, barra inferior, pantallas vacías, formato argentino con tests
- [x] 3. PWA: manifest e íconos (provisorios, desde `public/icono.svg`)
- [x] Repo en GitHub (github.com/manuberca/SupplyIa) y primer push
- [~] 4. Supabase: proyecto dev creado, vinculado y con la migración aplicada. Falta: seed con dos organizaciones de prueba. El proyecto prod se crea antes del deploy. Migración `0001_base.sql` (organizaciones, locales, miembros, ajustes + RLS), seed con dos organizaciones de prueba
- [ ] 5. Login (enlace mágico y contraseña), sesión con organización, rol y locales, rutas por rol
- [ ] 6. Sentry
- [ ] 7. Tests: aislamiento entre organizaciones (Vitest contra dev) y flujo de login (Playwright)
- [ ] 8. Deploy a Netlify (confirmar antes)

**Listo cuando:** dos organizaciones de prueba no ven los datos de la otra.

## Decisiones

- Dos proyectos de Supabase en la nube (`supplyia-dev` y `supplyia-prod`) en lugar de Supabase local, porque no hay Docker.
- Formato argentino de números armado a mano (`src/lib/formato.ts`) y no con `Intl`, porque algunos navegadores no agrupan los miles de 4 cifras.
- Supabase dev: `supplyia-dev` (ref `efyulrowgyrxqubjelor`, São Paulo). En cada computadora: `npm run db:login` y `npm run db:link -- efyulrowgyrxqubjelor` (en Windows con PowerShell, usar `npm.cmd`).
- Altas de miembros solo por invitación desde el servidor (no desde la app), para que nadie sume a su organización a un usuario cualquiera.
