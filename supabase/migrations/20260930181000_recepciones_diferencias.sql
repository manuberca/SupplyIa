-- Etapa 4 — Una diferencia solo puede referirse a un producto de la misma organización.

create function privado.validar_diferencia()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.producto_id is not null and not exists (
    select 1 from public.productos p where p.id = new.producto_id and p.org_id = new.org_id
  ) then
    raise exception 'Ese producto no es de esta organización.' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger diferencias_validar
before insert or update on public.diferencias
for each row execute function privado.validar_diferencia();
