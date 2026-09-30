-- Etapa 2 — Ajustes al catálogo después de revisar los diseños.

-- "Pedir antes de" es texto libre, como en NuevoProveedor.dc.html ("18:00 del día anterior").
alter table public.proveedores drop constraint proveedores_hora_limite_check;
alter table public.proveedores add constraint proveedores_hora_limite_check
  check (length(btrim(hora_limite)) between 1 and 60);

-- Último precio de cada producto (con los permisos de quien consulta).
create view public.ultimos_precios
with (security_invoker = true)
as
select distinct on (p.producto_id)
  p.producto_id, p.proveedor_id, p.precio_base, p.fecha
from public.precios p
order by p.producto_id, p.fecha desc;

revoke all on public.ultimos_precios from anon;
grant select on public.ultimos_precios to authenticated;
