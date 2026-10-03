-- Corregir una recepción ya confirmada (un total mal cargado, una cantidad, un precio, un
-- producto mal asignado). Lo hace administración o el encargado, mientras el pedido no esté pagado.
-- No se pierde nada: antes de cambiarla, la recepción queda guardada tal como estaba en
-- recepcion_versiones. La corrección es idempotente (la cola sin conexión puede reintentarla).

alter table public.recepciones add column corregida_at timestamptz;

create table public.recepcion_versiones (
  id            uuid primary key,                       -- lo genera la app: el id de la corrección
  org_id        uuid not null references public.organizaciones (id) on delete restrict,
  recepcion_id  uuid not null references public.recepciones (id) on delete restrict,
  corregida_at  timestamptz not null default now(),
  corregida_por uuid not null default auth.uid() references auth.users (id) on delete restrict,
  -- La recepción, sus renglones y sus diferencias como estaban ANTES de esta corrección.
  anterior      jsonb not null
);

create index recepcion_versiones_recepcion_id_idx on public.recepcion_versiones (recepcion_id);
create index recepcion_versiones_org_id_idx on public.recepcion_versiones (org_id);

alter table public.recepcion_versiones enable row level security;
revoke all on public.recepcion_versiones from anon;
revoke insert, update, delete, truncate on public.recepcion_versiones from authenticated;

create policy "ver versiones de recepciones" on public.recepcion_versiones
  for select to authenticated
  using (org_id = (select privado.mi_org()) and exists (select 1 from public.recepciones r where r.id = recepcion_id));

-- ─── El pedido puede volver de "a pagar" a "revisar" (o al revés) al corregir su recepción ───

create or replace function privado.validar_cambio_estado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_desde_recepcion boolean := coalesce(current_setting('supplyia.desde_recepcion', true), '') = '1';
  v_desde_correccion boolean := coalesce(current_setting('supplyia.desde_correccion', true), '') = '1';
begin
  if new.estado is distinct from old.estado and not (
    (old.estado = 'borrador' and new.estado in ('enviado', 'cancelado'))
    or (old.estado = 'enviado' and new.estado in ('cancelado', 'no_llego'))
    or (old.estado = 'no_llego' and new.estado = 'enviado')
    or (v_desde_recepcion and old.estado in ('enviado', 'no_llego', 'recibido_parcial')
        and new.estado in ('recibido_parcial', 'revisar', 'a_pagar'))
    or (v_desde_correccion and old.estado in ('recibido_parcial', 'revisar', 'a_pagar')
        and new.estado in ('revisar', 'a_pagar'))
    or (old.estado = 'revisar' and new.estado = 'a_pagar')
    or (old.estado = 'a_pagar' and new.estado = 'pagado')
  ) then
    raise exception 'Un pedido % no puede pasar a %.', old.estado, new.estado using errcode = 'check_violation';
  end if;
  if new.estado = 'enviado' and new.enviado_at is null then
    new.enviado_at := now();
  end if;
  -- La fecha de pago la pone la base al marcarlo pagado.
  if new.estado = 'pagado' and old.estado is distinct from 'pagado' then
    new.pagado_at := now();
  end if;
  return new;
end
$$;

-- ─── Corregir ──────────────────────────────────────────────────────────────

create function public.corregir_recepcion(correccion jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := (correccion ->> 'id')::uuid;
  v_recepcion uuid := (correccion ->> 'recepcion_id')::uuid;
  v_org uuid := privado.mi_org();
  v_estado text := correccion ->> 'estado_pedido';
  r public.recepciones%rowtype;
  v_estado_pedido text;
  v_seguimiento jsonb;
begin
  if v_org is null or not privado.puede_pedir() then
    raise exception 'Corregir una recepción lo hace administración o el encargado.'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.recepcion_versiones v where v.id = v_id) then
    return jsonb_build_object('id', v_id, 'ya_estaba', true);
  end if;

  select * into r from public.recepciones x where x.id = v_recepcion and x.org_id = v_org for update;
  if not found or not privado.puede_ver_local(r.local_id) then
    raise exception 'No encontramos esa recepción.' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_array_length(coalesce(correccion -> 'items', '[]')) = 0 then
    raise exception 'La recepción no tiene renglones.' using errcode = 'check_violation';
  end if;
  if r.pedido_id is not null then
    select p.estado into v_estado_pedido from public.pedidos p where p.id = r.pedido_id;
    if v_estado_pedido in ('pagado', 'cancelado') then
      raise exception 'El pedido ya está %: la recepción no se puede corregir.', v_estado_pedido
        using errcode = 'check_violation';
    end if;
  end if;

  -- Cómo estaba, antes de tocar nada.
  insert into public.recepcion_versiones (id, org_id, recepcion_id, anterior)
  values (v_id, v_org, v_recepcion, jsonb_build_object(
    'recepcion', jsonb_build_object('nro_remito', r.nro_remito, 'total_remito', r.total_remito,
      'observaciones', r.observaciones, 'corregida_at', r.corregida_at),
    'estado_pedido', v_estado_pedido,
    'items', coalesce((select jsonb_agg(to_jsonb(i) - 'org_id' - 'recepcion_id')
                       from public.recepcion_items i where i.recepcion_id = v_recepcion), '[]'),
    'diferencias', coalesce((select jsonb_agg(to_jsonb(d) - 'org_id' - 'recepcion_id')
                             from public.diferencias d where d.recepcion_id = v_recepcion), '[]')));

  update public.recepciones set
    nro_remito = nullif(btrim(correccion ->> 'nro_remito'), ''),
    total_remito = (correccion ->> 'total_remito')::numeric,
    observaciones = nullif(btrim(correccion ->> 'observaciones'), ''),
    corregida_at = now()
  where id = v_recepcion;

  -- Los renglones y lo que sale de ellos (precios, diferencias) se arman de nuevo.
  -- El seguimiento de una diferencia que sigue existiendo (mismo producto y tipo) se conserva.
  select coalesce(jsonb_agg(jsonb_build_object('producto_id', d.producto_id, 'tipo', d.tipo, 'estado', d.estado)), '[]')
    into v_seguimiento from public.diferencias d where d.recepcion_id = v_recepcion;
  delete from public.diferencias where recepcion_id = v_recepcion;
  delete from public.precios where recepcion_id = v_recepcion;
  delete from public.recepcion_items where recepcion_id = v_recepcion;

  insert into public.recepcion_items (id, org_id, recepcion_id, producto_id, texto_remito, cantidad_pedida_base,
    cantidad_base, precio_unit_base, precio_anterior_base, subtotal, resultado)
  select x.id, v_org, v_recepcion, x.producto_id, coalesce(x.texto_remito, ''), x.cantidad_pedida_base,
    x.cantidad_base, x.precio_unit_base, x.precio_anterior_base, x.subtotal, x.resultado
  from jsonb_to_recordset(correccion -> 'items') as x (id uuid, producto_id uuid, texto_remito text,
    cantidad_pedida_base numeric, cantidad_base numeric, precio_unit_base numeric, precio_anterior_base numeric,
    subtotal numeric, resultado text);

  insert into public.precios (org_id, proveedor_id, producto_id, precio_base, fecha, origen, recepcion_id)
  select v_org, r.proveedor_id, i.producto_id, i.precio_unit_base, r.recibido_at, 'recepcion', v_recepcion
  from public.recepcion_items i
  where i.recepcion_id = v_recepcion and i.producto_id is not null and i.precio_unit_base > 0 and i.cantidad_base > 0;

  insert into public.diferencias (id, org_id, recepcion_id, producto_id, tipo, monto, detalle, estado)
  select x.id, v_org, v_recepcion, x.producto_id, x.tipo, x.monto, x.detalle,
    coalesce((select s ->> 'estado' from jsonb_array_elements(v_seguimiento) s
              where s ->> 'tipo' = x.tipo
                and (s ->> 'producto_id')::uuid is not distinct from x.producto_id limit 1), 'pendiente')
  from jsonb_to_recordset(coalesce(correccion -> 'diferencias', '[]'))
    as x (id uuid, producto_id uuid, tipo text, monto numeric, detalle text);

  -- Si al corregir se asignó un producto, la próxima lectura ya lo sabe.
  insert into public.equivalencias (org_id, proveedor_id, texto_remito, producto_id)
  select v_org, r.proveedor_id, btrim(i.texto_remito), i.producto_id
  from public.recepcion_items i
  where i.recepcion_id = v_recepcion and i.producto_id is not null and btrim(i.texto_remito) <> ''
  on conflict (proveedor_id, privado.normalizar(texto_remito)) do update set producto_id = excluded.producto_id;

  if r.pedido_id is not null and v_estado in ('revisar', 'a_pagar') then
    perform set_config('supplyia.desde_correccion', '1', true);
    update public.pedidos set estado = v_estado where id = r.pedido_id and estado is distinct from v_estado;
    perform set_config('supplyia.desde_correccion', '', true);
  end if;

  return jsonb_build_object('id', v_id, 'ya_estaba', false);
end
$$;

revoke all on function public.corregir_recepcion(jsonb) from public, anon;
grant execute on function public.corregir_recepcion(jsonb) to authenticated;
