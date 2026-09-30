-- Las funciones del servidor (clave de servicio) también escriben en el catálogo, y los índices
-- de nombres únicos usan privado.normalizar*: necesitan poder usarlas.

grant usage on schema privado to service_role;
grant execute on function privado.normalizar(text), privado.normalizar_unidad(text) to service_role;
