# Progreso

Se actualiza al terminar cada paso, así cualquier computadora sabe dónde seguir.

## Etapa 1 — Base (en curso)

- [x] 1. Esqueleto: Vite + React + TS estricto, ESLint, Prettier, `.nvmrc` (Node 24), `.gitattributes`
- [x] 2. Diseño base: tokens, tipografías, encabezado, barra inferior, pantallas vacías, formato argentino con tests
- [x] 3. PWA: manifest e íconos (provisorios, desde `public/icono.svg`)
- [x] Repo en GitHub (github.com/manuberca/SupplyIa) y primer push
- [x] 4. Supabase dev: vinculado, migración `base` aplicada y datos de prueba (`npm run db:datos-prueba`): Bar Prueba A (2 locales, admin/encargado/recepción) y Bar Prueba B (1 local, admin). El proyecto prod se crea antes del deploy.
- [x] 5. Login con contraseña o código por mail (sin altas abiertas: `shouldCreateUser: false`), sesión con organización, rol y locales, selector de local (se recuerda por dispositivo), barra y rutas según el rol. Probado en el navegador con recepción y admin. Pendiente en el panel de Supabase: URL del sitio, cortar altas abiertas y poner el código en el mail.
- [ ] 6. Sentry
- [~] 7. Tests: aislamiento entre organizaciones y permisos por rol ✅ (`npm run test:db`, 12 tests contra dev). Falta el flujo de login con Playwright (después del paso 5).
- [ ] 8. Deploy a Netlify (confirmar antes)

**Listo cuando:** dos organizaciones de prueba no ven los datos de la otra.

## Decisiones

- Dos proyectos de Supabase en la nube (`supplyia-dev` y `supplyia-prod`) en lugar de Supabase local, porque no hay Docker.
- Formato argentino de números armado a mano (`src/lib/formato.ts`) y no con `Intl`, porque algunos navegadores no agrupan los miles de 4 cifras.
- `.env.local` necesita también `SUPABASE_SERVICE_ROLE_KEY` y `DEV_TEST_PASSWORD`. Guardalos en el gestor de contraseñas y usá los mismos en las dos computadoras (si se corre `db:datos-prueba` sin `DEV_TEST_PASSWORD`, genera una nueva y la otra computadora queda desfasada).
- Supabase dev: `supplyia-dev` (ref `efyulrowgyrxqubjelor`, São Paulo). En cada computadora: `npm run db:login` y `npm run db:link -- efyulrowgyrxqubjelor` (en Windows con PowerShell, usar `npm.cmd`).
- Altas de miembros solo por invitación desde el servidor (no desde la app), para que nadie sume a su organización a un usuario cualquiera.
