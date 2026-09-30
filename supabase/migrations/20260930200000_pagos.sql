-- Etapa 6 — Pagos: cuándo se marcó pagado un pedido (lo pone la base, no se edita a mano).

alter table public.pedidos add column pagado_at timestamptz;

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
    or (v_desde_recepcion and old.estado in ('enviado', 'no_llego', 'recibido_parcial')
        and new.estado in ('recibido_parcial', 'revisar', 'a_pagar'))
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
