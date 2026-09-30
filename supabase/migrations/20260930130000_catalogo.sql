-- Etapa 2 — Catálogo: unidades, proveedores, productos, presentaciones,
-- precios y equivalencias, con Row Level Security. Ver SPEC.md §5, §6 y §9.
-- Regla general: todos los de la organización leen el catálogo; administración
-- y encargado lo cargan. Nada se borra: se archiva.

-- ─── Normalización de nombres ──────────────────────────────────────────────
-- Para que "Tomate", "tomate " y "TOMATE" cuenten como el mismo nombre.
-- Espejo exacto de src/lib/normalizar.ts (si se cambia una, cambiar la otra).

create function privado.normalizar(p text)
returns text
language sql immutable parallel safe set search_path = ''
as $$
  select lower(regexp_replace(btrim(translate(coalesce(p, ''), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu')), '\s+', ' ', 'g'))
$$;

-- Unidades: además, sin distinguir plural ni abreviatura ("kilos" = "kg", "cajas" = "caja").
create function privado.normalizar_unidad(p text)
returns text
language sql immutable parallel safe set search_path = ''
as $$
  select case
    when v in ('u', 'un', 'unid', 'unidad', 'unidades') then 'unidad'
    when v in ('kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos') then 'kg'
    when v in ('g', 'gr', 'grs', 'gramo', 'gramos') then 'g'
    when v in ('l', 'lt', 'lts', 'litro', 'litros') then 'lt'
    when v in ('ml', 'mililitro', 'mililitros') then 'ml'
    when v like '%ones' then left(v, -2)                           -- cajones, bidones
    when v like '%iles' then left(v, -2)                           -- barriles
    when length(v) > 3 and v like '%s' and v not like '%ss' then left(v, -1)
    else v
  end
  from (select privado.normalizar(p) as v) as t
$$;

grant execute on function privado.normalizar(text), privado.normalizar_unidad(text) to authenticated;

create function privado.puede_editar_catalogo()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(privado.mi_rol() in ('admin', 'encargado'), false)
$$;

revoke all on function privado.puede_editar_catalogo() from public;
grant execute on function privado.puede_editar_catalogo() to authenticated;

-- ─── Tablas ────────────────────────────────────────────────────────────────

create table public.unidades (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organizaciones (id) on delete restrict,
  nombre    text not null check (length(btrim(nombre)) between 1 and 40),
  tipo      text not null check (tipo in ('peso', 'volumen', 'unidad')),
  archivada boolean not null default false
);

create index unidades_org_id_idx on public.unidades (org_id);
create unique index unidades_nombre_unico
  on public.unidades (org_id, privado.normalizar_unidad(nombre)) where not archivada;

create table public.proveedores (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizaciones (id) on delete restrict,
  nombre            text not null check (length(btrim(nombre)) between 1 and 120),
  whatsapp          text not null check (whatsapp ~ '^\+549[0-9]{10}$'),       -- E.164 de celular argentino
  dias_entrega      smallint[] not null default '{}'
                    check (dias_entrega <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]), -- 1 = lunes … 7 = domingo
  hora_limite       text check (hora_limite ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),   -- "pedir antes de"
  umbral_alerta_pct numeric(5, 2) check (umbral_alerta_pct between 0 and 100),
  activo            boolean not null default true,
  creado_at         timestamptz not null default now()
);

create index proveedores_org_id_idx on public.proveedores (org_id);
create unique index proveedores_nombre_unico
  on public.proveedores (org_id, privado.normalizar(nombre)) where activo;
create unique index proveedores_whatsapp_unico
  on public.proveedores (org_id, whatsapp) where activo;

create table public.productos (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizaciones (id) on delete restrict,
  proveedor_id      uuid not null references public.proveedores (id) on delete restrict,
  nombre            text not null check (length(btrim(nombre)) between 1 and 120),
  unidad_base_id    uuid not null references public.unidades (id) on delete restrict,
  umbral_alerta_pct numeric(5, 2) check (umbral_alerta_pct between 0 and 100),
  activo            boolean not null default true,
  creado_at         timestamptz not null default now()
);

create index productos_org_id_idx on public.productos (org_id);
create index productos_proveedor_id_idx on public.productos (proveedor_id);
create index productos_unidad_base_id_idx on public.productos (unidad_base_id);
create unique index productos_nombre_unico
  on public.productos (proveedor_id, privado.normalizar(nombre)) where activo;

-- "Caja = 10 kg" → factor 10. "Pieza ≈ 4,5 kg" → factor 4,5 y aproximada.
create table public.presentaciones (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizaciones (id) on delete restrict,
  producto_id   uuid not null references public.productos (id) on delete restrict,
  nombre        text not null check (length(btrim(nombre)) between 1 and 40),
  factor_a_base numeric(12, 4) not null check (factor_a_base > 0),
  aproximada    boolean not null default false,
  activa        boolean not null default true
);

create index presentaciones_org_id_idx on public.presentaciones (org_id);
create index presentaciones_producto_id_idx on public.presentaciones (producto_id);
create unique index presentaciones_nombre_unico
  on public.presentaciones (producto_id, privado.normalizar_unidad(nombre)) where activa;

-- Historial de precios por unidad base. En la etapa 4 los suma cada recepción confirmada;
-- por ahora solo entran desde la importación (último precio conocido).
create table public.precios (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizaciones (id) on delete restrict,
  proveedor_id uuid not null references public.proveedores (id) on delete restrict,
  producto_id  uuid not null references public.productos (id) on delete restrict,
  precio_base  numeric(14, 2) not null check (precio_base >= 0),
  fecha        timestamptz not null default now(),
  origen       text not null default 'recepcion' check (origen in ('recepcion', 'importacion', 'manual')),
  recepcion_id uuid  -- la referencia a recepciones se agrega en la etapa 4
);

create index precios_org_id_idx on public.precios (org_id);
create index precios_producto_fecha_idx on public.precios (producto_id, fecha desc);
create index precios_proveedor_id_idx on public.precios (proveedor_id);

-- Cómo figura un producto en el remito de ese proveedor. La IA aprende de acá (etapa 4).
create table public.equivalencias (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizaciones (id) on delete restrict,
  proveedor_id uuid not null references public.proveedores (id) on delete restrict,
  texto_remito text not null check (length(btrim(texto_remito)) between 1 and 200),
  producto_id  uuid not null references public.productos (id) on delete restrict
);

create index equivalencias_org_id_idx on public.equivalencias (org_id);
create index equivalencias_producto_id_idx on public.equivalencias (producto_id);
create unique index equivalencias_texto_unico
  on public.equivalencias (proveedor_id, privado.normalizar(texto_remito));

-- ─── Reglas que no dependen de quién escribe ───────────────────────────────

-- Toda organización nace con las unidades de siempre.
create function privado.crear_unidades_por_defecto()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.unidades (org_id, nombre, tipo)
  select new.id, u.nombre, u.tipo
  from (values
    ('kg', 'peso'), ('g', 'peso'), ('lt', 'volumen'), ('unidad', 'unidad'), ('atado', 'unidad'),
    ('caja', 'unidad'), ('bolsa', 'unidad'), ('jaula', 'unidad'), ('maple', 'unidad'), ('bidón', 'unidad')
  ) as u (nombre, tipo)
  on conflict do nothing;
  return new;
end
$$;

create trigger organizaciones_unidades
after insert on public.organizaciones
for each row execute function privado.crear_unidades_por_defecto();

-- Las organizaciones que ya existen también las reciben.
insert into public.unidades (org_id, nombre, tipo)
select o.id, u.nombre, u.tipo
from public.organizaciones o
cross join (values
  ('kg', 'peso'), ('g', 'peso'), ('lt', 'volumen'), ('unidad', 'unidad'), ('atado', 'unidad'),
  ('caja', 'unidad'), ('bolsa', 'unidad'), ('jaula', 'unidad'), ('maple', 'unidad'), ('bidón', 'unidad')
) as u (nombre, tipo)
on conflict do nothing;

-- Un producto usa un proveedor y una unidad de su misma organización, y la unidad no puede estar archivada.
create function privado.validar_producto()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.proveedores p where p.id = new.proveedor_id and p.org_id = new.org_id) then
    raise exception 'Ese proveedor no es de esta organización.' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' or new.unidad_base_id is distinct from old.unidad_base_id then
    if not exists (
      select 1 from public.unidades u
      where u.id = new.unidad_base_id and u.org_id = new.org_id and not u.archivada
    ) then
      raise exception 'Esa unidad no existe o está archivada. Elegí otra.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;

create trigger productos_validar
before insert or update on public.productos
for each row execute function privado.validar_producto();

-- Presentaciones, precios y equivalencias: todo de la misma organización (y del mismo proveedor).
create function privado.validar_de_mi_producto()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_proveedor uuid;
begin
  select p.proveedor_id into v_proveedor
  from public.productos p
  where p.id = new.producto_id and p.org_id = new.org_id;

  if v_proveedor is null then
    raise exception 'Ese producto no es de esta organización.' using errcode = 'check_violation';
  end if;
  if tg_table_name in ('precios', 'equivalencias') and to_jsonb(new) ->> 'proveedor_id' <> v_proveedor::text then
    raise exception 'Ese producto no es de este proveedor.' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger presentaciones_validar
before insert or update on public.presentaciones
for each row execute function privado.validar_de_mi_producto();

create trigger precios_validar
before insert or update on public.precios
for each row execute function privado.validar_de_mi_producto();

create trigger equivalencias_validar
before insert or update on public.equivalencias
for each row execute function privado.validar_de_mi_producto();

-- Una unidad en uso no se archiva hasta reasignar sus productos.
create function privado.proteger_unidad_en_uso()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_productos text;
  v_cantidad integer;
begin
  if new.archivada and not old.archivada then
    select count(*), string_agg(nombre, ', ' order by nombre)
    into v_cantidad, v_productos
    from (
      select p.nombre from public.productos p
      where p.unidad_base_id = old.id and p.activo
      order by p.nombre
      limit 5
    ) as primeros;

    if v_cantidad > 0 then
      raise exception 'La unidad "%" la usan: %. Cambiales la unidad antes de archivarla.', old.nombre, v_productos
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;

create trigger unidades_en_uso
before update on public.unidades
for each row execute function privado.proteger_unidad_en_uso();

-- ─── Row Level Security ────────────────────────────────────────────────────

alter table public.unidades       enable row level security;
alter table public.proveedores    enable row level security;
alter table public.productos      enable row level security;
alter table public.presentaciones enable row level security;
alter table public.precios        enable row level security;
alter table public.equivalencias  enable row level security;

-- Sin sesión no se ve nada, y nada se borra: se archiva.
revoke all on public.unidades, public.proveedores, public.productos, public.presentaciones,
  public.precios, public.equivalencias from anon;
revoke delete, truncate on public.unidades, public.proveedores, public.productos, public.presentaciones,
  public.precios, public.equivalencias from authenticated;

-- Solo se pueden cambiar estas columnas (ni el id ni la organización).
revoke update on public.unidades, public.proveedores, public.productos, public.presentaciones,
  public.precios, public.equivalencias from authenticated;
grant update (nombre, tipo, archivada) on public.unidades to authenticated;
grant update (nombre, whatsapp, dias_entrega, hora_limite, umbral_alerta_pct, activo) on public.proveedores to authenticated;
grant update (proveedor_id, nombre, unidad_base_id, umbral_alerta_pct, activo) on public.productos to authenticated;
grant update (nombre, factor_a_base, aproximada, activa) on public.presentaciones to authenticated;
grant update (producto_id) on public.equivalencias to authenticated;

-- Lectura: todos los de la organización.
create policy "ver unidades" on public.unidades
  for select to authenticated using (org_id = (select privado.mi_org()));
create policy "ver proveedores" on public.proveedores
  for select to authenticated using (org_id = (select privado.mi_org()));
create policy "ver productos" on public.productos
  for select to authenticated using (org_id = (select privado.mi_org()));
create policy "ver presentaciones" on public.presentaciones
  for select to authenticated using (org_id = (select privado.mi_org()));
create policy "ver precios" on public.precios
  for select to authenticated using (org_id = (select privado.mi_org()));
create policy "ver equivalencias" on public.equivalencias
  for select to authenticated using (org_id = (select privado.mi_org()));

-- Unidades: administración y encargado las crean; solo administración las edita o archiva.
create policy "cargar unidades" on public.unidades
  for insert to authenticated
  with check (org_id = (select privado.mi_org()) and (select privado.puede_editar_catalogo()));
create policy "administración edita unidades" on public.unidades
  for update to authenticated
  using (org_id = (select privado.mi_org()) and (select privado.mi_rol()) = 'admin')
  with check (org_id = (select privado.mi_org()));

-- Proveedores, productos, presentaciones y equivalencias: administración y encargado.
create policy "cargar proveedores" on public.proveedores
  for insert to authenticated
  with check (org_id = (select privado.mi_org()) and (select privado.puede_editar_catalogo()));
create policy "editar proveedores" on public.proveedores
  for update to authenticated
  using (org_id = (select privado.mi_org()) and (select privado.puede_editar_catalogo()))
  with check (org_id = (select privado.mi_org()));

create policy "cargar productos" on public.productos
  for insert to authenticated
  with check (org_id = (select privado.mi_org()) and (select privado.puede_editar_catalogo()));
create policy "editar productos" on public.productos
  for update to authenticated
  using (org_id = (select privado.mi_org()) and (select privado.puede_editar_catalogo()))
  with check (org_id = (select privado.mi_org()));

create policy "cargar presentaciones" on public.presentaciones
  for insert to authenticated
  with check (org_id = (select privado.mi_org()) and (select privado.puede_editar_catalogo()));
create policy "editar presentaciones" on public.presentaciones
  for update to authenticated
  using (org_id = (select privado.mi_org()) and (select privado.puede_editar_catalogo()))
  with check (org_id = (select privado.mi_org()));

create policy "cargar equivalencias" on public.equivalencias
  for insert to authenticated
  with check (org_id = (select privado.mi_org()) and (select privado.puede_editar_catalogo()));
create policy "editar equivalencias" on public.equivalencias
  for update to authenticated
  using (org_id = (select privado.mi_org()) and (select privado.puede_editar_catalogo()))
  with check (org_id = (select privado.mi_org()));

-- Precios: por ahora solo desde la importación (administración y encargado). No se editan.
create policy "cargar precios" on public.precios
  for insert to authenticated
  with check (org_id = (select privado.mi_org()) and (select privado.puede_editar_catalogo()));

-- ─── Importación por Excel ─────────────────────────────────────────────────
-- Recibe filas ya validadas y con ids generados en la app. Corre con los permisos
-- de quien la llama (RLS incluido) y en una sola transacción: o entra todo o nada.

create function public.importar_catalogo(datos jsonb)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_org uuid := privado.mi_org();
  n_proveedores integer;
  n_productos integer;
  n_presentaciones integer;
  n_equivalencias integer;
  n_precios integer;
begin
  if v_org is null or not privado.puede_editar_catalogo() then
    raise exception 'Solo administración o encargado pueden importar el catálogo.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.proveedores (id, org_id, nombre, whatsapp, dias_entrega, hora_limite)
  select x.id, v_org, btrim(x.nombre), x.whatsapp, coalesce(x.dias_entrega, '{}'), x.hora_limite
  from jsonb_to_recordset(coalesce(datos -> 'proveedores', '[]'))
    as x (id uuid, nombre text, whatsapp text, dias_entrega smallint[], hora_limite text);
  get diagnostics n_proveedores = row_count;

  insert into public.productos (id, org_id, proveedor_id, nombre, unidad_base_id)
  select x.id, v_org, x.proveedor_id, btrim(x.nombre), x.unidad_base_id
  from jsonb_to_recordset(coalesce(datos -> 'productos', '[]'))
    as x (id uuid, proveedor_id uuid, nombre text, unidad_base_id uuid);
  get diagnostics n_productos = row_count;

  insert into public.presentaciones (id, org_id, producto_id, nombre, factor_a_base, aproximada)
  select x.id, v_org, x.producto_id, btrim(x.nombre), x.factor_a_base, coalesce(x.aproximada, false)
  from jsonb_to_recordset(coalesce(datos -> 'presentaciones', '[]'))
    as x (id uuid, producto_id uuid, nombre text, factor_a_base numeric, aproximada boolean);
  get diagnostics n_presentaciones = row_count;

  insert into public.equivalencias (id, org_id, proveedor_id, texto_remito, producto_id)
  select x.id, v_org, x.proveedor_id, btrim(x.texto_remito), x.producto_id
  from jsonb_to_recordset(coalesce(datos -> 'equivalencias', '[]'))
    as x (id uuid, proveedor_id uuid, texto_remito text, producto_id uuid);
  get diagnostics n_equivalencias = row_count;

  insert into public.precios (id, org_id, proveedor_id, producto_id, precio_base, origen)
  select x.id, v_org, x.proveedor_id, x.producto_id, x.precio_base, 'importacion'
  from jsonb_to_recordset(coalesce(datos -> 'precios', '[]'))
    as x (id uuid, proveedor_id uuid, producto_id uuid, precio_base numeric);
  get diagnostics n_precios = row_count;

  return jsonb_build_object(
    'proveedores', n_proveedores,
    'productos', n_productos,
    'presentaciones', n_presentaciones,
    'equivalencias', n_equivalencias,
    'precios', n_precios
  );
end
$$;

revoke all on function public.importar_catalogo(jsonb) from public, anon;
grant execute on function public.importar_catalogo(jsonb) to authenticated;
