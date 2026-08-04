-- =============================================================================
-- Migración complementaria: Panel de Barrios y Zonas (A la Mano Mensajería)
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de la migración principal.
-- Agrega:
--   1. La zona "Zona Roja" (no disponible) en la tabla zonas
--   2. La columna `revisado` en barrios (seguimiento del formulario)
--   3. Políticas RLS para que la anon key pueda actualizar/insertar barrios
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permitir el tipo 'no_disponible' en zonas
-- -----------------------------------------------------------------------------
alter table zonas drop constraint if exists zonas_tipo_check;
alter table zonas add constraint zonas_tipo_check
    check (tipo in ('urbana', 'destino_solo', 'no_disponible'));

-- -----------------------------------------------------------------------------
-- 2. Zona Roja (barrios donde NO se presta servicio)
-- -----------------------------------------------------------------------------
insert into zonas (id, nombre, tipo, descripcion)
values ('zona_roja', 'No disponible — Zona Roja', 'no_disponible',
        'Barrios o zonas donde el servicio de domicilio no está disponible')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Seguimiento de revisión en barrios
-- -----------------------------------------------------------------------------
alter table barrios add column if not exists revisado boolean not null default false;

-- -----------------------------------------------------------------------------
-- 4. Políticas RLS para escritura con la anon key
--    ⚠  ADVERTENCIA: esto permite a cualquiera con la anon key modificar
--    barrios (decisión elegida: panel sin contraseña). Para producción se
--    recomienda restringir por rol admin.
-- -----------------------------------------------------------------------------
drop policy if exists "barrios_anon_write" on barrios;
create policy "barrios_anon_write" on barrios
    for all using (true) with check (true);
