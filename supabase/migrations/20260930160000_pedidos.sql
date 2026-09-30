-- Etapa 3 — Pedidos: pedidos y sus renglones, con numeración por organización y RLS por local.
-- Los pedidos se crean con guardar_pedido(), que es idempotente: la cola sin conexión
-- puede reintentar con el mismo id sin duplicar nada. Ver SPEC.md §5, §6 y §8.

-- ─── Tablas ────────────────────────────────────────────────────────────────

create table public.pedidos (
  id            uuid primary key,                         -- lo genera la app (cola sin conexión)
  org_id        uuid not null references public.organizaciones (id) on delete restrict,
  local_id      uuid not null references public.locales (id) on delete restrict,
  numero        integer not null,                         -- #0001, #0002… por organización; lo pone la base
  proveedor_id  uuid not null references public.proveedores (id) on delete restrict,
  estado        text not null default 'enviado' check (estado in (
                  'borrador', 'enviado', 'recibido_parcial', 'revisar', 'a_pagar', 'pagado', 'no_llego', 'cancelado')),
  observaciones text check (length(observaciones) <= 500),
  creado_por    uuid not null default auth.uid() references auth.users (id) on delete restrict,
  creado_at     timestamptz not null default now(),       -- cuándo se hizo en el celular
  subido_at     timestamptz not null default now(),       -- cuándo llegó a la base
  enviado_at    timestamptz
);

create unique index pedidos_numero_unico on public.pedidos (org_id, numero);
create index pedidos_org_estado_idx on public.pedidos (org_id, estado, creado_at desc);
create index pedidos_local_id_idx on public.pedidos (local_id);
create index pedidos_proveedor_id_idx on public.pedidos (proveedor_id);

create table public.pedido_items (
  id                   uuid primary key,
  org_id               uuid not null references public.organizaciones (id) on delete restrict,
  pedido_id            uuid not null references public.pedidos (id) on delete restrict,
  producto_id          uuid not null references public.productos (id) on delete restrict,
  presentacion_id      uuid references public.presentaciones (id) on delete restrict,
  cantidad             numeric(12, 3) not null check (cantidad > 0),
  cantidad_base        numeric(14, 4) not null check (cantidad_base > 0), -- la calcula la base
  precio_estimado_base numeric(14, 2) check (precio_estimado_base >= 0)
);

create index pedido_items_pedido_id_idx on public.pedido_items (pedido_id);
create index pedido_items_producto_id_idx on public.pedido_items (producto_id);
create index pedido_items_org_id_idx on public.pedido_items (org_id);

-- ─── Numeración ────────────────────────────────────────────────────────────

create table privado.contadores (
  org_id         uuid primary key references public.organizaciones (id) on delete restrict,
  ultimo_pedido  integer not null default 0
);

create function privado.numerar_pedido()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into privado.contadores as c (org_id, ultimo_pedido)
  values (new.org_id, 1)
  on conflict (org_id) do update set ultimo_pedido = c.ultimo_pedido + 1
  returning ultimo_pedido into new.numero;
  return new;
end
$$;

create trigger pedidos_numerar
before insert on public.pedidos
for each row execute function privado.numerar_pedido();

-- ─── Reglas que no dependen de quién escribe ───────────────────────────────

-- El local y el proveedor son de la organización; el proveedor está activo al pedir.
create function privado.validar_pedido()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.locales l where l.id = new.local_id and l.org_id = new.org_id) then
    raise exception 'Ese local no es de esta organización.' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.proveedores p where p.id = new.proveedor_id and p.org_id = new.org_id and p.activo
  ) then
    raise exception 'Ese proveedor no existe o está archivado.' using errcode = 'check_violation';
  end if;
  -- Un pedido hecho sin señal puede llegar tarde, pero no puede venir del futuro.
  if new.creado_at > now() + interval '10 minutes' then
    new.creado_at := now();
  end if;
  return new;
end
$$;

create trigger pedidos_validar
before insert on public.pedidos
for each row execute function privado.validar_pedido();

-- Estados que se pueden cambiar a mano en esta etapa (los de la recepción llegan en la etapa 4).
create function privado.validar_cambio_estado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.estado is distinct from old.estado and not (
    (old.estado = 'borrador' and new.estado in ('enviado', 'cancelado'))
    or (old.estado = 'enviado' and new.estado in ('cancelado', 'no_llego'))
    or (old.estado = 'no_llego' and new.estado = 'enviado')
  ) then
    raise exception 'Un pedido % no puede pasar a %.', old.estado, new.estado using errcode = 'check_violation';
  end if;
  if new.estado = 'enviado' and new.enviado_at is null then
    new.enviado_at := now();
  end if;
  return new;
end
$$;

create trigger pedidos_cambio_estado
before update on public.pedidos
for each row execute function privado.validar_cambio_estado();

-- Cada renglón es de un producto de ese proveedor, con una presentación de ese producto.
-- La cantidad base la calcula la base: 2 cajas de 10 kg = 20 kg (SPEC §6).
create function privado.validar_item_pedido()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_factor numeric;
begin
  if not exists (
    select 1
    from public.pedidos pe
    join public.productos pr on pr.proveedor_id = pe.proveedor_id and pr.org_id = pe.org_id
    where pe.id = new.pedido_id and pr.id = new.producto_id and pe.org_id = new.org_id
  ) then
    raise exception 'Ese producto no es del proveedor del pedido.' using errcode = 'check_violation';
  end if;

  if new.presentacion_id is null then
    v_factor := 1;
  else
    select p.factor_a_base into v_factor
    from public.presentaciones p
    where p.id = new.presentacion_id and p.producto_id = new.producto_id;
    if v_factor is null then
      raise exception 'Esa presentación no es de ese producto.' using errcode = 'check_violation';
    end if;
  end if;

  new.cantidad_base := round(new.cantidad * v_factor, 4);
  return new;
end
$$;

create trigger pedido_items_validar
before insert or update on public.pedido_items
for each row execute function privado.validar_item_pedido();

-- ─── Row Level Security ────────────────────────────────────────────────────

create function privado.puede_pedir()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(privado.mi_rol() in ('admin', 'encargado'), false)
$$;

revoke all on function privado.puede_pedir() from public;
grant execute on function privado.puede_pedir() to authenticated;

alter table public.pedidos      enable row level security;
alter table public.pedido_items enable row level security;

revoke all on public.pedidos, public.pedido_items from anon;
revoke delete, truncate, update on public.pedidos, public.pedido_items from authenticated;
-- A mano solo se cambia el estado y las observaciones; lo demás queda como se pidió.
grant update (estado, observaciones) on public.pedidos to authenticated;

-- Cada uno ve los pedidos de los locales que tiene (recepción incluida: ve los pedidos en curso).
create policy "ver pedidos de mis locales" on public.pedidos
  for select to authenticated
  using (org_id = (select privado.mi_org()) and (select privado.puede_ver_local(local_id)));

create policy "pedir en mis locales" on public.pedidos
  for insert to authenticated
  with check (
    org_id = (select privado.mi_org())
    and (select privado.puede_pedir())
    and (select privado.puede_ver_local(local_id))
    and creado_por = (select auth.uid())
  );

create policy "cambiar estado en mis locales" on public.pedidos
  for update to authenticated
  using (
    org_id = (select privado.mi_org())
    and (select privado.puede_pedir())
    and (select privado.puede_ver_local(local_id))
  )
  with check (org_id = (select privado.mi_org()));

-- Los renglones se ven si se ve el pedido (la política de pedidos se aplica en la subconsulta).
create policy "ver renglones" on public.pedido_items
  for select to authenticated
  using (
    org_id = (select privado.mi_org())
    and exists (select 1 from public.pedidos p where p.id = pedido_id)
  );

create policy "cargar renglones" on public.pedido_items
  for insert to authenticated
  with check (
    org_id = (select privado.mi_org())
    and (select privado.puede_pedir())
    and exists (select 1 from public.pedidos p where p.id = pedido_id)
  );

-- ─── Guardar un pedido entero (lo usa la cola sin conexión) ───────────────
-- Pedido y renglones en una sola transacción. Si el pedido ya existe (reintento con el
-- mismo id), no hace nada y devuelve el que está: así nunca se duplica.

create function public.guardar_pedido(pedido jsonb)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid := (pedido ->> 'id')::uuid;
  v_org uuid := privado.mi_org();
  v_numero integer;
begin
  if v_org is null or not privado.puede_pedir() then
    raise exception 'Solo administración o encargado pueden hacer pedidos.' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_array_length(coalesce(pedido -> 'items', '[]')) = 0 then
    raise exception 'El pedido no tiene productos.' using errcode = 'check_violation';
  end if;

  select p.numero into v_numero from public.pedidos p where p.id = v_id;
  if v_numero is not null then
    return jsonb_build_object('id', v_id, 'numero', v_numero, 'ya_estaba', true);
  end if;

  insert into public.pedidos (id, org_id, local_id, proveedor_id, estado, observaciones, creado_at, enviado_at)
  values (
    v_id,
    v_org,
    (pedido ->> 'local_id')::uuid,
    (pedido ->> 'proveedor_id')::uuid,
    'enviado',
    nullif(btrim(pedido ->> 'observaciones'), ''),
    coalesce((pedido ->> 'creado_at')::timestamptz, now()),
    coalesce((pedido ->> 'enviado_at')::timestamptz, now())
  )
  returning numero into v_numero;

  insert into public.pedido_items (id, org_id, pedido_id, producto_id, presentacion_id, cantidad, cantidad_base, precio_estimado_base)
  select x.id, v_org, v_id, x.producto_id, x.presentacion_id, x.cantidad, x.cantidad, x.precio_estimado_base
  from jsonb_to_recordset(pedido -> 'items')
    as x (id uuid, producto_id uuid, presentacion_id uuid, cantidad numeric, precio_estimado_base numeric);

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'ya_estaba', false);
end
$$;

revoke all on function public.guardar_pedido(jsonb) from public, anon;
grant execute on function public.guardar_pedido(jsonb) to authenticated;
