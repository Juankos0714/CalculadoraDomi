# Plan de Desarrollo — Sistema de Gestión de Domicilios (PWA)

**Stack:** SvelteKit + Tailwind CSS · Supabase (Auth, PostgreSQL, Realtime) · Vercel

---

## Fase 0 — Setup e Infraestructura (2-3 días)

- Crear proyecto Supabase (Auth, Database, Realtime habilitado).
- Crear proyecto SvelteKit + Tailwind, conectar cliente Supabase (`@supabase/supabase-js`).
- Configurar variables de entorno (`.env`) y despliegue continuo en Vercel (branch preview + producción).
- Definir estructura de carpetas por rol: `routes/(cliente)`, `routes/(admin)`, `routes/(domiciliario)`.
- Configurar PWA (manifest.json, service worker, íconos, `vite-plugin-pwa`).

**Entregable:** repo base desplegado en Vercel, login funcional contra Supabase Auth vacío.

---

## Fase 1 — Modelo de Datos y Seguridad (3-4 días)

Diseño de tablas en PostgreSQL:

```sql
-- Roles y usuarios
profiles (id, user_id, nombre, telefono, rol, created_at)
-- rol: 'cliente' | 'admin' | 'domiciliario'

-- Sectores y barrios
sectores (id, nombre)
barrios (id, nombre, sector_id)

-- Tarifas
tarifas (id, sector_origen_id, sector_destino_id, valor)

-- Pedidos
pedidos (
  id, numero, fecha, cliente_nombre, cliente_telefono,
  direccion_origen, barrio_origen_id,
  direccion_destino, barrio_destino_id,
  tarifa_id, valor, observaciones,
  estado, domiciliario_id, tipo_servicio,
  created_at, updated_at
)

-- Historial de estados (auditoría)
pedido_estados_log (id, pedido_id, estado, timestamp, usuario_id)

-- Recargos (Fase 2)
recargos (id, nombre, valor, tipo)
pedido_recargos (id, pedido_id, recargo_id, valor)
```

Tareas:
- Definir `estado` como `enum` de Postgres (pendiente, asignado, en_camino_origen, recogido, en_camino_destino, entregado, cancelado).
- Row Level Security (RLS) por rol:
  - Cliente: solo lee/crea sus propios pedidos.
  - Domiciliario: solo lee/actualiza pedidos donde `domiciliario_id = auth.uid()`.
  - Admin: acceso total.
- Función/trigger para autoincrementar `numero` de pedido.
- Función SQL `calcular_tarifa(barrio_origen, barrio_destino)` que resuelve sector→sector→precio en una sola consulta.

**Entregable:** esquema migrado, políticas RLS probadas con los 3 roles.

---

## Fase 2 — Autenticación y Roles (2 días)

- Registro/login con Supabase Auth (email/password).
- Trigger en Supabase que crea fila en `profiles` al registrarse.
- Registro de administradores y domiciliarios (solo admin puede crearlos, o invitación).
- Middleware/hooks de SvelteKit (`hooks.server.ts`) para proteger rutas por rol y redirigir según `profiles.rol`.

**Entregable:** cada rol accede solo a su panel correspondiente.

---

## Fase 3 — CRUD de Catálogos (Admin) (3 días)

- Barrios: crear, editar, eliminar, asignar a sector.
- Sectores: crear, editar, eliminar.
- Tarifas: matriz origen/destino/valor con validación de duplicados.
- UI: tablas con edición inline o modal, usando componentes Svelte reutilizables.

**Entregable:** admin gestiona barrios/sectores/tarifas end-to-end.

---

## Fase 4 — Creación y Cálculo de Pedidos (4 días)

- Formulario de cliente: nombre, teléfono, direcciones, selects de barrio origen/destino, observaciones, tipo de servicio.
- Al seleccionar ambos barrios → llamada a `calcular_tarifa()` → mostrar valor en tiempo real (sin submit).
- Guardar pedido con estado inicial `pendiente`.
- Vista de confirmación con número de pedido y valor.
- Admin: formulario equivalente para creación manual.

**Entregable:** flujo completo cliente → pedido creado con tarifa correcta.

---

## Fase 5 — Gestión de Pedidos y Tiempo Real (4-5 días)

- Panel admin: listado de pedidos con filtros (estado, fecha, domiciliario).
- Asignación: seleccionar domiciliario disponible → update `domiciliario_id` + estado `asignado`.
- Suscripción Supabase Realtime (`postgres_changes`) en:
  - Lista de pendientes del admin.
  - "Mis pedidos" del domiciliario.
  - Estado del pedido en la vista del cliente.
- Domiciliario: botones de cambio de estado secuencial (asignado → en camino origen → recogido → en camino destino → entregado), con `pedido_estados_log` registrando cada cambio.
- Botón "Abrir en Google Maps" con `geo:` / URL de Maps usando la dirección del pedido.

**Entregable:** cambios de estado visibles sin recargar página, en los 3 roles simultáneamente.

---

## Fase 6 — Paneles por Rol (3-4 días)

- **Admin:** resumen (pendientes/en proceso/finalizados), accesos a gestión, estadísticas básicas.
- **Domiciliario:** lista de pedidos asignados, historial propio.
- **Cliente:** crear pedido, consultar estado actual, historial (opcional), botón WhatsApp (`wa.me`).

**Entregable:** 3 paneles funcionales y responsive (móvil/escritorio).

---

## Fase 7 — Reportes e Historial (3 días)

- Vistas agregadas (SQL views o queries con `group by`):
  - Total de pedidos, por día, por domiciliario, entregados, cancelados, ingresos por período.
- Exportación simple (CSV) opcional.
- Historial detallado por pedido (usa `pedido_estados_log`).

**Entregable:** módulo de reportes con filtros de fecha.

---

## Fase 8 — Fase 2: Recargos (2-3 días)

- CRUD de recargos (compras, espera, paradas, peso adicional, etc.).
- Selección de recargos aplicables al crear/editar un pedido.
- Recalcular `valor` final = tarifa base + suma de recargos.

**Entregable:** cálculo de valor final con recargos aplicados.

---

## Fase 9 — QA, Performance y Despliegue Final (2-3 días)

- Pruebas de RLS (que un rol no pueda ver/editar datos de otro).
- Pruebas de carga inicial < 2s (lazy loading, `prefetch`, índices en Postgres para `pedidos.estado`, `pedidos.domiciliario_id`).
- Lighthouse PWA audit (instalable, offline shell básico).
- Pruebas cruzadas Android/iOS/escritorio.
- Despliegue final en Vercel (producción) + dominio.

**Entregable:** PWA en producción cumpliendo requerimientos no funcionales.

---

## Cronograma estimado

| Fase | Duración | Acumulado |
|---|---|---|
| 0. Setup | 2-3 días | 3 días |
| 1. Modelo de datos y RLS | 3-4 días | 7 días |
| 2. Auth y roles | 2 días | 9 días |
| 3. Catálogos | 3 días | 12 días |
| 4. Pedidos y cálculo | 4 días | 16 días |
| 5. Gestión y tiempo real | 4-5 días | 21 días |
| 6. Paneles | 3-4 días | 25 días |
| 7. Reportes | 3 días | 28 días |
| 8. Recargos (Fase 2 req.) | 2-3 días | 31 días |
| 9. QA y despliegue | 2-3 días | ~34 días |

**Total estimado: ~5 semanas** (desarrollador único, dedicación completa). El MVP entregable (sin recargos ni reportes avanzados) queda listo hacia el **día 21** (fin de Fase 5).

---

## Capa Gratuita — Restricciones y Adaptaciones (verificado 2026)

### Supabase Free
500 MB DB · 1 GB storage · 50.000 MAU · 5 GB egress/mes · 200 conexiones Realtime concurrentes · 500.000 invocaciones Edge Functions/mes · máx. 2 proyectos.

**Riesgo crítico:** proyectos sin actividad 7 días se **pausan automáticamente**. Para un negocio de domicilios esto es inaceptable (el sistema debe estar siempre disponible).
- **Mitigación:** un workflow de GitHub Actions (gratis en repos públicos) que haga un `curl` al proyecto cada 3-4 días, o un monitor HTTP gratuito (UptimeRobot) apuntando a la URL del proyecto cada 5 min. Cualquiera de las dos mantiene el proyecto "despierto".
- 500 MB de DB alcanza cómodamente para miles de pedidos en texto plano (sin fotos). No guardar imágenes en Postgres — si se usa evidencia fotográfica (fase futura), usar Storage con compresión, vigilando el 1 GB.
- 200 conexiones Realtime concurrentes son más que suficientes para una operación local (clientes + domiciliarios + admin simultáneos).
- Sin backups automáticos: agregar un `pg_dump` semanal vía el mismo GitHub Action, subiéndolo como artifact o a un bucket gratuito.

### Vercel Hobby
100 GB de transferencia · 1M invocaciones de funciones · sin costo, sin tarjeta.

**Importante:** el plan Hobby es para uso **personal, no comercial**. Un sistema de domicilios que genera ingresos técnicamente cae fuera de sus términos de servicio. Opciones:
- Aceptar el riesgo mientras el proyecto sea pequeño (Vercel rara vez audita proyectos chicos, pero es una zona gris).
- Alternativa 100% gratuita y sin esa restricción: **Cloudflare Pages** (build/despliegue de SvelteKit, sin límite de "no comercial" en su free tier) o **Netlify Free** (300 créditos/mes, tampoco exige uso no comercial explícitamente, pero revisar términos vigentes antes de producción).
- Recomendación pragmática: iniciar en Vercel para desarrollo/demo, y evaluar mover a Cloudflare Pages cuando el sistema empiece a operar con pedidos reales.

### Otros costos evitados
- **Google Maps:** no usar la API de Directions/Static Maps (de pago). El botón "Abrir en Google Maps" solo genera una URL/deep link (`https://www.google.com/maps/dir/?api=1&destination=...`), que es gratis siempre.
- **WhatsApp:** usar enlaces `wa.me/<telefono>?text=...` (gratis), no la API de WhatsApp Business (de pago), que queda para una fase futura si el volumen lo justifica.
- **Notificaciones Push:** omitir en el MVP; Realtime de Supabase cubre la actualización en vivo sin costo adicional. Push real (Web Push API) también es gratis si se implementa directo, sin servicios de terceros de pago.
- **Dominio:** usar el subdominio gratuito `*.vercel.app` (o `*.pages.dev` en Cloudflare) mientras no haya presupuesto para un dominio propio.

### Ajustes al plan de fases
- Fase 0: agregar tarea "configurar keep-alive de Supabase" (GitHub Action o UptimeRobot).
- Fase 9: agregar prueba de que el keep-alive funciona antes de considerar el sistema "en producción".
- Evidencia fotográfica y notificaciones Push (sección 22 de requerimientos) quedan condicionadas a no superar 1 GB de Storage / sin costo de servicios push de terceros.

---

## Notas técnicas clave

- **`calcular_tarifa()` como función SQL** (no lógica en frontend) evita inconsistencias entre lo que ve el cliente y lo que se guarda.
- **RLS desde el día 1**, no como parche al final — es la única forma de garantizar que un domiciliario no vea pedidos ajenos.
- **Realtime por tabla filtrada** (`filter: domiciliario_id=eq.<uid>`) para no sobrecargar el cliente con eventos irrelevantes.
- Dejar preparados los campos de **Fase futura** (geolocalización, foto de entrega, firma digital) como columnas nullable desde ya, para no migrar en caliente después.
