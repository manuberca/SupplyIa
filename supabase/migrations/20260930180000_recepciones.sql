-- Etapa 4 — Recepción: recepciones y sus renglones, diferencias, aprendizaje de la IA,
-- uso de lecturas y fotos de remitos. Ver SPEC.md §5, §6, §7 y §8.
-- Una recepción se guarda entera con confirmar_recepcion(), que es idempotente (la cola
-- sin conexión puede reintentarla) y además registra precios, diferencias y equivalencias
-- y actualiza el estado del pedido.

-- ─── Tablas ────────────────────────────────────────────────────────────────

create table public.recepciones (
  id             uuid primary key,                      -- lo genera la app
  org_id         uuid not null references public.organizaciones (id) on delete restrict,
  local_id       uuid not null references public.locales (id) on delete restrict,
  pedido_id      uuid references public.pedidos (id) on delete restrict,
  proveedor_id   uuid not null references public.proveedores (id) on delete restrict,
  recibido_at    timestamptz not null default now(),    -- cuándo llegó (en el celular)
  recibido_por   uuid not null default auth.uid() references auth.users (id) on delete restrict,
  subido_at      timestamptz not null default now(),
  origen         text not null check (origen in ('ia', 'manual')),
  foto_path      text,                                  -- en el bucket "remitos": <org_id>/<id>.jpg
  nro_remito     text check (length(nro_remito) <= 60),
  fecha_remito   date,
  total_remito   numeric(14, 2) check (total_remito >= 0),
  lectura_ia     jsonb,                                 -- lo que devolvió la IA, tal cual (para auditar y aprender)
  observaciones  text check (length(observaciones) <= 500),
  confirmada     boolean not null default true
);

create index recepciones_org_idx on public.recepciones (org_id, recibido_at desc);
create index recepciones_local_id_idx on public.recepciones (local_id);
create index recepciones_pedido_id_idx on public.recepciones (pedido_id);
create index recepciones_proveedor_remito_idx on public.recepciones (proveedor_id, nro_remito);

create table public.recepcion_items (
  id                  uuid primary key,
  org_id              uuid not null references public.organizaciones (id) on delete restrict,
  recepcion_id        uuid not null references public.recepciones (id) on delete restrict,
  producto_id         uuid references public.productos (id) on delete restrict,  -- null: no se pudo asignar
  texto_remito        text not null default '' check (length(texto_remito) <= 200),
  cantidad_pedida_base numeric(14, 4) check (cantidad_pedida_base >= 0),
  cantidad_base       numeric(14, 4) check (cantidad_base >= 0),                -- lo que llegó
  precio_unit_base    numeric(14, 2) check (precio_unit_base >= 0),
  precio_anterior_base numeric(14, 2) check (precio_anterior_base >= 0),
  subtotal            numeric(14, 2) check (subtotal >= 0),
  resultado           text not null check (resultado in ('ok', 'faltante', 'exceso', 'precio_subio', 'precio_bajo', 'no_pedido'))
);

create index recepcion_items_recepcion_id_idx on public.recepcion_items (recepcion_id);
create index recepcion_items_producto_id_idx on public.recepcion_items (producto_id);
create index recepcion_items_org_id_idx on public.recepcion_items (org_id);

create table public.diferencias (
  id            uuid primary key,
  org_id        uuid not null references public.organizaciones (id) on delete restrict,
  recepcion_id  uuid not null references public.recepciones (id) on delete restrict,
  producto_id   uuid references public.productos (id) on delete restrict,
  tipo          text not null check (tipo in ('faltante', 'exceso', 'precio')),
  monto         numeric(14, 2),                         -- plata en juego (positivo: a favor del bar)
  detalle       text not null check (length(detalle) between 1 and 300),
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'reclamado', 'nota_credito', 'resuelto')),
  creado_at     timestamptz not null default now()
);

create index diferencias_org_estado_idx on public.diferencias (org_id, estado);
create index diferencias_recepcion_id_idx on public.diferencias (recepcion_id);

-- Lo que la persona corrigió de la lectura: la IA lo recibe como contexto la próxima vez.
create table public.correcciones_ocr (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizaciones (id) on delete restrict,
  proveedor_id uuid not null references public.proveedores (id) on delete restrict,
  campo        text not null check (length(campo) <= 60),
  detectado    text check (length(detectado) <= 200),
  correcto     text check (length(correcto) <= 200),
  creado_at    timestamptz not null default now()
);

create index correcciones_ocr_proveedor_idx on public.correcciones_ocr (proveedor_id, creado_at desc);
create index correcciones_ocr_org_id_idx on public.correcciones_ocr (org_id);

-- Lecturas con IA por mes (las suma la función del servidor, con la clave de servicio).
create table public.uso_lecturas (
  org_id   uuid not null references public.organizaciones (id) on delete restrict,
  mes      text not null check (mes ~ '^\d{4}-\d{2}$'),
  cantidad integer not null default 0 check (cantidad >= 0),
  primary key (org_id, mes)
);

alter table public.precios
  add constraint precios_recepcion_id_fkey foreign key (recepcion_id) references public.recepciones (id) on delete restrict;
create index precios_recepcion_id_idx on public.precios (recepcion_id);

-- ─── Reglas ────────────────────────────────────────────────────────────────

-- Local, proveedor y pedido de la recepción son de la organización (y el pedido, de ese proveedor y local).
create function privado.validar_recepcion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.locales l where l.id = new.local_id and l.org_id = new.org_id) then
    raise exception 'Ese local no es de esta organización.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.proveedores p where p.id = new.proveedor_id and p.org_id = new.org_id) then
    raise exception 'Ese proveedor no es de esta organización.' using errcode = 'check_violation';
  end if;
  if new.pedido_id is not null and not exists (
    select 1 from public.pedidos pe
    where pe.id = new.pedido_id and pe.org_id = new.org_id
      and pe.proveedor_id = new.proveedor_id and pe.local_id = new.local_id
  ) then
    raise exception 'Ese pedido no es de este proveedor y local.' using errcode = 'check_violation';
  end if;
  if new.recibido_at > now() + interval '10 minutes' then
    new.recibido_at := now();
  end if;
  return new;
end
$$;

create trigger recepciones_validar
before insert on public.recepciones
for each row execute function privado.validar_recepcion();

-- Cada renglón con producto: del mismo proveedor que la recepción.
create function privado.validar_item_recepcion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.recepciones r where r.id = new.recepcion_id and r.org_id = new.org_id) then
    raise exception 'Esa recepción no es de esta organización.' using errcode = 'check_violation';
  end if;
  if new.producto_id is not null and not exists (
    select 1 from public.recepciones r
    join public.productos p on p.proveedor_id = r.proveedor_id
    where r.id = new.recepcion_id and p.id = new.producto_id
  ) then
    raise exception 'Ese producto no es del proveedor del remito.' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger recepcion_items_validar
before insert on public.recepcion_items
for each row execute function privado.validar_item_recepcion();

-- Estados del pedido: los manuales de la etapa 3, más los que pone una recepción y el pago.
create or replace function privado.validar_cambio_estado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_desde_recepcion boolean := coalesce(current_setting('supplyia.desde_recepcion', true), '') = '1';
begin
  if new.estado is distinct from old.estado and not (
    (old.estado = 'borrador' and new.estado in ('enviado', 'cancelado'))
    or (old.estado = 'enviado' and new.estado in ('cancelado', 'no_llego'))
    or (old.estado = 'no_llego' and new.estado = 'enviado')
    -- Una recepción confirmada lo cierra (solo desde confirmar_recepcion).
    or (v_desde_recepcion and old.estado in ('enviado', 'no_llego', 'recibido_parcial')
        and new.estado in ('recibido_parcial', 'revisar', 'a_pagar'))
    -- Resuelto lo que había para revisar, queda a pagar; y después, pagado.
    or (old.estado = 'revisar' and new.estado = 'a_pagar')
    or (old.estado = 'a_pagar' and new.estado = 'pagado')
  ) then
    raise exception 'Un pedido % no puede pasar a %.', old.estado, new.estado using errcode = 'check_violation';
  end if;
  if new.estado = 'enviado' and new.enviado_at is null then
    new.enviado_at := now();
  end if;
  return new;
end
$$;

-- ─── Row Level Security ────────────────────────────────────────────────────

alter table public.recepciones      enable row level security;
alter table public.recepcion_items  enable row level security;
alter table public.diferencias      enable row level security;
alter table public.correcciones_ocr enable row level security;
alter table public.uso_lecturas     enable row level security;

revoke all on public.recepciones, public.recepcion_items, public.diferencias,
  public.correcciones_ocr, public.uso_lecturas from anon;
-- Todo se escribe por confirmar_recepcion() (y el uso, por la función del servidor).
revoke insert, update, delete, truncate on public.recepciones, public.recepcion_items, public.diferencias,
  public.correcciones_ocr, public.uso_lecturas from authenticated;
-- A mano solo cambia el estado de una diferencia (reclamado, nota de crédito, resuelto).
grant update (estado) on public.diferencias to authenticated;

create policy "ver recepciones de mis locales" on public.recepciones
  for select to authenticated
  using (org_id = (select privado.mi_org()) and (select privado.puede_ver_local(local_id)));

create policy "ver renglones de recepción" on public.recepcion_items
  for select to authenticated
  using (org_id = (select privado.mi_org()) and exists (select 1 from public.recepciones r where r.id = recepcion_id));

create policy "ver diferencias" on public.diferencias
  for select to authenticated
  using (org_id = (select privado.mi_org()) and exists (select 1 from public.recepciones r where r.id = recepcion_id));

create policy "administración y encargado resuelven diferencias" on public.diferencias
  for update to authenticated
  using (org_id = (select privado.mi_org()) and (select privado.puede_pedir())
         and exists (select 1 from public.recepciones r where r.id = recepcion_id))
  with check (org_id = (select privado.mi_org()));

create policy "ver correcciones" on public.correcciones_ocr
  for select to authenticated using (org_id = (select privado.mi_org()));

create policy "administración ve el uso" on public.uso_lecturas
  for select to authenticated using (org_id = (select privado.mi_org()) and (select privado.mi_rol()) = 'admin');

-- ─── Confirmar una recepción ───────────────────────────────────────────────
-- Security definer: la usa también recepción, que no carga precios ni equivalencias a mano.
-- Por eso valida todo explícitamente: organización, local y rol.

create function public.confirmar_recepcion(recepcion jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := (recepcion ->> 'id')::uuid;
  v_org uuid := privado.mi_org();
  v_local uuid := (recepcion ->> 'local_id')::uuid;
  v_proveedor uuid := (recepcion ->> 'proveedor_id')::uuid;
  v_pedido uuid := nullif(recepcion ->> 'pedido_id', '')::uuid;
  v_estado text := recepcion ->> 'estado_pedido';
  v_recibido timestamptz := coalesce((recepcion ->> 'recibido_at')::timestamptz, now());
begin
  if v_org is null or not privado.puede_ver_local(v_local) then
    raise exception 'No tenés acceso a ese local.' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.recepciones r where r.id = v_id) then
    return jsonb_build_object('id', v_id, 'ya_estaba', true);
  end if;
  if jsonb_array_length(coalesce(recepcion -> 'items', '[]')) = 0 then
    raise exception 'La recepción no tiene renglones.' using errcode = 'check_violation';
  end if;

  insert into public.recepciones (id, org_id, local_id, pedido_id, proveedor_id, recibido_at, recibido_por, origen,
    foto_path, nro_remito, fecha_remito, total_remito, lectura_ia, observaciones)
  values (v_id, v_org, v_local, v_pedido, v_proveedor, v_recibido, auth.uid(), recepcion ->> 'origen',
    nullif(recepcion ->> 'foto_path', ''), nullif(btrim(recepcion ->> 'nro_remito'), ''),
    (recepcion ->> 'fecha_remito')::date, (recepcion ->> 'total_remito')::numeric,
    recepcion -> 'lectura_ia', nullif(btrim(recepcion ->> 'observaciones'), ''));

  insert into public.recepcion_items (id, org_id, recepcion_id, producto_id, texto_remito, cantidad_pedida_base,
    cantidad_base, precio_unit_base, precio_anterior_base, subtotal, resultado)
  select x.id, v_org, v_id, x.producto_id, coalesce(x.texto_remito, ''), x.cantidad_pedida_base,
    x.cantidad_base, x.precio_unit_base, x.precio_anterior_base, x.subtotal, x.resultado
  from jsonb_to_recordset(recepcion -> 'items') as x (id uuid, producto_id uuid, texto_remito text,
    cantidad_pedida_base numeric, cantidad_base numeric, precio_unit_base numeric, precio_anterior_base numeric,
    subtotal numeric, resultado text);

  -- Historial de precios: lo que se pagó por unidad base en este remito.
  insert into public.precios (org_id, proveedor_id, producto_id, precio_base, fecha, origen, recepcion_id)
  select v_org, v_proveedor, i.producto_id, i.precio_unit_base, v_recibido, 'recepcion', v_id
  from public.recepcion_items i
  where i.recepcion_id = v_id and i.producto_id is not null and i.precio_unit_base > 0 and i.cantidad_base > 0;

  insert into public.diferencias (id, org_id, recepcion_id, producto_id, tipo, monto, detalle)
  select x.id, v_org, v_id, x.producto_id, x.tipo, x.monto, x.detalle
  from jsonb_to_recordset(coalesce(recepcion -> 'diferencias', '[]'))
    as x (id uuid, producto_id uuid, tipo text, monto numeric, detalle text);

  -- Aprendizaje: cómo figura cada producto en el remito de este proveedor.
  insert into public.equivalencias (org_id, proveedor_id, texto_remito, producto_id)
  select v_org, v_proveedor, btrim(i.texto_remito), i.producto_id
  from public.recepcion_items i
  where i.recepcion_id = v_id and i.producto_id is not null and btrim(i.texto_remito) <> ''
  on conflict (proveedor_id, privado.normalizar(texto_remito)) do update set producto_id = excluded.producto_id;

  insert into public.correcciones_ocr (org_id, proveedor_id, campo, detectado, correcto)
  select v_org, v_proveedor, x.campo, x.detectado, x.correcto
  from jsonb_to_recordset(coalesce(recepcion -> 'correcciones', '[]'))
    as x (campo text, detectado text, correcto text);

  -- El pedido queda a pagar, para revisar o recibido en parte.
  if v_pedido is not null and v_estado is not null then
    perform set_config('supplyia.desde_recepcion', '1', true);
    update public.pedidos set estado = v_estado where id = v_pedido and estado is distinct from v_estado;
    perform set_config('supplyia.desde_recepcion', '', true);
  end if;

  return jsonb_build_object('id', v_id, 'ya_estaba', false);
end
$$;

revoke all on function public.confirmar_recepcion(jsonb) from public, anon;
grant execute on function public.confirmar_recepcion(jsonb) to authenticated;

-- ─── Fotos de remitos (Supabase Storage) ───────────────────────────────────
-- Carpeta privada por organización: remitos/<org_id>/<recepcion_id>.jpg

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('remitos', 'remitos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "subir fotos de remitos de mi organización" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'remitos' and (storage.foldername(name))[1] = (select privado.mi_org())::text);

create policy "ver fotos de remitos de mi organización" on storage.objects
  for select to authenticated
  using (bucket_id = 'remitos' and (storage.foldername(name))[1] = (select privado.mi_org())::text);
