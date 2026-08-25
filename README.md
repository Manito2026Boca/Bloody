# MANITO V6 Real

Esta entrega toma `Manito_V6_Real.zip` como la ultima version canonica del
producto y la convierte en una app React/Vinext mantenible, con el mismo
contrato backend:

1. Cliente crea una cuenta y publica un pedido.
2. Profesional crea otra cuenta, elige rubros y activa disponibilidad.
3. El profesional ve pedidos abiertos compatibles desde otro dispositivo.
4. La aceptacion usa una RPC atomica.
5. Cliente y profesional ven cambios de estado por Realtime.
6. El chat queda asociado al pedido real.

## Stack

- Vinext/Next sobre Vite y React 19.
- TypeScript.
- Supabase Auth, PostgreSQL, Realtime y RLS.
- PWA con manifest y service worker basico.

## Estructura V6

- `app/components/ManitoV6App.tsx`: experiencia cliente/profesional.
- `app/lib/v6Api.ts`: lecturas, escrituras, RPCs y suscripciones Realtime.
- `app/lib/v6Supabase.ts`: cliente Supabase con env vars o configuracion en navegador.
- `app/lib/v6Types.ts`: tipos del contrato V6.
- `supabase/migrations/202608250001_initial_manito_mvp.sql`: baseline V6.
- `tests/migration-guards.test.ts`: guardas del contrato SQL y seguridad.

## Variables de entorno

Copia `.env.example` a `.env.local` y completa:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

Tambien podes abrir la app sin `.env.local`: la primera pantalla pide Project
URL y Publishable key y las guarda solo en ese navegador.

Nunca uses `service_role`, secret keys ni claves administrativas en variables
`NEXT_PUBLIC_*`.

## Supabase

Aplica la migracion en un proyecto Supabase limpio:

```bash
supabase db push
```

O pegala completa en el SQL Editor:

```bash
supabase/migrations/202608250001_initial_manito_mvp.sql
```

La migracion crea:

- `profiles`
- `services`
- `professional_services`
- `orders`
- `messages`
- RPCs publicas: `complete_profile`, `accept_order`, `advance_order`, `cancel_order`
- implementaciones privadas de las RPCs sensibles
- RLS y grants para `authenticated`
- publicacion Realtime para `orders` y `messages`

## Seguridad aplicada

- El rol no se toma de `user_metadata` ni de claims editables.
- `handle_new_user` crea el perfil inicial como `client`.
- `complete_profile` permite elegir solo `client` o `professional`.
- El cliente web no tiene permiso directo para cambiar `role`, `email` ni `id`.
- Las actualizaciones sensibles de ordenes pasan por RPC.
- `accept_order` actualiza solo si el pedido sigue `open` y sin profesional.
- Mensajes visibles solo para participantes del pedido.

## Prueba MVP con dos usuarios

1. Usuario A se registra como cliente.
2. Usuario B se registra como profesional.
3. Usuario B entra en Perfil y marca el mismo rubro que va a pedir A.
4. Usuario B activa Disponible.
5. Usuario A publica un pedido.
6. Usuario B ve el pedido compatible y presiona Aceptar trabajo.
7. Usuario A ve el estado Confirmado sin recargar.
8. Usuario B avanza: En camino, En el lugar, Finalizado.
9. Ambos abren el chat del pedido.

Si tu proyecto requiere confirmacion por email, confirma cada cuenta antes de
probar el circuito. Para una prueba rapida podes desactivar temporalmente la
confirmacion en Authentication > Providers > Email.

## Ejecucion local

```bash
pnpm install
pnpm dev
```

Validacion:

```bash
pnpm lint
pnpm test
pnpm build
```

## Pendiente para produccion

V6 demuestra el primer backend compartido real. Antes de operar comercialmente
todavia faltan validacion documental, mapas/geocodificacion, push, pagos,
recuperacion de contrasena, panel admin, auditoria, reclamos, terminos legales,
observabilidad y revision profesional de seguridad.
