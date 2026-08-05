-- =============================================================================
-- Migración: Administradores + Zonas + Matriz de Tarifas (A la Mano Mensajería)
-- Ejecutar en el SQL Editor de Supabase, DESPUÉS de migracion_panel_barrios.sql
--
-- Agrega:
--   1. Tabla `admins` + función `es_admin()` → solo administradores escriben
--   2. Zonas adicionales (Villa Inglesa, Caño Cristales, Setta Departamental)
--   3. Tabla `tarifas` (matriz zona_origen × zona_destino → valor)
--   4. Función `calcular_tarifa()` reescrita para leer de la matriz
--   5. Políticas RLS: lectura pública / escritura solo admin
--   6. Semillas con las tarifas 2026 (Tarifas 2026.md)
--
-- ⚠ Después de ejecutar esta migración, el panel de barrios existente dejará
--   de permitir escritura con la anon key (ya no hay política "barrios_anon_write").
--   Solo usuarios listados en `admins` pueden modificar barrios/zonas/tarifas/recargos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabla de administradores
-- -----------------------------------------------------------------------------
create table if not exists public.admins (
    user_id    uuid primary key references auth.users (id) on delete cascade,
    email      text,
    created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Nadie inserta/actualiza admins desde el cliente: se gestiona por SQL aquí.
-- (Los roles se asignan con los INSERTs de abajo o con el snippet del final).
drop policy if exists "admins_solo_lectura_autenticados" on public.admins;
create policy "admins_solo_lectura_autenticados" on public.admins
    for select using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 2. Función auxiliar: ¿el usuario autenticado es administrador?
--    security definer → puede leer `admins` aunque el cliente no tenga permiso.
-- -----------------------------------------------------------------------------
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- 3. Zonas adicionales (solo si aún no existen; la migración principal
--    ya crea centro, norte_*, sur_*, etc.)
-- -----------------------------------------------------------------------------
insert into public.zonas (id, nombre, tipo, descripcion)
values
    ('villa_inglesa',      'Nuevo Berlin, Villa Inglesa y Nogal de las Américas', 'urbana',
     'Destinos especiales: Nuevo Berlin, Villa Inglesa y Nogal de las Américas'),
    ('cano_cristales',     'Caño Cristales, Río Verde y Río Claro',               'urbana',
     'Destinos especiales: Caño Cristales, Río Verde y Río Claro'),
    ('setta_departamental','Setta Departamental y La Primavera',                  'urbana',
     'Sector departamental: Setta Departamental y La Primavera')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 4. Matriz de tarifas: zona origen × zona destino → valor
-- -----------------------------------------------------------------------------
create table if not exists public.tarifas (
    id               uuid primary key default gen_random_uuid(),
    zona_origen_id   text not null references public.zonas (id) on delete cascade,
    zona_destino_id  text not null references public.zonas (id) on delete cascade,
    valor            integer not null check (valor >= 0),
    updated_at       timestamptz not null default now(),
    unique (zona_origen_id, zona_destino_id)
);

create index if not exists tarifas_destino_idx on public.tarifas (zona_destino_id);

-- -----------------------------------------------------------------------------
-- 5. Función calcular_tarifa (reescrita para leer de la matriz `tarifas`)
--    Misma firma que usaba la calculadora: p_barrio_origen, p_barrio_destino
--
--    ⚠ IMPORTANTE: esta sección SOBRESCRIBE la función calcular_tarifa() que
--      existía (la definición original está solo en el SQL Editor de Supabase,
--      no en este repo). Antes de ejecutar, revisa la definición actual para
--      asegurarte de que no maneja lógica adicional (p. ej. tarifas de pueblos:
--      Barcelona, Calarcá, Circasia, etc.) que debas conservar. La nueva versión
--      resuelve barrio → zona → matriz `tarifas`. Si tu operación usa pueblos,
--      créalos como zonas con su fila en `tarifas` desde el panel de administración.
-- -----------------------------------------------------------------------------
drop function if exists public.calcular_tarifa(uuid, uuid);
drop function if exists public.calcular_tarifa(text, text);

create function public.calcular_tarifa(p_barrio_origen text, p_barrio_destino text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_zona_origen  text;
    v_zona_destino text;
    v_valor        integer;
begin
    select b.zona_id into v_zona_origen
    from public.barrios b where b.id::text = p_barrio_origen::text;

    select b.zona_id into v_zona_destino
    from public.barrios b where b.id::text = p_barrio_destino::text;

    if v_zona_origen is null or v_zona_destino is null then
        return null; -- barrio no registrado
    end if;

    if v_zona_origen = 'zona_roja' or v_zona_destino = 'zona_roja' then
        return null; -- servicio no disponible
    end if;

    -- Búsqueda directa; si no existe, se intenta el sentido inverso (matriz simétrica)
    select t.valor into v_valor
    from public.tarifas t
    where t.zona_origen_id = v_zona_origen and t.zona_destino_id = v_zona_destino;

    if v_valor is null then
        select t.valor into v_valor
        from public.tarifas t
        where t.zona_origen_id = v_zona_destino and t.zona_destino_id = v_zona_origen;
    end if;

    return v_valor;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Políticas RLS: lectura pública / escritura SOLO administradores
-- -----------------------------------------------------------------------------

-- Zonas
alter table public.zonas enable row level security;
drop policy if exists "zonas_select_public" on public.zonas;
drop policy if exists "zonas_write_admin" on public.zonas;
create policy "zonas_select_public" on public.zonas
    for select using (true);
create policy "zonas_write_admin" on public.zonas
    for all using (public.es_admin()) with check (public.es_admin());

-- Tarifas
alter table public.tarifas enable row level security;
drop policy if exists "tarifas_select_public" on public.tarifas;
drop policy if exists "tarifas_write_admin" on public.tarifas;
create policy "tarifas_select_public" on public.tarifas
    for select using (true);
create policy "tarifas_write_admin" on public.tarifas
    for all using (public.es_admin()) with check (public.es_admin());

-- Barrios: se REEMPLAZA la política abierta "barrios_anon_write" por una de admin
alter table public.barrios enable row level security;
drop policy if exists "barrios_anon_write" on public.barrios;
drop policy if exists "barrios_select_public" on public.barrios;
drop policy if exists "barrios_write_admin" on public.barrios;
create policy "barrios_select_public" on public.barrios
    for select using (true);
create policy "barrios_write_admin" on public.barrios
    for all using (public.es_admin()) with check (public.es_admin());

-- Recargos
alter table public.recargos enable row level security;
drop policy if exists "recargos_select_public" on public.recargos;
drop policy if exists "recargos_write_admin" on public.recargos;
create policy "recargos_select_public" on public.recargos
    for select using (true);
create policy "recargos_write_admin" on public.recargos
    for all using (public.es_admin()) with check (public.es_admin());

-- -----------------------------------------------------------------------------
-- 7. Semillas: tarifas 2026 (Tarifas 2026.md) — origen → destino
--    La diagonal (mismo sector) y el sentido inverso se completan al final.
-- -----------------------------------------------------------------------------
insert into public.tarifas (zona_origen_id, zona_destino_id, valor) values
-- Centro (origen)
('centro','villa_inglesa',      7000),
('centro','sur_27_50',          6000),
('centro','sur_despues_naranjos',7000),
('centro','sur_despues_puerto_espejo',8000),
('centro','cano_cristales',     9000),
('centro','norte_1_18',         6000),
('centro','norte_19_37',        7000),
('centro','norte_38_50',        8000),
('centro','setta_departamental',9000),
-- Calle 38 Norte - Calle 50 Norte (origen)
('norte_38_50','norte_19_37',   6000),
('norte_38_50','norte_1_18',    7000),
('norte_38_50','centro',        8000),
('norte_38_50','villa_inglesa', 9000),
('norte_38_50','sur_27_50',     9000),
('norte_38_50','sur_despues_naranjos',10000),
('norte_38_50','cano_cristales',12000),
-- Calle 19 Norte - Calle 37 Norte (origen)
('norte_19_37','norte_38_50',   6000),
('norte_19_37','norte_1_18',    6000),
('norte_19_37','setta_departamental',7000),
('norte_19_37','centro',        7000),
('norte_19_37','villa_inglesa', 8000),
('norte_19_37','sur_27_50',     8000),
('norte_19_37','sur_despues_naranjos',9000),
('norte_19_37','sur_despues_puerto_espejo',10000),
('norte_19_37','cano_cristales',11000),
-- Calle 1 Norte - Calle 18 Norte (origen)
('norte_1_18','norte_19_37',    6000),
('norte_1_18','norte_38_50',    7000),
('norte_1_18','setta_departamental',8000),
('norte_1_18','centro',         6000),
('norte_1_18','villa_inglesa',  7000),
('norte_1_18','sur_27_50',      7000),
('norte_1_18','sur_despues_naranjos',8000),
('norte_1_18','sur_despues_puerto_espejo',9000),
('norte_1_18','cano_cristales', 10000),
-- Calle 27 - Calle 50, Sur (origen)
('sur_27_50','sur_despues_naranjos',6000),
('sur_27_50','sur_despues_puerto_espejo',7000),
('sur_27_50','centro',          6000),
('sur_27_50','villa_inglesa',   7000),
('sur_27_50','norte_1_18',      7000),
('sur_27_50','norte_19_37',     8000),
('sur_27_50','norte_38_50',     9000),
('sur_27_50','setta_departamental',10000),
('sur_27_50','cano_cristales',  8000),
-- Después de los Naranjos y Platinos (origen)
('sur_despues_naranjos','sur_despues_puerto_espejo',6000),
('sur_despues_naranjos','centro',7000),
('sur_despues_naranjos','villa_inglesa',8000),
('sur_despues_naranjos','norte_1_18',8000),
('sur_despues_naranjos','norte_19_37',9000),
('sur_despues_naranjos','norte_38_50',10000),
('sur_despues_naranjos','setta_departamental',11000),
('sur_despues_naranjos','cano_cristales',7000),
-- Después de Puerto Espejo y Cementerio (origen)
('sur_despues_puerto_espejo','sur_27_50',6000),
('sur_despues_puerto_espejo','sur_despues_naranjos',7000),
('sur_despues_puerto_espejo','centro',8000),
('sur_despues_puerto_espejo','villa_inglesa',9000),
('sur_despues_puerto_espejo','norte_1_18',9000),
('sur_despues_puerto_espejo','norte_19_37',10000),
('sur_despues_puerto_espejo','norte_38_50',11000),
('sur_despues_puerto_espejo','setta_departamental',12000),
('sur_despues_puerto_espejo','cano_cristales',7000)
on conflict (zona_origen_id, zona_destino_id) do update set valor = excluded.valor, updated_at = now();

-- Completar la diagonal ("mismo sector" = $5.000) y el sentido inverso
-- para que la matriz quede simétrica (el panel la muestra completa).
do $$
declare
    z record;
    d record;
    v integer;
begin
    for z in select id from public.zonas where id <> 'zona_roja' loop
        insert into public.tarifas (zona_origen_id, zona_destino_id, valor)
        values (z.id, z.id, 5000)
        on conflict (zona_origen_id, zona_destino_id) do nothing;

        for d in select id from public.zonas where id <> 'zona_roja' and id <> z.id loop
            select t.valor into v from public.tarifas t
            where t.zona_origen_id = z.id and t.zona_destino_id = d.id;
            if v is not null then
                insert into public.tarifas (zona_origen_id, zona_destino_id, valor)
                values (d.id, z.id, v)
                on conflict (zona_origen_id, zona_destino_id) do nothing;
            end if;
        end loop;
    end loop;
end;
$$;

-- =============================================================================
-- CÓMO CREAR UN ADMINISTRADOR
-- -----------------------------------------------------------------------------
-- 1) Crea el usuario en Supabase: Authentication → Users → Add user
--    (email + contraseña). O bien usa "Invite user".
-- 2) Reemplaza el email de abajo por el del usuario y ejecútalo:
--
--    insert into public.admins (user_id, email)
--    select id, email from auth.users where email = 'admin@tudominio.com'
--    on conflict (user_id) do nothing;
--
-- Para agregar más administradores, repite el paso 2 con cada email.
-- Para quitar acceso a alguien:  delete from public.admins where email = 'x@y.com';
-- =============================================================================
