# NORM-014 FINAL VALIDATION REPORT

Fecha: 2026-09-09. Estado: validacion ejecutada; NO-GO para piloto autonomo.
Alcance: integracion y hardening. Sin Mercado Pago ni cambios comerciales.

## 1. Executive summary

Se corrigieron fallas reales que bloqueaban lectura de pedidos, adicionales y actualizacion en vivo. Se probaron actores independientes contra Supabase real, Storage, RPCs, Realtime y cron. La app paso 206 tests, TypeScript, build y QA de navegador con el build de produccion.
Esto NO equivale a validar recepcion de correo ni dispositivos nativos. Ademas se encontro ausencia de limitacion durable de intentos PIN. No se recomienda incorporar trabajos reales todavia.

## 2. Arquitectura y estrategia

Capas: unit tests para regresiones; SQL con transacciones rollback para permisos y reglas; integracion mediante supabase-js con sesiones independientes; navegador Edge mediante Playwright en dos contextos; cron real con reloj acelerado exclusivamente en fixtures.
No se sustituyeron llamadas de negocio por mocks. Una prueba inyecta deliberadamente HTTP 503 en get_my_profile para comprobar recuperacion; esta diferenciada de las pruebas reales.
Los scripts live no forman parte de pnpm test: requieren preparacion explicita, credenciales efimeras y conexion autorizada.

## 3. Entorno

Repositorio: work/manito, rama main. Supabase: taovmzxqvacrtjefgbsd. Produccion: https://bloody-eta.vercel.app.
QA final de UI: http://localhost:3018, next start sobre build Next 16.3.3; backend real. QA previo en dev3017.
No se atribuye QA autenticada de navegador al deploy remoto: se hizo local contra backend de produccion.
Versiones y resultados pertenecen a esta fecha, no garantizan ausencia futura de vulnerabilidades.

## 4. Actores

Siete identidades efimeras identificadas con prefijo norm014 y dominio example.invalid: Cliente A, profesionales B/C, Admin D, pendiente de email, suspendido y no aprobado.
Usuarios creados por bootstrap SQL para probar autorizacion. NO equivalen a registro publico ni correo recibido.
Limpieza verificada: cero usuarios, pedidos y servicio de esta corrida. Storage eliminado mediante API antes de borrar identidades; sesiones revocadas. Ninguna cuenta real eliminada.
Para borrar el reclamo exclusivamente de fixture se tomo lock exclusivo de complaints, se desactivo solo su guard de DELETE y se restauro dentro de la misma transaccion. Primero se ensayo con rollback. Guard final: habilitado. Sin cambios persistentes de RLS.

## 5. Auth

PASS: login independiente, email no confirmado rechazado, logout/login, recuperacion de perfil faltante idempotente por SQL y recuperacion de falla transitoria en navegador.
FIXED: error secundario de perfil ya no borra sesion; pantalla con Reintentar/Volver a ingresar; cargas antiguas no pisan nuevas; focus/token refresh no reinician borradores.
FIXED: configuracion parcial de entorno no mezcla URL/key de otro proyecto guardado en localStorage. Par completo de entorno tiene prioridad.
FIXED: callback vacio no afirma confirmacion exitosa; retorno a raiz del mismo origen.
Configuracion publica observada: signup habilitado, email provider habilitado, autoconfirm deshabilitado.
PENDIENTE: registro publico -> correo realmente recibido -> enlace -> sesion. Se solicito email controlado al usuario; no hubo respuesta. SMTP, templates y entrega no se certifican.

## 6. Seguridad / RLS

PASS SQL y API: aislamiento de actores, columnas PIN denegadas, lectura propia, control Admin, perfil sin autoescalada, extras y evidencia.
Todas las tablas public revisadas tienen RLS. Funciones relevantes tienen search_path explicito; public no es escribible por authenticated/anon.
Revocados EXECUTE heredados en dos helpers privados. No se eliminaron SECURITY DEFINER legitimos: realizan autorizacion interna antes de modificar.
Advisor: 47 advertencias de funciones DEFINER intencionalmente ejecutables por authenticated, no 47 vulnerabilidades confirmadas. Password leaked protection sigue deshabilitado: revisar habilitacion en Auth.
Referencia: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
Referencia: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
No es una prueba formal de ausencia de todas las vulnerabilidades ni un pentest externo.

## 7. Ahora

PASS real: necesidad, estimacion, oportunidades compatibles, privacidad preaceptacion, aceptacion concurrente con un solo ganador, snapshot contractual y direccion visible al asignado.
Flujo completo hasta completed y pago manual confirmado. No se cambio el algoritmo ni la politica comercial.

## 8. Programar

PASS real: pedidos futuros, disponibilidad, dos aceptaciones simultaneas para franja conflictiva con una rechazada, borde exacto adyacente permitido.
Regresion SQL de recurrentes cubre reglas de agenda relacionadas. No se cambio duracion ni jornada.
No se simularon todas las zonas horarias ni todos los cambios de horario estacional.

## 9. Solicitud manual

PASS: ajeno no acepta, rechazo por elegido, cambio explicito a otro profesional y fallback automatico decidido por cliente.
PASS: invitacion recurrente vencida no pudo aceptarse; el cliente refresco y eligio explicitamente al profesional antes de continuar.
No se agrego fallback silencioso.

## 10. Matching

PASS: servicio, aprobacion/suspension, oportunidades privadas y aceptacion atomica en sesiones reales.
Gaps factuales: especialidad puntua pertenencia al servicio, no una especialidad solicitada normalizada; distancia desconocida puede superar el filtro geografico por la rama IS NULL.
No se reinterpretaron textos de description para inventar especialidad ni se elimino silenciosamente el fallback sin GPS.
Requiere definir cobertura y especialidad requerida antes de ampliar piloto. Ranking exhaustivo, rondas sin candidatos y fallas de red prolongadas no quedaron totalmente cubiertos E2E.

## 11. Presupuestar

PASS: envio, edicion abierta, dos profesionales, aceptacion, cierre de restantes, contrato con agreed_price/accepted_proposal_id/contract_snapshot, edicion posterior rechazada.
Realtime de propuestas confirmado. No se duplico el snapshot NORM-003.
La comparacion visual completa de todos los componentes y la expiracion bajo todas las carreras requieren ampliar cobertura de navegador; no se certifican por mera existencia de codigo.

## 12. Ejecucion / PIN

PASS: accepted -> en_camino -> en_sitio -> PIN inicio -> trabajando -> PIN final -> completed.
PIN incorrecto rechazado; correcto permite transicion. Profesional/ajeno/Admin no obtienen PIN esperado por interfaz cliente; SELECT columnas y RPC de PIN restringidos. Payload real de Realtime al profesional no expuso PIN.
P1 ABIERTO: start_order_impl/complete_order_impl no tienen contador durable/cooldown de intentos. Ocultar el PIN no impide adivinacion repetida por el asignado.
No se implemento un contador que se perderia al hacer rollback de una excepcion. Se requiere una frontera de validacion que registre intentos fallidos de forma durable y un test concurrente. No se declara NORM-013 roto en confidencialidad; esta es una dimension adicional de seguridad.

## 13. Adicionales

PASS: profesional propone; cliente aprueba/rechaza; aprobado suma, rechazado no, agreed_price permanece. Modificacion directa de importe rechazada.
FIXED: wrappers public INVOKER no podian ejecutar private impl; ahora DEFINER con search_path vacio, controles internos conservados, EXECUTE solo authenticated.
PASS navegador dual: pro envia -> cliente ve sin refresh -> cliente aprueba -> pro ve sin refresh. Doble submit sincrono crea exactamente uno.

## 14. Pagos

PASS: cliente reporta, profesional confirma, cliente no confirma unilateralmente, ajeno rechazado; importe backend con adicional aprobado.
PASS: pago manual billetera disputado, contexto preservado para reclamo.
No se transfirio dinero real ni se integro proveedor de pago. Mercado Pago sigue fuera de alcance.

## 15. Evidencia

PASS: uploads reales Storage antes/durante/despues; acceso mediante URLs firmadas, aislamiento de ajenos y proteccion de eliminacion de evidencia vinculada.
PASS SQL: evidencia final obligatoria segun configuracion. Contexto Admin reconstruye las tres etapas.
No se certifica captura de camara nativa ni todos los limites de formatos/tamanos en telefonos.

## 16. Cancelaciones

PASS real: antes de aceptar, aceptado, en camino, en sitio. En trabajando se rechaza conforme regla existente.
FIXED: columnas de cancelacion faltaban en grants SELECT por columna; toda la consulta segura de pedidos fallaba. Se agregaron solo esas columnas, nunca PIN.
No se modificaron consecuencias economicas ni politica de cancelacion.

## 17. Proteccion MANITO

PASS real: pedido completado -> reclamo de calidad -> revision Admin -> resolucion registrada. Profesional no puede resolver administrativamente.
Admin reconstruye contrato, evidencia y pago. Resolucion llega en Realtime; ajeno no recibe detalle.
Regresion SQL NORM-010: 74 verificaciones. No se promete una cobertura legal/comercial nueva.

## 18. Recurrentes

PASS: crear, pausar, reanudar; cron existente genero realmente una visita el 2026-09-09 03:15:00 UTC. No se sustituyo por invocacion manual del generador.
Solo fechas de fixture se aceleraron; frecuencia global no cambio.
Visita paso por eleccion explicita tras timeout, aceptacion, ambos PIN y completed. Cursor siguiente avanzado. Cancelacion del plan preservaba historial, antes de la limpieza de fixtures.
Regresion SQL NORM-012: 77 verificaciones.

## 19. Realtime / notificaciones

FIXED: publication incluye proposals/extras/photos; detalle suscribe tablas, agrupa refrescos y limpia canales.
Descubrimiento: SUBSCRIBED websocket no garantiza que Postgres Changes este listo. Pruebas esperan system status ok; UI hace refetch al recibirlo para cerrar ventana de eventos perdidos.
Orders/oportunidades: recarga por notificaciones, online/visibilidad y fallback visible de 15s para expiraciones lazy.
PASS real: tracking, chat, propuestas, extras, pagos y resolucion de reclamo; privacidad del ajeno. No se certifican push nativo ni todas las combinaciones de cancelacion/desconexion.

## 20. Mobile QA

PASS Edge/Playwright: Cliente y Profesional, 390x844 y 1440x844, login real, pedidos visibles, sin overflow horizontal ni pageerror en recorridos probados.
PASS con build de produccion final Next16.3.3: flujo dual de extra, doble envio, borrador al cambiar foco y recuperacion tras HTTP503.
Capturas en outputs/norm014. No equivalen a Android/iOS real: teclado, GPS, camara, instalacion PWA y notificaciones del SO siguen pendientes.

## 21. Bugs encontrados

| ID | Sintoma / causa |
| --- | --- |
| BUG-N014-001 | Detalles desactualizados: faltaban publicaciones/suscripciones Realtime. |
| BUG-N014-002 | Helpers privados heredaban EXECUTE PUBLIC. |
| BUG-N014-003 | Lectura de pedidos denegada por columnas de cancelacion sin grant. |
| BUG-N014-004 | Adicionales bloqueados por INVOKER llamando helper privado no ejecutable. |
| BUG-N014-005 | Oportunidades/expiraciones quedaban viejas sin refresh. |
| BUG-N014-006 | Inicializacion localStorage diferente entre SSR y cliente. |
| BUG-N014-007 | URL/key podian mezclarse con configuracion parcial. |
| BUG-N014-008 | Callback sin sesion afirmaba confirmacion; retorno podia salir del origen. |
| BUG-N014-009 | Doble submit de extra sin latch. |
| BUG-N014-010 | Carga secundaria afectaba sesion/borradores y respuestas tardias. |
| BUG-N014-011 | Cache SW demasiado amplia y fallback HTML para chunks. |
| BUG-N014-012 | Next16.2.6 y dependencias con advisories conocidos. |
| BUG-N014-013 | Sin limitacion durable de intentos PIN; abierto. |

## 22. Bugs corregidos

FIXED 001: suscripciones/publication + tests3 + API/browser real.
FIXED 002: REVOKE especifico + grants SQL.
FIXED 003: SELECT solo columnas necesarias + SQL/lectura navegador.
FIXED 004: frontera DEFINER controlada + actores SQL/API.
FIXED 005: refresh agrupado en eventos, visibilidad y fallback; tracking real.
FIXED 006: estado inicial neutral y lectura browser tras mount; browser sin errores.
FIXED 007: helper de configuracion unica + tests10.
FIXED 008: mensaje neutral y return '/' del mismo origen.
FIXED 009: latch in-flight + prueba de doble submit.
FIXED 010: epoch de cargas, reintento y no reset en token refresh + navegador.
FIXED 011: SW v5, exclusiones auth/api, fallback no HTML + tests4.
FIXED 012: Next/eslint-config-next16.3.3; auditoria prod17 -> 0; test/build/browser repetidos.
Fuentes: https://github.com/advisories/GHSA-p293-qw3h-jr36 y https://github.com/advisories/GHSA-2xp9-vwfh-vxw4
No se presume explotacion previa. La alerta Windows aplica especialmente al servidor local; la de imagenes depende del uso de optimizacion/formatos.

## 23. Refactors realizados

Helpers pequenos para configuracion y suscripcion de detalle. Guard de cargas asincronas y agrupacion de refetch. Infraestructura de pruebas separada, sin reescritura de UI/negocio.

## 24. IMPROVEMENT DISCOVERY

IMPLEMENTED: recuperacion de cargas, configuracion coherente, Realtime listo, cache limitada, doble submit, grants y actualizacion de seguridad.
RECOMMENDED: staging independiente; CI para suites SQL/E2E; alertas cron/Auth; monitorizacion de errores con datos sensibles redactados.
PRODUCT_DECISION_REQUIRED: criterio de cobertura cuando no hay GPS y especialidad solicitada necesaria.
ACCEPTED_DEBT: infraestructura live requiere bootstrap SQL autorizado; scripts usan Edge/runtime Playwright externo; estados textuales menores y componente principal grande. No bloquean por si solos, no justifican reescritura ahora.

## 25. Accepted debt

No se agrego Playwright a dependencias del producto: se uso runtime instalado. Documentado como requisito del harness.
QA de emulacion no sustituye dispositivos. Toolchain alternativa vinext no fue validada como despliegue: se valido vercel-build.
Se mantienen advertencias DEFINER intencionales. No se presentan como prueba de permisos excesivos sin revisar control interno.

## 26. Product decisions required

Cobertura sin coordenadas: actual permite candidato con distancia desconocida. Propuesta: exigir ciudad/zona normalizada o ubicacion antes de ofrecer Ahora. Ventaja: evita asignaciones inutiles; riesgo: excluir usuarios sin permiso GPS. Recomendacion: ciudad manual valida mas cobertura explicita, no GPS obligatorio como unica entrada.
Especialidades: actual detecta especialidades del servicio. Propuesta: ID de especialidad requerida o declarar que el matching es solo por rubro. Ventaja: precision; riesgo: reducir oferta. No inferir desde texto libre ni cambiar catalogo silenciosamente.

## 27. Tests / resultados

- pnpm test: 206/206, 28 archivos.
- pnpm exec tsc --noEmit: exit0.
- pnpm run vercel-build: exit0, Next16.3.3.
- pnpm audit --prod: cero vulnerabilidades reportadas al cierre.
- SQL NORM014: 28; NORM010: 74; NORM012: 77. Total179 verificaciones reales con rollback.
- API/Realtime: 47 pass; flujos extendidos24; recurrentes5. Total76 checkpoints, no equivalen a76 casos independientes.
- Navegador: cuatro contextos actor/viewport y dos pruebas integradas, todos pasan.
- Historial remoto: versiones de las dos nuevas migraciones coinciden con nombres locales.
Resultados reproducibles/sanitizados en outputs/norm014; credenciales efimeras borradas.

## 28. P0 abiertos

Ningun P0 funcional demostrado en recorridos ensayados. Esto no significa auditoria exhaustiva ni ausencia absoluta de P0.
Las alertas criticas de dependencias se corrigieron localmente; el despliegue debe verificarse antes de considerarlas cerradas en produccion.

## 29. P1 abiertos

BUG-N014-013: fuerza bruta PIN sin limite durable; bloquea GO.
Validacion Auth incompleta: falta prueba de entrega de correo real y confirmacion, bloquea certificacion de acceso para nuevos usuarios.
Matching geografico/especialidad necesita decision o restriccion explicita del piloto; no esta controlado para apertura general.
Verificacion mobile nativa pendiente. Priorizar Android/iOS y permisos antes de usarlo en trabajos reales.

## 30. PILOT READINESS

**NO-GO**

No invitar usuarios a trabajos reales autonomos aun.
Para reconsiderar: limitar intentos PIN con persistencia y concurrencia verificadas; cerrar registro/correo/link/login real; resolver cobertura/especialidad o acotar explicitamente el piloto; completar prueba nativa de permisos/teclado/PWA.
Los tests verdes y los bugs corregidos no reemplazan estos requisitos. No se inicia otra normalizacion ni Mercado Pago.

## 31. Archivos modificados

app/components/AuthConfirmationScreen.tsx
app/components/ManitoV6App.tsx
app/lib/v6Api.ts
app/lib/v6Supabase.ts
app/lib/supabaseConfig.ts
app/lib/v6OrderRealtime.ts
public/sw.js
package.json
pnpm-lock.yaml
scripts/norm014-live.mjs
scripts/norm014-flows.mjs
scripts/norm014-mobile.cjs
scripts/norm014-recurring.mjs
tests/norm-014-config.test.ts
tests/norm-014-realtime.test.ts
tests/norm-014-service-worker.test.ts
supabase/tests/norm_014_security_smoke.sql
docs/NORM_014_FINAL_VALIDATION_REPORT.md
docs/NORM_014_TESTING.md
Mas las dos migraciones siguientes. No se incluyen outputs, .temp, tsbuildinfo ni secretos.

## 32. Migraciones

20260909025147_norm_014_realtime_and_private_grants.sql
20260909025339_norm_014_extra_rpc_boundary.sql
Aplicadas y verificadas en Supabase. Sin reaplicar NORM006 ni modificar migraciones historicas. Sin reglas economicas nuevas.

## 33. Commit / deploy

Codigo: commit 38f59cb, enviado a github/main. Vercel confirmo success / Deployment has completed para ese commit.
Deployment: https://vercel.com/manito/bloody/MuFZ8TxBfBh2EaXVjFybU5wEeom7
URL publica: https://bloody-eta.vercel.app (HTTP200). La comprobacion HTTP no sustituye login real con correo.
Este cierre documental posterior no cambia codigo ni migraciones. La conclusion NO-GO no cambia por un deploy exitoso.
