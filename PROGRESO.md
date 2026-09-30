# Progreso

Se actualiza al terminar cada paso, así cualquier computadora sabe dónde seguir.

## Etapa 1 — Base (en curso)

- [x] 1. Esqueleto: Vite + React + TS estricto, ESLint, Prettier, `.nvmrc` (Node 24), `.gitattributes`
- [x] 2. Diseño base: tokens, tipografías, encabezado, barra inferior, pantallas vacías, formato argentino con tests
- [x] 3. PWA: manifest e íconos (provisorios, desde `public/icono.svg`)
- [x] Repo en GitHub (github.com/manuberca/SupplyIa) y primer push
- [x] 4. Supabase dev: vinculado, migración `base` aplicada y datos de prueba (`npm run db:datos-prueba`): Bar Prueba A (2 locales, admin/encargado/recepción) y Bar Prueba B (1 local, admin). El proyecto prod se crea antes del deploy.
- [x] 5. Login con contraseña o código por mail (sin altas abiertas: `shouldCreateUser: false`), sesión con organización, rol y locales, selector de local (se recuerda por dispositivo), barra y rutas según el rol. Probado en el navegador con recepción y admin. Auth de dev configurada desde `supabase/config.toml` (`npx supabase config push`): URL del sitio localhost:5173, altas abiertas cortadas (probado: `signup_disabled`), código de 6 dígitos.
- [ ] SMTP propio (por ejemplo Resend) antes del piloto: el correo de Supabase solo manda a miembros del equipo de Supabase, pocos por hora, y no deja cambiar el mail. Con SMTP se activa la plantilla `supabase/templates/codigo.html` (mail en castellano con el código, necesario para la app instalada en iPhone).
- [ ] 6. Sentry
- [~] 7. Tests: aislamiento entre organizaciones y permisos por rol ✅ (`npm run test:db`, 12 tests contra dev). Falta el flujo de login con Playwright (después del paso 5).
- [ ] 8. Deploy a Netlify (confirmar antes)

**Listo cuando:** dos organizaciones de prueba no ven los datos de la otra.

## Datos en dev

- Bar Prueba A y Bar Prueba B: los usan los tests, no tocarlos a mano.
- Bar Demo (1 local, Centro): organización de Manu (admin) para probar a mano.

## Decisiones

- Dos proyectos de Supabase en la nube (`supplyia-dev` y `supplyia-prod`) en lugar de Supabase local, porque no hay Docker.
- Formato argentino de números armado a mano (`src/lib/formato.ts`) y no con `Intl`, porque algunos navegadores no agrupan los miles de 4 cifras.
- `.env.local` necesita también `SUPABASE_SERVICE_ROLE_KEY` y `DEV_TEST_PASSWORD`. Guardalos en el gestor de contraseñas y usá los mismos en las dos computadoras (si se corre `db:datos-prueba` sin `DEV_TEST_PASSWORD`, genera una nueva y la otra computadora queda desfasada).
- Supabase dev: `supplyia-dev` (ref `efyulrowgyrxqubjelor`, São Paulo). En cada computadora: `npm run db:login` y `npm run db:link -- efyulrowgyrxqubjelor` (en Windows con PowerShell, usar `npm.cmd`).
- Altas de miembros solo por invitación desde el servidor (no desde la app), para que nadie sume a su organización a un usuario cualquiera.
- `config push` compara todo el `config.toml` con Supabase: antes de aplicar, correrlo respondiendo "n" para ver las diferencias y aplicar solo lo buscado.
