# IDENTITY-ARCA-001 REPORT

## Estado
Implementacion local revisada y validada. No aplicada en Supabase ni desplegada. El Human Test compartido queda bloqueado hasta clasificacion inicial de actividades y autorizacion de aplicacion/publicacion.

## Arquitectura aplicada
Cuenta Auth, identidad fiscal estable, claims y perfil profesional siguen separados. La verificacion fiscal no demuestra titularidad ni levanta una suspension MANITO.

## Migraciones
`supabase/migrations/20260929194755_identity_arca_001.sql`, incremental creada con Supabase CLI. Ejecutada en PostgreSQL 17 local descartable y PGlite; ninguna migracion historica editada. No aplicada remotamente.

## ProviderIdentity
UUID privado propio, CUIT normalizado/checksum/unique, PERSON/COMPANY, estados fiscales y operativos separados. Solo PERSON puede vincularse por los RPC actuales. Primer claim no concede propiedad.

## Claims y recovery
Solicitudes multiples comparten una sola identidad. Respuesta neutral equivalente; una solicitud pendiente por perfil. La identidad canonica tiene prioridad sobre claims historicos. No existe transferencia de reputacion a otra cuenta: el Admin debe gestionar la recuperacion Auth original. Una cuenta original previamente eliminada requiere revision, no restauracion prometida.

## Onboarding
CUIT privado en datos personales; tax_id previo solo prellena un borrador. El perfil puede completarse pendiente de identidad. El backend protege nuevas oportunidades, reservas de precio, propuestas, asignaciones y contrataciones; la ejecucion de contratos existentes no pasa por este gate. Hoy explica la revision faltante y reconsulta al recuperar foco.

## Admin
Seccion de identidad dentro de la bandeja existente. Revelado explicito auditado, portal ARCA general sin CUIT en URL, resultado fiscal, contraste documental y habilitacion operativa como acciones distintas. Requisitos por servicio y RPC con configuracion por especialidad. No se autoaprobo ni modifico Azul Eskesen.

## Niveles de rubro
LEVEL_1/2/3 configurables. Arquitectura e Ingenieria se inicializan LEVEL_3. Las demas actividades quedan SIN CLASIFICAR y no admiten nuevos trabajos reales hasta decision explicita. LEVEL_2 exige tipos documentales especificos aprobados; insurance, tax, DNI y selfie no sustituyen una credencial de actividad. Falta confirmar el mapa inicial LEVEL_1/LEVEL_2 y sus credenciales.

## Seguridad/RLS
Tablas privadas con RLS y sin acceso directo anon/authenticated/service_role; RPC acotados y Admin real comprobado en backend. Helpers privados sin EXECUTE publico. CUIT no aparece en joins publicos, eventos, URLs ni Realtime. Errores frontend no muestran detalles SQL. Bloqueos compartidos/advisory serializan admision, cambios de requisitos, revision fiscal, suspension y revocacion documental. Una revision de claim conflictivo no modifica la identidad canonica.

## Reputacion
No se migraron ratings, pedidos ni reclamos. FK restrictiva protege perfil canonico y claims contra cascade Auth accidental. La politica de cierre/supresion/retencion sigue dependiendo de PR-001; no se implemento una politica legal de conservacion indefinida.

## Compatibilidad existente
Ningun perfil previo se marco VERIFIED por tax_id. Sin cambios PIN, contratos economicos, branding, dominios, SMTP o Push. Lectura remota confirmo 16 profesionales QA y 2 clientes con marcador seguro app_metadata. La migracion preserva a los profesionales QA mediante allowlist exacta privada y eventos; no modifica sus datos ni inventa CUIT.

## Preparacion ARCA automatica
Interfaz fiscal asincrona minima y ManualArcaVerifier. No WSAA, SOAP, certificados, scraping, cron ni secretos nuevos. ARCA_WS requerira un adaptador backend y permisos revisados; no modifica vinculos ni sanciones por si solo.

## Tests
- Suite completa ejecutada una vez: 59 archivos, 417 tests aprobados.
- Focalizados finales identidad/PWA/matching/onboarding/cockpit: 5 archivos, 40 tests aprobados.
- TypeScript aprobado; build aprobado con NEXT_PUBLIC_APP_URL del origen app. Un primer build fallo por ausencia de esa variable local, no por codigo.
- SQL smoke en PGlite y PostgreSQL 17: constraints, privilegios, anti-enumeracion, claims, estados, niveles, QA, auditoria, canonical/recovery, ratings y cascade.
- PostgreSQL real aislado: 12 sesiones concurrentes, una identidad/multiples claims, suspension/reserva, configuracion/admision y rechazo documental/vinculacion.
- Browser fixtures de componentes reales: 360x800, 390x844, desktop; envio, enmascarado, revelado, resultado fiscal y scroll. Capturas en outputs/identity-arca. No son integracion Supabase ni Human Test.
- Scripts usan dependencias de testing aisladas fuera del repo, indicadas por variables MANITO_PGLITE_MODULE, MANITO_EMBEDDED_PG_MODULE y MANITO_PLAYWRIGHT_MODULE. No se agregaron dependencias productivas.

## Reviewer
Reviewer independiente READ-ONLY. Hallazgos de concurrencia y recuperacion corregidos; veredicto final sin hallazgos accionables en el alcance revisado. No realizo mutaciones remotas.

## Human Test pendiente
Probar alta/CUIT invalido/duplicidad con fixtures sinteticos solo en entorno descartable; recuperar cuenta original, consulta ARCA manual, contraste documental, VERIFIED/REJECTED/NEEDS_REVIEW, usuario ajeno/Cliente sin acceso, gate pending/verificado y conservacion de historial. No usar CUIT real de terceros ni autoaprobar QA para simular titularidad.

## Riesgos
Falta mapa inicial de requisitos aprobado; los no clasificados quedan cerrados. Falta aplicar/validar migracion contra Supabase real y publicar candidato. Browser QA fue aislado, no un flujo real de dos cuentas. Realtime privado no expone secretos; cambios administrativos se reconsultan al reabrir perfil/Hoy o recuperar foco. Recuperacion Auth y solicitudes de supresion son procedimientos administrativos, no nuevas herramientas automaticas. PR-001 sigue pendiente.

## Commits
Rama `codex/identity-arca-001`, base `7eb66dec5a1ac1f2a68e84a85ccf7ca2d4baa5e5`. Consultar commit local final con git log. Sin push, deploy ni mutaciones de infraestructura remota.

## Archivos
- app/components/AdminVerificationInbox.tsx
- app/components/ManitoV6App.tsx
- app/components/AdminProviderIdentity.tsx
- app/components/ProviderIdentityPanel.tsx
- app/lib/providerIdentity.ts
- app/lib/providerIdentityApi.ts
- app/lib/providerIdentityVerifier.ts
- app/lib/providerIdentity.test.ts
- scripts/identity-arca-browser.mjs
- scripts/test-identity-arca-local.mjs
- scripts/test-identity-arca-concurrency.mjs
- supabase/migrations/20260929194755_identity_arca_001.sql
- supabase/tests/identity_arca_001.sql
- supabase/tests/identity_arca_001_fixture.sql
- docs/IDENTITY-ARCA-001_REPORT.md

IMPLEMENTATION_BLOCKED
