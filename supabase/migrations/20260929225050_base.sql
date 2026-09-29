-- Etapa 1 — Base: organizaciones, locales, miembros y ajustes, con Row Level Security.
-- Regla general: un usuario solo lee y escribe filas de su organización
-- (y de sus locales cuando corresponde). Ver SPEC.md §2 y §5.

-- ─── Tablas ────────────────────────────────────────────────────────────────

create table public.organizaciones (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null check (length(btrim(nombre)) between 1 and 120),
  plan              text not null default 'prueba',
  tope_lecturas_mes integer not null default 100 check (tope_lecturas_mes >= 0),
  creado_at         timestamptz not null default now()
);

create table public.locales (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete restrict,
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  activo boolean not null default true
);

create index locales_org_id_idx on public.locales (org_id);
create unique index locales_nombre_unico on public.locales (org_id, lower(btrim(nombre))) where activo;

-- Cada usuario pertenece a una sola organización.
create table public.miembros (
  user_id uuid primary key references auth.users (id) on delete cascade,
  org_id  uuid not null references public.organizaciones (id) on delete restrict,
  rol     text not null check (rol in ('admin', 'encargado', 'recepcion')),
  locales uuid[] check (locales is null or cardinality(locales) > 0), -- null = todos los locales
  nombre  text not null check (length(btrim(nombre)) between 1 and 120)
);

create index miembros_org_id_idx on public.miembros (org_id);

create table public.ajustes (
  org_id                uuid primary key references public.organizaciones (id) on delete restrict,
  umbral_alerta_pct     numeric(5, 2) not null default 10 check (umbral_alerta_pct between 0 and 100),
  tolerancia_peso_pct   numeric(5, 2) not null default 10 check (tolerancia_peso_pct between 0 and 100),
  tolerancia_unidad_pct numeric(5, 2) not null default 0 check (tolerancia_unidad_pct between 0 and 100)
);

-- ─── Funciones auxiliares para las políticas ───────────────────────────────
-- Van en un esquema que la API no expone. Son security definer para poder
-- leer miembros sin que las políticas de miembros se llamen a sí mismas.

create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated;

create function privado.mi_org()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.org_id from public.miembros m where m.user_id = (select auth.uid())
$$;

create function privado.mi_rol()
returns text
language sql stable security definer set search_path = ''
as $$
  select m.rol from public.miembros m where m.user_id = (select auth.uid())
$$;

create function privado.puede_ver_local(p_local uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.miembros m
    join public.locales l on l.org_id = m.org_id
    where m.user_id = (select auth.uid())
      and l.id = p_local
      and (m.locales is null or p_local = any (m.locales))
  )
$$;

revoke all on function privado.mi_org(), privado.mi_rol(), privado.puede_ver_local(uuid) from public;
grant execute on function privado.mi_org(), privado.mi_rol(), privado.puede_ver_local(uuid) to authenticated;

-- ─── Reglas que no dependen de quién escribe ───────────────────────────────

-- Toda organización nueva nace con sus ajustes por defecto.
create function privado.crear_ajustes_por_defecto()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.ajustes (org_id) values (new.id) on conflict do nothing;
  return new;
end
$$;

create trigger organizaciones_ajustes
after insert on public.organizaciones
for each row execute function privado.crear_ajustes_por_defecto();

-- Los locales asignados a un miembro tienen que ser de su misma organización.
create function privado.validar_locales_miembro()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.locales is not null and exists (
    select 1 from unnest(new.locales) as x(id)
    where not exists (select 1 from public.locales l where l.id = x.id and l.org_id = new.org_id)
  ) then
    raise exception 'Alguno de los locales elegidos no es de esta organización.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger miembros_validar_locales
before insert or update on public.miembros
for each row execute function privado.validar_locales_miembro();

-- Una organización nunca se queda sin administración.
create function privado.proteger_ultimo_admin()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.rol = 'admin'
     and (tg_op = 'DELETE' or new.rol <> 'admin' or new.org_id <> old.org_id)
     and not exists (
       select 1 from public.miembros m
       where m.org_id = old.org_id and m.rol = 'admin' and m.user_id <> old.user_id
     )
  then
    raise exception 'Tiene que quedar al menos una persona con rol de administración.'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end
$$;

create trigger miembros_ultimo_admin
before update or delete on public.miembros
for each row execute function privado.proteger_ultimo_admin();

-- ─── Row Level Security ────────────────────────────────────────────────────

alter table public.organizaciones enable row level security;
alter table public.locales        enable row level security;
alter table public.miembros       enable row level security;
alter table public.ajustes        enable row level security;

-- Sin sesión no se ve nada.
revoke all on public.organizaciones, public.locales, public.miembros, public.ajustes from anon;

-- organizaciones: se ve la propia; administración solo puede cambiar el nombre.
-- El alta, el plan y el tope de lecturas los maneja SupplyIA (clave de servicio).
revoke insert, update, delete on public.organizaciones from authenticated;
grant update (nombre) on public.organizaciones to authenticated;

create policy "ver mi organización" on public.organizaciones
  for select to authenticated
  using (id = (select privado.mi_org()));

create policy "administración cambia el nombre" on public.organizaciones
  for update to authenticated
  using (id = (select privado.mi_org()) and (select privado.mi_rol()) = 'admin')
  with check (id = (select privado.mi_org()));

-- locales: cada uno ve los suyos; administración da de alta y edita. No se borran: se archivan.
revoke delete on public.locales from authenticated;

create policy "ver mis locales" on public.locales
  for select to authenticated
  using ((select privado.puede_ver_local(id)));

create policy "administración crea locales" on public.locales
  for insert to authenticated
  with check (org_id = (select privado.mi_org()) and (select privado.mi_rol()) = 'admin');

create policy "administración edita locales" on public.locales
  for update to authenticated
  using (org_id = (select privado.mi_org()) and (select privado.mi_rol()) = 'admin')
  with check (org_id = (select privado.mi_org()));

-- miembros: cada uno se ve a sí mismo; administración ve y maneja al equipo.
-- Las altas se hacen por invitación desde una función del servidor (más adelante),
-- para que nadie pueda sumar a su organización a un usuario cualquiera.
revoke insert, update on public.miembros from authenticated;
grant update (rol, locales, nombre) on public.miembros to authenticated;

create policy "verme a mí" on public.miembros
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "administración ve al equipo" on public.miembros
  for select to authenticated
  using (org_id = (select privado.mi_org()) and (select privado.mi_rol()) = 'admin');

create policy "administración edita miembros" on public.miembros
  for update to authenticated
  using (org_id = (select privado.mi_org()) and (select privado.mi_rol()) = 'admin')
  with check (org_id = (select privado.mi_org()));

create policy "administración saca miembros" on public.miembros
  for delete to authenticated
  using (org_id = (select privado.mi_org()) and (select privado.mi_rol()) = 'admin');

-- ajustes: todos los de la organización los leen (hacen falta para las alertas);
-- solo administración los cambia. Se crean solos con la organización.
revoke insert, delete on public.ajustes from authenticated;

create policy "ver ajustes" on public.ajustes
  for select to authenticated
  using (org_id = (select privado.mi_org()));

create policy "administración cambia ajustes" on public.ajustes
  for update to authenticated
  using (org_id = (select privado.mi_org()) and (select privado.mi_rol()) = 'admin')
  with check (org_id = (select privado.mi_org()));
