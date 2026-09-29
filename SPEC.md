# SupplyIA — Especificación para construir

App de compras y recepción de mercadería para bares y restaurantes. El local carga a sus proveedores y lo que le compra a cada uno, hace los pedidos (se envían por WhatsApp), recibe la mercadería sacando una foto al remito o factura, y una IA lee la boleta y la compara contra el pedido. Con eso el local controla precios, faltantes, excesos y tiempos de entrega de cada proveedor.

Nace de la app que funciona hoy en La Bodeguita de Pichincha (Rosario). SupplyIA es la versión genérica y vendible: varios clientes, cada uno con sus datos separados, y todo configurable por el propio cliente.

Diseño de referencia: carpeta `diseno/` de este paquete (una pantalla por archivo) y el lienzo original en https://claude.ai/artifact/QfbLA57jPMipnShFQDqkBu

---

## 1. Principios

1. **Configurable por el cliente.** Proveedores, productos, unidades, presentaciones, umbrales de alerta y tolerancias se cambian desde la app, sin pedirme nada a mí.
2. **No perder nunca un dato.** Sin señal, lo cargado queda en el celular y se sube solo cuando vuelve la conexión. Nada se borra de verdad: se archiva.
3. **La IA propone, la persona confirma.** La lectura del remito siempre pasa por una pantalla de revisión. Si la IA falla, se carga a mano y el trabajo sigue.
4. **Rápida en el celular.** Recibir mercadería tiene que tomar menos de un minuto con el proveedor esperando.
5. **Prolija.** El diseño es parte del producto: seguir `diseno/` y los tokens de la sección 4.

## 2. Usuarios y roles

| Rol | Qué hace |
|---|---|
| Administración | Todo. Ajustes, proveedores, productos, usuarios, panel de escritorio, exportar. |
| Encargado | Pedidos, recepciones, alta de proveedores y productos. No ve Ajustes ni usuarios. |
| Recepción | Solo recibe mercadería y ve pedidos en curso. |

Un cliente (organización) puede tener varios locales (sucursales). Cada usuario pertenece a una organización y puede estar limitado a uno o más locales.

## 3. Stack

- **Frontend:** Vite + React + TypeScript. App web instalable (PWA con `vite-plugin-pwa`): manifest, ícono, pantalla completa al agregarla al inicio del celular.
- **Base de datos, login y archivos:** Supabase (Postgres, Auth, Storage). Login por email con enlace mágico o contraseña.
- **Funciones del servidor:** Netlify Functions (lectura de remitos con IA, exportar a Excel, importar Excel).
- **Hosting:** Netlify, conectado al repositorio de GitHub. Deploy automático solo desde la rama `main`.
- **IA:** API de Anthropic (Claude, modelo con visión). La clave vive solo en las variables de entorno de Netlify, nunca en el frontend.
- **Pruebas:** Vitest para la lógica (reglas de negocio, conversiones), Playwright para los flujos principales.
- **Monitoreo de errores:** Sentry (plan gratis), frontend y funciones.

Variables de entorno (archivo `.env.local`, nunca se sube a git; en Netlify se cargan en el panel):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # solo en funciones
ANTHROPIC_API_KEY=           # solo en funciones
OCR_MODEL=
OCR_EFFORT=low
SENTRY_DSN=
```

## 4. Diseño

Pantallas de referencia en `diseno/` (abrirlas en el navegador para ver el layout; usan un runtime del editor de diseño, así que tomarlas como referencia visual y de contenido, no como código a copiar):

| Archivo | Pantalla |
|---|---|
| `Main.dc.html` | Inicio: accesos a Nuevo pedido y Recibir, alerta de aumentos, pedidos en curso |
| `NuevoPedido.dc.html` | Pedido a un proveedor con último precio pagado, unidad por producto, estimado y envío por WhatsApp |
| `Recepcion.dc.html` | Resultado de la lectura del remito: pedido contra recibido, faltantes, aumentos, total |
| `Proveedores.dc.html` | Ranking: cumplimiento, demora promedio, aumento de precios |
| `ProveedorDetalle.dc.html` | Ficha del proveedor, su catálogo y el formulario de nuevo producto con presentaciones |
| `NuevoProveedor.dc.html` | Alta de proveedor con validación de WhatsApp y días de entrega |
| `Precios.dc.html` | Precios por proveedor: aumento del proveedor, gráfico por insumo, lista de productos |
| `Ajustes.dc.html` | Umbral de alerta, excepciones, tolerancias, unidades, equipo |
| `Admin.dc.html` | Panel de administración de escritorio (1440 px) |

Tokens:

```css
:root{
  --fondo:#F0F1ED; --card:#FFFFFF; --tinta:#15201D; --gris:#5B6661; --linea:#DADDD6; --linea-suave:#ECEEE8;
  --petroleo:#13485B; --petroleo-suave:#DCE8EC;   /* acento principal */
  --amarillo:#F2B01E;                               /* solo el sello "IA" y el botón de enviar */
  --ok:#1E6B45; --ok-bg:#DFF0E6;
  --aviso:#8A5300; --aviso-bg:#FBEBC8;
  --error:#A3261B; --error-bg:#F9DEDA;
  --radio:16px;
}
```

- Tipografías (Google Fonts): **Schibsted Grotesk** para todo el texto, **IBM Plex Mono** para números, precios, cantidades y números de remito o pedido.
- Mobile first a 390 px, máximo 520 px de ancho en celular; el panel de administración es de escritorio.
- Botones y zonas táctiles de 44 px como mínimo. Inputs de 16 px para que iOS no haga zoom.
- Íconos de trazo (lucide-react), nunca emojis.
- Estados con color y texto a la vez (pastilla "Revisar", "En camino", "A pagar"), no solo color.
- Barra inferior con 5 secciones: Inicio, Pedir, Recibir, Proveedores, Precios. Ajustes se abre desde el nombre del local arriba a la derecha.
- Números en formato argentino: `$14.200`, `11,6 kg`, `+9,3%`.

## 5. Modelo de datos (Supabase)

Todas las tablas llevan `org_id` y se protegen con Row Level Security: un usuario solo lee y escribe filas de su organización (y de sus locales cuando corresponde). Los ids son UUID generados en el cliente, para que los reintentos sin señal no dupliquen nada.

```
organizaciones      id, nombre, plan, tope_lecturas_mes, creado_at
locales             id, org_id, nombre, activo
miembros            user_id, org_id, rol ('admin'|'encargado'|'recepcion'), locales uuid[] null (null = todos), nombre
ajustes             org_id (pk), umbral_alerta_pct (def 10), tolerancia_peso_pct (def 10), tolerancia_unidad_pct (def 0)

unidades            id, org_id, nombre, tipo ('peso'|'volumen'|'unidad'), archivada
                    -- vienen precargadas: kg, g, lt, unidad, atado, caja, bolsa, jaula, maple, bidón
                    -- nombre único por org sin distinguir mayúsculas ni plural (normalizar como hace hoy normUnidad())
proveedores         id, org_id, nombre, whatsapp (E.164), dias_entrega smallint[], hora_limite text,
                    umbral_alerta_pct null, activo, creado_at
                    -- nombre y whatsapp únicos por org entre activos
productos           id, org_id, proveedor_id, nombre, unidad_base_id, umbral_alerta_pct null, activo
                    -- único (proveedor_id, nombre normalizado)
presentaciones      id, producto_id, nombre ('Caja', 'Pieza'), factor_a_base numeric > 0, aproximada bool
                    -- "Caja = 10 kg" -> factor 10. "Pieza ≈ 4,5 kg" -> factor 4,5, aproximada

pedidos             id, org_id, local_id, numero (secuencial por org), proveedor_id, estado, observaciones,
                    creado_por, creado_at, enviado_at
pedido_items        id, pedido_id, producto_id, presentacion_id null, cantidad, cantidad_base, precio_estimado_base null

recepciones         id, org_id, pedido_id null, proveedor_id, recibido_at, recibido_por, foto_path,
                    nro_remito, fecha_remito, total_remito, lectura_ia jsonb, confirmada bool
recepcion_items     id, recepcion_id, producto_id null, texto_remito, cantidad_base, precio_unit_base,
                    subtotal, resultado ('ok'|'faltante'|'exceso'|'precio_subio'|'precio_bajo'|'no_pedido')

precios             id, org_id, proveedor_id, producto_id, precio_base, fecha, recepcion_id
diferencias         id, org_id, recepcion_id, tipo ('faltante'|'exceso'|'precio'), monto, detalle,
                    estado ('pendiente'|'reclamado'|'nota_credito'|'resuelto')

equivalencias       id, org_id, proveedor_id, texto_remito, producto_id   -- la IA aprende nombres
correcciones_ocr    id, org_id, proveedor_id, campo, detectado, correcto, creado_at
uso_lecturas        org_id, mes (yyyy-mm), cantidad
```

Estados de pedido: `borrador` → `enviado` → `recibido_parcial` | `revisar` | `a_pagar` → `pagado`. También `no_llego` y `cancelado`.

## 6. Reglas de negocio

- **Cantidad base.** Todo se guarda también en la unidad base del producto (`cantidad_base`). Pedir "2 cajas" de un producto con caja = 10 kg guarda 20 kg. Así el remito, que suele venir en kg o unidades, se compara siempre en la misma unidad.
- **Tolerancia al recibir.** Productos de tipo peso: faltante solo si llega menos que `pedido × (1 − tolerancia_peso_pct)`. Productos por unidad: tolerancia `tolerancia_unidad_pct` (por defecto exacta). Con presentación aproximada, usar la tolerancia de peso.
- **Alerta de aumento.** Se compara el precio base nuevo contra el último precio pagado al mismo proveedor por el mismo producto. Umbral: el del producto si lo tiene, si no el del proveedor, si no el de `ajustes`.
- **Aumento del proveedor (30 días).** Promedio de las variaciones de sus productos ponderado por lo gastado en cada uno.
- **Cumplimiento del proveedor.** Porcentaje de renglones pedidos que llegaron completos (dentro de la tolerancia), últimos 30 días.
- **Demora del proveedor.** Promedio de `recibido_at − enviado_at`, en días con un decimal.
- **Último precio y estimado.** Al pedir, cada producto muestra su último precio y hace cuánto. El estimado suma solo productos con precio conocido y lo aclara.
- **Mensaje de WhatsApp.** Se arma con `wa.me/<numero>?text=` y el detalle del pedido en la presentación elegida. Se muestra el texto para copiar además del botón, porque el enlace no siempre abre.
- **Archivar, no borrar.** Proveedores, productos y unidades con historial se archivan. Una unidad en uso no se puede archivar hasta reasignar sus productos.
- **Validaciones de alta.** WhatsApp argentino válido (se normaliza a `+549...`), sin duplicados de nombre ni de número entre proveedores activos, factor de presentación mayor a 0, nombre de producto no repetido en el mismo proveedor. Los errores dicen qué pasó y cómo arreglarlo.

## 7. Lectura de remitos con IA

Base: `netlify/functions/ocr.js` de la app de La Bodeguita (copiarlo al repo desde la carpeta original, **sin modificar el original**). Ya resuelve bien varias cosas y hay que conservarlas:

- Configuración por variables de entorno (`OCR_MODEL`, `OCR_EFFORT`, etc.) para cambiar de modelo sin redeployar. Las notas del archivo muestran que esfuerzo bajo lee mejor porque Netlify corta a los ~26 segundos.
- Contexto de aprendizaje: correcciones previas del proveedor y equivalencias (nombre en boleta → nombre interno). Nunca pisar el nombre original de la boleta.
- Mensajes de error en castellano que dicen qué hacer.
- Restricción de orígenes permitidos.

Cambios para SupplyIA:

1. **Autenticación.** La función exige el token de sesión de Supabase, identifica la organización y rechaza si superó `tope_lecturas_mes`. Incrementa `uso_lecturas`.
2. **Catálogo por organización.** El vocabulario interno sale de `productos` y `equivalencias` de esa organización y ese proveedor, no de una lista fija. Pasarle también las presentaciones y factores ("caja = 10 kg") para que convierta.
3. **Salida estructurada** (validar con zod antes de devolver): `nro_remito`, `fecha`, `proveedor_detectado`, `items[{texto_remito, producto_id|null, cantidad, unidad, cantidad_base, precio_unit, subtotal, confianza}]`, `total`, `alertas[]`.
4. **Chequeo de cuentas.** Si la suma de los renglones no da el total, marcarlo y mostrarlo en la revisión (ya existe una lógica así en la app actual).
5. **Tiempo.** Comprimir la foto en el cliente (lado largo 1600 px, JPEG 0,8) antes de enviarla. Si aun así los remitos largos no entran en el corte de Netlify, pasar a una Background Function con la foto en Supabase Storage y consultar el resultado.
6. **Aprendizaje.** Cada corrección que hace el usuario en la revisión se guarda en `correcciones_ocr` y cada asignación confirmada en `equivalencias`.
7. **Plan B siempre visible.** Botón "Cargar a mano" en la revisión y ante cualquier error.
8. **Duplicados.** Avisar si ya existe una recepción con el mismo `nro_remito` y proveedor.

## 8. Sin conexión

- Cola local (IndexedDB) de operaciones pendientes: crear pedido, confirmar recepción, subir foto. Cada una con su UUID, así reintentarla no duplica.
- Indicador visible de "pendientes de subir" y reintento automático al volver la conexión.
- Catálogo (proveedores, productos, últimos precios) cacheado para poder pedir sin señal.

## 9. Carga inicial por Excel

- Plantilla descargable desde la app con dos hojas: **Proveedores** (nombre, whatsapp, días de entrega, pedir antes de) y **Productos** (proveedor, producto, unidad, presentación, equivalencia, último precio opcional).
- Importación en dos pasos: vista previa con errores por fila (proveedor inexistente, unidad desconocida, duplicados) y recién después confirmar. Nada se importa a medias.
- Al principio la hago yo por el cliente; la misma pantalla queda disponible para administración.

## 10. Panel de administración (escritorio)

Ver `Admin.dc.html`. Resumen del mes (compras, pedidos, cumplimiento, diferencias detectadas), cambios de precio por proveedor, diferencias en recepción con su estado, compras por proveedor. Filtros por período, local y proveedor. Botón **Exportar a Excel** (función de Netlify que arma el .xlsx). Secciones: Resumen, Pedidos, Recepciones y remitos, Proveedores y productos, Precios, Pagos.

## 11. Robustez

- Todas las escrituras validadas en el cliente (zod) y en la base (constraints, RLS). Nunca confiar solo en el frontend.
- La clave de servicio de Supabase y la de Anthropic solo existen en funciones del servidor.
- Tests de las reglas de la sección 6 con Vitest; tests de los flujos pedir → recibir → confirmar con Playwright antes de cada deploy.
- Sentry en frontend y funciones. Ningún error se traga en silencio: o se muestra con una salida, o se reporta.
- Backups de Supabase activos (plan Pro cuando entre el primer cliente pago).
- Migraciones de base versionadas en `supabase/migrations`, nunca cambios a mano en producción.

## 12. Orden de construcción

Cada etapa termina funcionando, probada y deployada antes de pasar a la siguiente.

1. **Base.** Repo, Vite + React + TS, PWA, tokens de diseño, barra inferior, login con Supabase, organizaciones, miembros y RLS. *Listo cuando:* dos organizaciones de prueba no ven los datos de la otra.
2. **Catálogo.** Unidades, proveedores, productos, presentaciones, Ajustes (sección unidades). Importación por Excel. *Listo cuando:* se carga un proveedor con productos en caja y en kg, y no se puede duplicar ni borrar nada en uso.
3. **Pedidos.** Nuevo pedido con último precio, unidad por producto, estimado, WhatsApp, lista de pedidos en curso con estados. Cola sin conexión. *Listo cuando:* un pedido hecho en modo avión se sube solo al volver la señal.
4. **Recepción con IA.** Foto, lectura, revisión, confirmación, diferencias, historial de precios, aprendizaje. *Listo cuando:* 10 remitos reales de La Bodeguita se leen y concilian bien, y la carga manual funciona si la IA falla.
5. **Control.** Precios por proveedor, ranking de proveedores, alertas con umbrales configurables, Inicio completo.
6. **Administración.** Panel de escritorio y exportar a Excel.
7. **Piloto.** Dos locales usándola dos semanas; corregir lo que aparezca antes de vender.

## 13. Fuera del MVP (más adelante)

Stock, producción y recetas; pedido sugerido según historial; comparar el mismo insumo entre proveedores; reclamo automático por WhatsApp y seguimiento de notas de crédito; cuentas a pagar y vencimientos; notificaciones push; versión en App Store y Google Play empaquetando la misma app con Capacitor.
