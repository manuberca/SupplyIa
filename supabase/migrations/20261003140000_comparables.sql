-- Comparar proveedores: el bar marca que un producto de un proveedor es "el mismo" que otro de
-- otro proveedor (los nombres casi nunca coinciden, así que no se puede adivinar). Los que
-- comparten comparable_id se comparan entre sí: quién lo vende más barato y cuánto se ahorraría.

alter table public.productos add column comparable_id uuid;
create index productos_comparable_id_idx on public.productos (comparable_id) where comparable_id is not null;

grant update (comparable_id) on public.productos to authenticated;

-- Solo se comparan productos del mismo bar, en la misma unidad y de proveedores distintos.
create function privado.validar_comparable()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.comparable_id is null then
    return new;
  end if;
  if exists (
    select 1 from public.productos p
    where p.comparable_id = new.comparable_id and p.id <> new.id and p.org_id <> new.org_id
  ) then
    raise exception 'Ese producto no es de esta organización.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.productos p
    where p.comparable_id = new.comparable_id and p.id <> new.id
      and p.unidad_base_id <> new.unidad_base_id
  ) then
    raise exception 'Para compararlos tienen que comprarse en la misma unidad.'
      using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.productos p
    where p.comparable_id = new.comparable_id and p.id <> new.id
      and p.proveedor_id = new.proveedor_id
  ) then
    raise exception 'Se comparan productos de proveedores distintos.' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger productos_validar_comparable
before insert or update of comparable_id, unidad_base_id, proveedor_id on public.productos
for each row execute function privado.validar_comparable();
