-- Etapa 4 — Tope de lecturas con IA por mes (SPEC §7.1).
-- La función del servidor (con la clave de servicio) reserva una lectura antes de llamar a la IA:
-- si el bar llegó al tope, no la reserva. Nadie más puede llamarla.

create function public.reservar_lectura(p_org uuid, p_mes text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_tope integer;
  v_usadas integer;
begin
  select o.tope_lecturas_mes into v_tope from public.organizaciones o where o.id = p_org;
  if v_tope is null then
    raise exception 'Organización inexistente.' using errcode = 'check_violation';
  end if;

  insert into public.uso_lecturas as u (org_id, mes, cantidad)
  values (p_org, p_mes, 1)
  on conflict (org_id, mes) do update set cantidad = u.cantidad + 1
    where u.cantidad < v_tope
  returning cantidad into v_usadas;

  if v_usadas is null then
    select u.cantidad into v_usadas from public.uso_lecturas u where u.org_id = p_org and u.mes = p_mes;
    return jsonb_build_object('ok', false, 'usadas', v_usadas, 'tope', v_tope);
  end if;
  return jsonb_build_object('ok', true, 'usadas', v_usadas, 'tope', v_tope);
end
$$;

-- Si la lectura falla por un error nuestro o de la IA, se devuelve (no cuenta).
create function public.devolver_lectura(p_org uuid, p_mes text)
returns void
language sql security definer set search_path = ''
as $$
  update public.uso_lecturas set cantidad = greatest(cantidad - 1, 0) where org_id = p_org and mes = p_mes
$$;

revoke all on function public.reservar_lectura(uuid, text), public.devolver_lectura(uuid, text) from public, anon, authenticated;
grant execute on function public.reservar_lectura(uuid, text), public.devolver_lectura(uuid, text) to service_role;
