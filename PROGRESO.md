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

## Etapa 2 — Catálogo ✅ (terminada el 30/9)

- [x] Plan aprobado (30/9). Decisiones: las altas del catálogo van con conexión y UUID de la app (la cola sin conexión es de la etapa 3); encargado crea unidades pero solo administración las archiva.
- [x] Migraciones `catalogo` y `catalogo_ajustes` aplicadas en **dev**: unidades (10 precargadas por organización), proveedores, productos, presentaciones, precios, equivalencias y la vista `ultimos_precios`. Nombres únicos sin mayúsculas/tildes/plural (`privado.normalizar*`, espejo en `src/lib/normalizar.ts`), WhatsApp único y en formato `+549…`, factor > 0, nada se borra (sin permiso de DELETE), unidad en uso no se archiva, todo validado contra la organización. RLS: todos leen; admin y encargado cargan; solo admin edita unidades. `importar_catalogo(jsonb)`: todo o nada.
- [x] Lógica con tests: WhatsApp argentino (saca 0 y 15), días de entrega ("lun a sáb", "L M X J V"), números argentinos, presentaciones y cantidad base, errores de la base en castellano.
- [x] Pantallas: Proveedores (lista, búsqueda, archivados), Nuevo/Editar proveedor (WhatsApp validado en vivo), Ficha (productos con unidad, presentaciones y último precio), Nuevo/Editar producto (unidad de compra, presentaciones, crear unidad), Ajustes → Unidades.
- [x] Importación por Excel: plantilla descargable (Proveedores, Productos, Instrucciones), vista previa con errores por fila, solo agrega (lo ya cargado se deja como está), todo o nada.
- [x] Tests: `npm run test:db` 29 (17 del catálogo) y `npm run e2e` 11 (5 del catálogo e importación). Los tests crean datos con nombres propios y al final los archivan.
- [x] Migraciones en prod aplicadas (30/9, confirmado). La CLI quedó linkeada de nuevo a dev.
- [x] Deploy y prueba en prod: Manu cargó un proveedor con su WhatsApp y un producto en kg con caja; el duplicado se rechazó.
- Nota: el push se hace desde GitHub Desktop (**Push origin**); la terminal de esta Mac no tiene credenciales de GitHub.

**Listo cuando:** se carga un proveedor con productos en caja y en kg, y no se puede duplicar ni borrar nada en uso. ✅ (dev y prod)

## Etapa 3 — Pedidos (en prueba en el celular)

- [x] Plan aprobado (30/9). Decisión: sin señal el pedido no tiene número; el mensaje de WhatsApp va sin número y el número aparece al subir.
- [x] Migración `pedidos` en **dev**: `pedidos` y `pedido_items` con RLS por local (recepción ve los de su local, no pide), numeración por organización (`privado.contadores`), la base calcula la cantidad base, estados manuales enviado ↔ no llegó → cancelado, nada se borra. `guardar_pedido(jsonb)`: todo o nada e idempotente (reintentar con el mismo id no duplica).
- [x] Cola sin conexión (`src/offline`): IndexedDB (`idb-keyval`), se sube sola al volver la señal, al volver a la app y cada 20 s; las rechazadas quedan con su error (reintentar o descartar). Aviso arriba: sin conexión / pendientes / con error. Sesión (localStorage) y catálogo y pedidos (IndexedDB) guardados en el celular: la app abre sin señal.
- [x] Pantallas: Pedir (proveedores ordenados por próxima entrega, "Sin enviar" si hay borrador), Nuevo pedido (último precio y hace cuánto, − / +, unidad o presentación, estimado, observaciones, borrador guardado), Enviar por WhatsApp (enlace wa.me + texto para copiar), Pedidos (en curso / todos), Detalle (reenviar, copiar, no llegó, cancelar), Inicio con pedidos en curso.
- [x] Tests: `npm test` 126, `npm run test:db` 42 (13 de pedidos), `npm run e2e` 13 (el de modo avión incluido). Probado también cerrar y abrir la app sin señal con el build de producción.
- [x] Migración `pedidos` en prod (30/9, confirmado).
- [ ] Deploy y prueba en el celular en modo avión.

**Listo cuando:** un pedido hecho en modo avión se sube solo al volver la señal. ✅ en dev.

## Etapa 4 — Recepción con IA (en curso)

- [x] Plan aprobado (30/9). Modelo `claude-opus-5-5` con esfuerzo `low`, salida estructurada y `fallbacks: "default"` (cambiable con `OCR_MODEL` / `OCR_EFFORT` sin redeployar).
- [x] Migraciones en **dev**: `recepciones`, `recepcion_items`, `diferencias`, `correcciones_ocr`, `uso_lecturas`, bucket privado `remitos` (carpeta por organización). `confirmar_recepcion(jsonb)`: idempotente, guarda precios, diferencias, equivalencias y correcciones, y pasa el pedido a `a_pagar` / `revisar`. Estados manuales nuevos: revisar → a pagar → pagado. `reservar_lectura` / `devolver_lectura`: tope mensual, solo desde el servidor.
- [x] Lógica con tests: control de cuentas (`validarBoleta` de La Bodeguita portado, sin las reglas propias de Papelera), conciliación (tolerancias, umbral producto → proveedor → general, faltantes, excesos, no pedidos, sin asignar), conversión de unidades (caja → kg, g → kg).
- [x] Función `netlify/functions/ocr` (`/api/ocr`): exige sesión, tope del mes, catálogo del bar con códigos P1…, equivalencias y correcciones como contexto, prompt de La Bodeguita, zod, aviso de remito duplicado, Sentry. En local corre dentro de Vite (`funciones-locales.ts`).
- [x] Pantallas: Recibir (pedidos por llegar o sin pedido), foto (se comprime a 1600 px), leyendo, revisión como `Recepcion.dc.html` (todo editable, asignar renglones, quitar, agregar), reclamo por WhatsApp, cargar a mano (siempre visible; sin señal pasa por la cola), detalle del pedido con la recepción y las diferencias (reclamado / nota de crédito / resuelto).
- [x] Tests: `npm test` 151, `npm run test:db` 52 (10 de recepciones), `npm run e2e` 15 (IA simulada: lectura, falla de la IA, carga a mano sin señal).
- [x] Script `npm run remitos:probar -- <carpeta>`: lee fotos reales con la IA de verdad y arma un informe para comparar contra el papel.
- [x] Migraciones de recepción en prod (30/9, confirmado).
- [x] **No hay fotos de remitos reales** (La Bodeguita nunca guardó fotos: lo dice su código). Criterio reemplazado, acordado con Manu: remitos de prueba armados con boletas REALES de La Bodeguita (ya controladas por su personal) → `npm run remitos:armar`, con el estilo de columnas de cada proveedor y defectos de foto; `npm run remitos:probar` los lee con la IA de verdad y puntúa solo contra lo que dicen (número, total, cantidad, precio, subtotal y producto de cada renglón). `--sin-equivalencias` mide un proveedor nuevo.
- [x] Catálogo de La Bodeguita en Bar Demo (dev) con `npm run labode:importar` (solo lee dos JSON bajados con las consultas de lectura de su app; La Bodeguita no se toca): 26 proveedores, 271 productos, 122 equivalencias, 177 precios. Arreglos solo del lado de SupplyIA: WhatsApp de Lucas Catena (594 → 549) y Noblex duplicado de Bazar Noblex. La misma corrida arma la planilla para importarla desde la app cuando La Bodeguita pase a SupplyIA.
- [x] Arreglo: la clave de servicio no podía usar `privado.normalizar*` (migración `privado_service_role`, en dev y prod el 30/9).
- [x] Cuenta personal de Anthropic ("Manu's Individual Org", USD 5 de crédito prepago). Las claves nuevas son `sk-ant-usr-…`, vinculadas al usuario: al crearla hay que elegir alcance **Espacio de trabajo predeterminado** (sin alcance no funciona). `supplyia-dev` en `.env.local`, vence el 30/10.
- [x] Prueba con 12 remitos armados de boletas reales (30/9): **Opus 5.5** leyó 7 de 12 a tiempo (5 cortados a los 24 s), 92,3 % de campos bien; **Sonnet 5.5** leyó 12 de 12 en 3,3–7,9 s, **96,9 %**, a mitad de precio → modelo por defecto `claude-sonnet-5-5` (cambiable con `OCR_MODEL`). Números de remito, totales, cantidades y precios: casi perfectos; los errores son de asignación de producto (y 12 renglones esperaban productos que La Bodeguita renombró: esos no se puntúan). `remitos:probar` guarda las lecturas en un .json y acepta `--solo a.jpg,b.jpg`.
- [ ] Clave `supplyia-prod` (la crea Manu, alcance espacio de trabajo) y variables en Netlify: `ANTHROPIC_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY` de prod. Después, probar una foto en prod.

**Listo cuando** (ajustado): los remitos de prueba armados con boletas reales se leen bien (número, total y renglones) ✅ 96,9 % con Sonnet 5.5, todos dentro del tiempo; y la carga manual funciona si la IA falla ✅. Falta activarlo en prod. Cuando haya fotos reales, se prueban con el mismo script.

## Etapa 5 — Control (en prueba)

- [x] Plan aprobado (30/9). La prueba de la IA de la etapa 4 queda para cuando Manu tenga la clave personal.
- [x] Métricas con tests (`src/control/metricas.ts`, SPEC §6): variación de cada producto en 30 días, aumento del proveedor ponderado por lo gastado, cumplimiento (renglones pedidos completos), demora (enviado → recibido), alertas de la semana con umbral producto → proveedor → general. Los saltos de más de ×4 o menos de ÷4 se marcan "Revisá la unidad" (casi seguro otra unidad) y no cuentan.
- [x] Pantallas: Precios (chips por proveedor, "subió X% en 30 días", gráfico SVG propio, lista), ranking en Proveedores (cumplimiento / demora / aumentos) y métricas en la ficha, Inicio con "Subieron N insumos esta semana" y pedidos en curso con el detalle de la recepción, Ajustes (umbral, excepciones por proveedor o producto, tolerancias).
- [x] Arreglo importante: Supabase devuelve como máximo 1.000 filas por consulta; catálogo y control ahora piden de a páginas (`src/lib/paginar.ts`). Sin esto, Control calculaba con datos viejos e incompletos.
- [x] Historial de La Bodeguita en Bar Demo (dev): `npm run labode:importar -- … --confirmar --historial` (382 recepciones, 1.855 renglones, 953 precios, jun–sep). El script corrige solo de su lado: fechas con día y mes invertidos en La Bodeguita (41 boletas), el formato nuevo de boletas (`cantidadRecibida`) y la fecha del "último precio".
- [x] Usuario de prueba `encargado-demo@supplyia.test` (Bar Demo, dev, misma contraseña que los de prueba) para ver pantallas con datos reales.
- [x] Tests: `npm test` 164, `npm run test:db` 52, `npm run e2e` 16.
- [ ] Deploy (sin migraciones nuevas) y prueba en el celular.

**Listo cuando:** los aumentos, el ranking y las alertas coinciden con una cuenta a mano. ✅ Cuenta independiente en Python sobre Bar Demo: Vinesco −1,7 %, Papelera +0,1 %, Quilmes +37,2 %, La Esperanza +3,4 %, idénticos a la app.

## Etapa 6 — Administración (lista para subir)

- [x] Plan aprobado (30/9). El Excel se arma en el navegador (misma librería que la plantilla) en vez de una función de Netlify como dice la SPEC §10: mismo archivo, sin el corte de 26 s ni gasto de funciones.
- [x] Migración `pagos` en **dev**: `pedidos.pagado_at`, lo pone la base al marcar pagado (no se puede escribir a mano).
- [x] Panel de escritorio en `/admin` (solo administración; link desde Ajustes), como `Admin.dc.html`: menú lateral, filtros por período (últimos 12 meses), local y proveedor en la dirección (se pueden compartir). Secciones: Resumen (compras, pedidos, cumplimiento, diferencias, cambios de precio, diferencias con su estado, compras por proveedor), Pedidos, Recepciones y remitos (detalle de renglones y foto del remito con link de 5 minutos), Proveedores y productos, Precios (aumentos / bajas / revisar unidad), Pagos (a pagar, revisar → a pagar, marcar pagado, pagados). En pantallas chicas el menú pasa arriba.
- [x] Exportar a Excel: hojas Resumen, Compras por proveedor, Pedidos, Recepciones, Diferencias, Cambios de precio y A pagar, con los mismos cálculos que la pantalla (`src/admin/resumen.ts`).
- [x] Cambios de precio de menos de 0,1 % no cuentan (centavos de redondeo del remito).
- [x] Usuario de prueba `admin-demo@supplyia.test` (Bar Demo, dev): `npm run db:datos-prueba` ahora deja listos `admin-demo` y `encargado-demo` si existe Bar Demo.
- [x] Tests: `npm test` 174, `npm run test:db` 53, `npm run e2e` 17 (el nuevo baja el Excel, lo lee y compara con la pantalla, reclama una diferencia y marca un pago).
- [x] Migración `pagos` en prod (30/9, confirmado).
- [ ] Deploy (push) y probar el panel en https://supplyia.netlify.app/admin.

**Listo cuando** (propuesto en el plan): el resumen de septiembre de Bar Demo coincide con una cuenta a mano y el Excel tiene los mismos números. ✅ Cuenta independiente en SQL sobre Bar Demo: $39.665.610,40 en 91 recepciones de 19 proveedores; Vinesco $6.779.591, Juanchi $5.642.856, La Esperanza $5.437.164, Quilmes $4.946.929, Cook Express $3.965.048: idéntico al panel. El Excel lo verifica el test e2e.

## Etapa 7 — Piloto (en curso)

- [x] Protección de acceso de Netlify sacada (30/9): contestaba 401 al pedir la versión nueva y la app instalada seguía en la etapa 1 sin avisar. La app se protege sola (login, altas cerradas, RLS).
- [x] La app avisa si no puede bajar la versión nueva (y lo reporta a Sentry), muestra la versión en Ajustes, y explica qué hacer si el link del mail se abre en otro navegador.
- [x] Total de la boleta, como en La Bodeguita: son dos cosas distintas del precio unitario de cada producto. Se carga a mano o lo completa la IA; se controla contra la suma de renglones (acepta IVA 10,5 % / 21 % o tasas mezcladas, avisa si falta, si no cierra o si un precio parece por caja). Si falta o no cierra, el pedido queda para revisar y el motivo se ve en el pedido y en el panel. Pagos usa ese total.
- [x] Un solo control del total (el de La Bodeguita); el de la IA revisa solo los renglones. La suma usa todos los renglones de la boleta, tengan o no producto asignado. Si la diferencia es chica y no es IVA, lo dice como es.
- [x] Prueba de la IA de verdad desde la app en local (30/9, Bar Demo): Quilmes 7,1 s y La Esperanza (Factura A, borrosa) 6,0 s, número, total y todos los renglones exactos.
- [x] Tests: `npm test` 184, `npm run e2e` 18.
- [x] Plan aprobado (1/10): usuarios y locales desde Ajustes, alta de clientes, SMTP con Resend.
- [x] Migración `equipo` en **dev**: `miembros.activo` (dar de baja sin borrar: las tres funciones de permisos lo dejan afuera de todo) y `miembros.email` (administración ve el mail de su equipo); ya no se borran miembros; nadie se da de baja a sí mismo; siempre queda un local activo; `usuario_por_email` solo para el servidor.
- [x] Función `/api/equipo` (`netlify/functions/equipo`): solo administración activa suma gente; valida todo antes de crear el usuario; un mail no puede estar en dos bares; si la persona estaba dada de baja, la reactiva. La persona entra con su mail (sin contraseña).
- [x] Ajustes → **Locales** (agregar, cambiar nombre, archivar, reactivar) y **Equipo** (sumar con rol y locales, editar, dar de baja, reactivar, aviso por WhatsApp). El selector de local se actualiza solo.
- [x] `npm run cliente:alta -- --nombre … --locales … --admin … --admin-nombre … [--prod] [--confirmar]`: organización + locales + primera administración. Sin `--confirmar` solo muestra lo que haría. Probado en dev con "Bar de Ensayo".
- [x] Cerrar sesión cierra solo ese dispositivo (antes cortaba la sesión de la misma persona en todos).
- [x] Tests: `npm test` 184, `npm run test:db` 65 (12 de equipo y locales, con la invitación real), `npm run e2e` 20.
- [x] Migración `equipo` en prod (1/10, confirmado y verificado).
- [x] Deploy `f05759a` (1/10): Ajustes → Locales y Equipo vistos en prod por Manu.
- [x] **Sin mails para el piloto** (decisión de Manu, 1/10): al sumar a alguien, el servidor le genera una **contraseña provisoria** (`k7mq-p9xw-4hnd`), que se muestra una sola vez para pasársela (botón de WhatsApp). Administración puede generarle otra desde Editar → Nueva contraseña (no la propia, ni la de otro bar). Cada persona la cambia en Ajustes → Cambiar contraseña; mientras sea provisoria, la app se lo recuerda arriba. `cliente:alta` también le da una al primer administrador.
- [x] Tests: `npm test` 186, `npm run test:db` 69, `npm run e2e` 20 (el de equipo entra como la persona invitada, cambia la contraseña y vuelve a entrar).
- [ ] Deploy de las contraseñas provisorias (sin migración nueva).
- [ ] SMTP con Resend + dominio propio: queda para cuando se venda (hoy "mandame un mail" solo le llega a Manu). No traba el piloto.
- [ ] Alta de los dos bares del piloto con `cliente:alta --prod` (Manu todavía no definió cuáles).

## Datos en dev

- Bar Prueba A y Bar Prueba B: los usan los tests, no tocarlos a mano. Los tests dejan locales archivados y dos miembros dados de baja (`invitado-a`, `invitado-e2e`): es esperable.
- Bar de Ensayo (Centro, Norte; admin `ensayo@supplyia.test`): creado con `cliente:alta` para probar el script.
- Bar Demo (1 local, Centro): organización de Manu (admin) para probar a mano, con el catálogo y el historial de La Bodeguita. Usuarios de prueba `admin-demo` y `encargado-demo` (@supplyia.test).

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
