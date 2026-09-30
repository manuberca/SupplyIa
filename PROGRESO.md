# Progreso

Se actualiza al terminar cada paso, así cualquier computadora sabe dónde seguir.

## Etapa 1 — Base ✅ (terminada el 30/9)

- [x] 1. Esqueleto: Vite + React + TS estricto, ESLint, Prettier, `.nvmrc` (Node 24), `.gitattributes`
- [x] 2. Diseño base: tokens, tipografías, encabezado, barra inferior, pantallas vacías, formato argentino con tests
- [x] 3. PWA: manifest e íconos (provisorios, desde `public/icono.svg`)
- [x] Repo en GitHub (github.com/manuberca/SupplyIa) y primer push
- [x] 4. Supabase dev: vinculado, migración `base` aplicada y datos de prueba (`npm run db:datos-prueba`): Bar Prueba A (2 locales, admin/encargado/recepción) y Bar Prueba B (1 local, admin). El proyecto prod se crea antes del deploy.
- [x] 5. Login con contraseña o código por mail (sin altas abiertas: `shouldCreateUser: false`), sesión con organización, rol y locales, selector de local (se recuerda por dispositivo), barra y rutas según el rol. Probado en el navegador con recepción y admin. Auth de dev configurada desde `supabase/config.toml` (`npx supabase config push`): URL del sitio localhost:5173, altas abiertas cortadas (probado: `signup_disabled`), código de 6 dígitos.
- [ ] SMTP propio (por ejemplo Resend) antes del piloto: el correo de Supabase solo manda a miembros del equipo de Supabase, pocos por hora, y no deja cambiar el mail. Con SMTP se activa la plantilla `supabase/templates/codigo.html` (mail en castellano con el código, necesario para la app instalada en iPhone).
- [x] 6. Sentry en el frontend: se activa con `VITE_SENTRY_DSN` (sin DSN solo va a la consola). Reporta errores no manejados, fallas al cargar la sesión y errores de login desconocidos; identifica por id de usuario, organización y rol (sin mail, IP ni parámetros de la URL). Pantalla "Algo falló" con botón para recargar. Si falta configuración, la app lo dice en pantalla en vez de quedar en blanco. **Falta:** crear el proyecto en sentry.io y poner el DSN en `.env.local` y en Netlify. Sentry en funciones, cuando exista la primera (OCR, etapa 4).
- [x] 7. Tests: aislamiento entre organizaciones y permisos por rol (`npm run test:db`, 12 tests contra dev) y flujo de login con Playwright (`npm run e2e`, 6 tests en pantalla de celular contra dev: admin, recepción, otra organización, contraseña equivocada, mail mal escrito, cerrar sesión). La primera vez en cada computadora: `npx playwright install chromium`.
- [x] 8. Deploy a Netlify: `netlify.toml` listo (build, caché del service worker, encabezados de seguridad; la redirección de la SPA está en `public/_redirects`). Pasos pendientes, en orden:
  1. ✅ `supplyia-prod` creado (ref `xrdujgrbmjgtcwxrkqer`, São Paulo, plan gratis). Contraseña de la base: `SUPABASE_PROD_DB_PASSWORD` en `.env.local` y en el gestor de contraseñas.
  2. ✅ Migración `base` aplicada en prod (30/9): 4 tablas con RLS y políticas, verificado. La CLI quedó linkeada de nuevo a dev.
  3. ✅ Auth de prod: altas cerradas (probado: `signup_disabled`), código de 6 dígitos y URL del sitio https://supplyia.netlify.app. Lo propio de prod está en `[remotes.prod]` de `supabase/config.toml`; se aplica con `npx supabase config push --project-ref xrdujgrbmjgtcwxrkqer` (sin re-linkear).
  4. ✅ Netlify: https://supplyia.netlify.app, desde GitHub, rama `main`. Variables de prod cargadas (copia local en `.env.prod.local`, ignorado por git). Tiene protección de acceso de Netlify (solo entra quien tiene sesión en Netlify): sacarla antes del piloto. Deploy previews y de otras ramas: cancelados desde `netlify.toml` (`ignore = "exit 0"`).
  5. ✅ Revisión completa antes del primer deploy (30/9). Repetirla antes de cada push a `main`: `npm run lint && npm test && npm run test:db && npm run e2e && npm run build`. **Cada push a `main` deploya y gasta créditos.**
  6. ✅ Login en prod probado con código por mail (Manu, Bar Demo).

**Listo cuando:** dos organizaciones de prueba no ven los datos de la otra. ✅ (`npm run test:db` y `npm run e2e`)

Queda para antes del piloto: SMTP propio, sacar la protección de acceso de Netlify, plan Pro de Supabase en prod.

## Etapa 2 — Catálogo (en curso)

- [x] Plan aprobado (30/9). Decisiones: las altas del catálogo van con conexión y UUID de la app (la cola sin conexión es de la etapa 3); encargado crea unidades pero solo administración las archiva.
- [x] Migraciones `catalogo` y `catalogo_ajustes` aplicadas en **dev**: unidades (10 precargadas por organización), proveedores, productos, presentaciones, precios, equivalencias y la vista `ultimos_precios`. Nombres únicos sin mayúsculas/tildes/plural (`privado.normalizar*`, espejo en `src/lib/normalizar.ts`), WhatsApp único y en formato `+549…`, factor > 0, nada se borra (sin permiso de DELETE), unidad en uso no se archiva, todo validado contra la organización. RLS: todos leen; admin y encargado cargan; solo admin edita unidades. `importar_catalogo(jsonb)`: todo o nada.
- [x] Lógica con tests: WhatsApp argentino (saca 0 y 15), días de entrega ("lun a sáb", "L M X J V"), números argentinos, presentaciones y cantidad base, errores de la base en castellano.
- [x] Pantallas: Proveedores (lista, búsqueda, archivados), Nuevo/Editar proveedor (WhatsApp validado en vivo), Ficha (productos con unidad, presentaciones y último precio), Nuevo/Editar producto (unidad de compra, presentaciones, crear unidad), Ajustes → Unidades.
- [x] Importación por Excel: plantilla descargable (Proveedores, Productos, Instrucciones), vista previa con errores por fila, solo agrega (lo ya cargado se deja como está), todo o nada.
- [x] Tests: `npm run test:db` 29 (17 del catálogo) y `npm run e2e` 11 (5 del catálogo e importación). Los tests crean datos con nombres propios y al final los archivan.
- [ ] Migraciones en prod (confirmar antes) y deploy.

**Listo cuando:** se carga un proveedor con productos en caja y en kg, y no se puede duplicar ni borrar nada en uso. ✅ en dev.

## Datos en dev

- Bar Prueba A y Bar Prueba B: los usan los tests, no tocarlos a mano.
- Bar Demo (1 local, Centro): organización de Manu (admin) para probar a mano.

## Datos en prod

- Bar Demo (1 local, Centro) con Manu como admin, para probar la app publicada (creado el 30/9). No es un cliente: archivarlo cuando entre el primero.

## Decisiones

- Dos proyectos de Supabase en la nube (`supplyia-dev` y `supplyia-prod`) en lugar de Supabase local, porque no hay Docker.
- La variable de Sentry del frontend es `VITE_SENTRY_DSN` (Vite solo expone las que empiezan con `VITE_`); el DSN no es secreto. `SPEC.md` §3 dice `SENTRY_DSN`.
- La configuración se revisa en `main.tsx` antes de cargar la app (`src/lib/config.ts`), y la app se importa después, así una variable faltante se muestra en pantalla.
- Formato argentino de números armado a mano (`src/lib/formato.ts`) y no con `Intl`, porque algunos navegadores no agrupan los miles de 4 cifras.
- `.env.local` necesita también `SUPABASE_SERVICE_ROLE_KEY` y `DEV_TEST_PASSWORD`. Guardalos en el gestor de contraseñas y usá los mismos en las dos computadoras (si se corre `db:datos-prueba` sin `DEV_TEST_PASSWORD`, genera una nueva y la otra computadora queda desfasada).
- Supabase prod: `supplyia-prod` (ref `xrdujgrbmjgtcwxrkqer`). Para tocar prod: linkear, hacer lo justo y volver a linkear dev enseguida. Antes de pasar a clientes reales, plan Pro (backups y sin pausa por inactividad).
- Supabase dev: `supplyia-dev` (ref `efyulrowgyrxqubjelor`, São Paulo). En cada computadora: `npm run db:login` y `npm run db:link -- efyulrowgyrxqubjelor` (en Windows con PowerShell, usar `npm.cmd`).
- Altas de miembros solo por invitación desde el servidor (no desde la app), para que nadie sume a su organización a un usuario cualquiera.
- `config push` compara todo el `config.toml` con Supabase: antes de aplicar, correrlo respondiendo "n" para ver las diferencias y aplicar solo lo buscado.
