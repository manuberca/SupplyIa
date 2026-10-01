-- Etapa 7 — Equipo y locales desde Ajustes.
-- · Un miembro se da de baja sin borrarlo (activo = false): pierde el acceso y queda en el historial.
-- · Administración ve el mail de su equipo (se copia de auth.users al invitar).
-- · Las altas siguen siendo solo desde el servidor (función /api/equipo, con la clave de servicio).
-- · Siempre queda al menos un local activo.

alter table public.miembros add column activo boolean not null default true;
alter table public.miembros add column email text check (email is null or length(email) <= 320);

update public.miembros m set email = lower(u.email) from auth.users u where u.id = m.user_id;

-- ─── Un miembro dado de baja no tiene organización ni rol: todas las políticas lo dejan afuera ───

create or replace function privado.mi_org()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.org_id from public.miembros m where m.user_id = (select auth.uid()) and m.activo
$$;

create or replace function privado.mi_rol()
returns text
language sql stable security definer set search_path = ''
as $$
  select m.rol from public.miembros m where m.user_id = (select auth.uid()) and m.activo
$$;

create or replace function privado.puede_ver_local(p_local uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.miembros m
    join public.locales l on l.org_id = m.org_id
    where m.user_id = (select auth.uid())
      and m.activo
      and l.id = p_local
      and (m.locales is null or p_local = any (m.locales))
  )
$$;

-- ─── Siempre queda una persona activa con rol de administración, y nadie se da de baja solo ───

create or replace function privado.proteger_ultimo_admin()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.activo and not new.activo and old.user_id = (select auth.uid()) then
    raise exception 'No podés darte de baja a vos mismo.' using errcode = 'check_violation';
  end if;
  if old.rol = 'admin' and old.activo
     and (tg_op = 'DELETE' or new.rol <> 'admin' or new.org_id <> old.org_id or not new.activo)
     and not exists (
       select 1 from public.miembros m
       where m.org_id = old.org_id and m.rol = 'admin' and m.activo and m.user_id <> old.user_id
     )
  then
    raise exception 'Tiene que quedar al menos una persona con rol de administración.'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end
$$;

-- Administración da de baja y reactiva; ya no borra miembros (nada se borra: se da de baja).
grant update (activo) on public.miembros to authenticated;
drop policy "administración saca miembros" on public.miembros;
revoke delete on public.miembros from authenticated;

-- ─── Solo para el servidor: buscar un usuario por mail al invitar ───

create function public.usuario_por_email(p_email text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1
$$;

revoke all on function public.usuario_por_email(text) from public, anon, authenticated;
grant execute on function public.usuario_por_email(text) to service_role;

-- ─── Locales: siempre queda al menos uno activo ───

create function privado.proteger_ultimo_local()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.activo and not new.activo and not exists (
    select 1 from public.locales l where l.org_id = old.org_id and l.activo and l.id <> old.id
  ) then
    raise exception 'Tiene que quedar al menos un local activo.' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger locales_ultimo_activo
before update on public.locales
for each row execute function privado.proteger_ultimo_local();
