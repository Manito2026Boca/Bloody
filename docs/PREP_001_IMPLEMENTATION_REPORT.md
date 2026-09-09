# PREP-001 IMPLEMENTATION REPORT

Fecha: 2026-09-09. Alcance exclusivo: seguridad de intentos PIN y vias relacionadas.
Resultado tecnico: **PIN SECURITY: READY**. Esto NO convierte el NO-GO general de NORM-014 en GO.

## 1. Problema original

start_order_impl y complete_order_impl comparaban el PIN sin limite durable. Los PIN ya estaban ocultos por grants de columnas y RPC cliente, pero un profesional asignado podia adivinarlos repetidamente.
Una excepcion PostgreSQL despues de incrementar habria revertido el incremento: no se uso ese patron.

## 2. Arquitectura elegida

Una unica funcion privada attempt_order_pin valida ambos desafios. Las RPC publicas start_order/complete_order delegan exclusivamente en ella.
Estado en private.order_pin_challenges, politica en private.pin_attempt_policy y auditoria en private.order_pin_events.
Clave del desafio: pedido + etapa. Profesional asociado e inmutable por las vias normales. No hay contador en localStorage ni permisos de modificacion para usuarios.
Los viejos validadores privados sin limite fueron eliminados.

## 3. Por que esta solucion

Simplicidad: un camino de validacion y una fila por etapa; sin servicios externos ni transacciones autonomas.
Atomicidad: bloqueo de la fila orders antes de crear/leer el contador; todos los intentos concurrentes del mismo pedido se serializan.
Durabilidad: el rechazo funcional es JSON normal y la transaccion se confirma. El frontend convierte ese rechazo confirmado en un mensaje.
Mantenibilidad: limites centralizados en una tabla privada, separados de politicas comerciales.
Compatibilidad: nombres/parametros de RPC conservados; cambia el resultado a JSON explicito. No se devuelve el pedido completo ni sus secretos.

## 4. Politica de intentos

Cinco fallos por desafio antes de bloquear. Un error humano aislado permite reintento inmediato.
Un formato incorrecto consume un intento igual que cualquier otro PIN incorrecto: no hay pistas sobre largo/prefijos.
No existe reset por refresco, logout, cambio de dispositivo o un simple intervalo entre fallos.
Start y end tienen filas y contadores independientes.

## 5. Cooldown

Primer bloqueo: 15 minutos. Reincidencia en la misma etapa: 1 hora, 4 horas, 16 horas y luego 24 horas como maximo por bloqueo.
La progresion limita intentos sostenidos durante dias, no solo rafagas. La configuracion tiene limites de seguridad para impedir desactivar accidentalmente la proteccion.
Durante bloqueo ni siquiera el PIN correcto avanza. Las llamadas bloqueadas no comparan el secreto ni prolongan el plazo; se agregan a blocked_requests y last_attempt_at.
La expiracion es lazy al proximo intento, queda auditada y abre cinco oportunidades nuevas. No requiere cron ni soporte.
El exito cierra el desafio y limpia fallos activos. La historia de bloqueos permanece.

## 6. Persistencia y limites transaccionales

PIN incorrecto -> actualizar contador/evento -> RETURN {ok:false,code} -> COMMIT del request.
No se lanza SQL exception en esa rama. Autorizaciones invalidas se rechazan antes de acceder al secreto.
Un fallo de transicion se captura en una subtransaccion; devuelve temporarily_unavailable y conserva evento de error y el estado previo.
Prueba real: Prefer: tx=rollback no evito que el intento fallido quedara registrado; se verifico en otra consulta SQL despues del request.
Como en cualquier transaccion PostgreSQL, un ROLLBACK explicito del propietario revierte escrituras de esa transaccion. No se promete persistencia fuera de las reglas de PostgreSQL: los usuarios de la app no tienen SQL arbitrario ni override de rollback habilitado. Una transaccion abortada antes de responder tampoco autoriza la transicion.

## 7. Concurrencia

Doce POST simultaneos al inicio: cuatro invalid_pin, ocho cooldown. Solo cinco comparaciones fallidas se registraron; la quinta aplico el bloqueo.
Dos requests adicionales con el PIN correcto/relogin siguieron bloqueados. Estado real: failures=5, lockouts=1, blocked_requests=9.
clock_timestamp se toma despues de adquirir el lock, evitando usar una hora vieja mientras el request espera.
No hay lectura contador=0 seguida de escrituras independientes.

## 8. Cambios DB

Tres tablas privadas con RLS habilitada, sin policies para usuarios. Un indice de auditoria por pedido/tiempo.
Generador criptografico con extensions.gen_random_bytes y muestreo sin sesgo, mismo formato de cuatro digitos.
Trigger de nacimiento/inmutabilidad: genera solo PIN nuevos/faltantes; no regenera valores existentes. Backfill unicamente de NULL en pedidos activos asignados.
Se corrigio tambien la ausencia de generacion al aceptar presupuestos. El flujo comercial y sus snapshots no cambian.
Segundo trigger impide que cliente y profesional asignado sean la misma cuenta. No habia casos reales existentes: solo el fixture creado para demostrarlo.

## 9. Cambios RPC

start_order(uuid,text) y complete_order(uuid,text) retornan:
- Exito: {ok:true,order_id,status}.
- Rechazo: {ok:false,code,retry_after_seconds cuando corresponde}.
Codigos: invalid_pin, cooldown, evidence_required, unavailable, temporarily_unavailable.
No se incluyen contadores internos, PIN esperado, PIN intentado ni fragmentos.
get_order_pin mantiene la visibilidad por etapa para el cliente propio, excluyendo identidad igual al profesional.
La evidencia final requerida se valida antes de comparar PIN; no permite deducir una coincidencia a traves del error de evidencia.
advance_order conserva solo accepted -> en_camino -> en_sitio; no reemplaza validacion PIN.

## 10. Frontend

Helper requireSuccessfulPinAttempt exige ok=true: HTTP200 no se interpreta automaticamente como inicio/finalizacion exitosa.
Mensajes simples para PIN incorrecto, espera temporal y falta de evidencia. La espera se expresa en minutos/horas, sin mostrar tablas/contadores.
Guard de doble accion evita enviar dos solicitudes por doble click en la misma pantalla.
El error aparece junto al boton del pedido, con role=alert y desplazamiento minimo para hacerlo visible; no queda perdido en el encabezado.
Cliente conserva su flujo actual. No se agrego panel Admin ni redisenio.

## 11. Auditoria / eventos

Eventos: failed, blocked, expired, success y transition_error; pedido, profesional, etapa y timestamp. blocked incluye vencimiento.
Las solicitudes durante cooldown se agregan en la fila del desafio para no crear una fila ilimitada por cada request de abuso.
No hay columna de PIN, guess, valor esperado o payload libre. No se guardan contrasenas ni tokens.
Logs DB consultados: log_statement=ddl; log_parameter_max_length_on_error=0. No se agrego logging de bodies.
La auditoria esta ligada al pedido con FK; no se implemento borrado de trabajos reales ni una politica nueva de retencion.

## 12. Seguridad / RLS / roles

PUBLIC/anon: sin EXECUTE de endpoints ni helpers.
authenticated: EXECUTE solo sobre RPC publicas previstas; validador verifica profesional aprobado, asignacion, identidad distinta del cliente y etapa.
Helpers privados: sin EXECUTE para authenticated/anon. Todos los nuevos DEFINER tienen search_path vacio y referencias calificadas.
Tablas privadas: authenticated sin SELECT/UPDATE; service_role conserva SELECT tecnico y no UPDATE; owner conserva administracion SQL. Sin grants nuevos de schema.
Advisor informa tres tablas RLS sin policies: es intencional en estas tablas privadas para negar acceso a usuarios. Se mantienen avisos de DEFINER autorizados y la advertencia previa de password leaked protection, sin desactivar controles.
Admin de producto no ve PIN ajeno ni tiene herramienta para resetear. No se agrego desbloqueo manual.
Realtime no publica desafios/eventos y orders conserva su publication segura sin columnas PIN.
La comparacion no promete tiempo constante criptografico formal; no ofrece pistas parciales y queda limitada a cinco comparaciones por bloqueo. El riesgo practico de timing remoto es reducido por esa frontera.

## 13. Tests

- pnpm test: 211/211, 29 archivos.
- pnpm exec tsc --noEmit: exit0.
- pnpm run vercel-build: exit0 (Next16.3.3).
- PREP001 SQL: 37 verificaciones reales, con rollback de fixtures.
- Regresion SQL NORM014/010/012: 28+74+77. Total SQL: 216 verificaciones.
- PREP001 API: 14 checkpoints en fases block/resume, mas reproduccion y bloqueo del caso de identidad propia.
- Regresion API/Realtime NORM014: 47 checkpoints; flujos ampliados: 24.
- QA navegador con build de produccion local y Supabase real: cinco fallos, bloqueo, refresh, cliente conserva PIN, estado sin cambio, sin pageerrors.

Los tests cubren permisos, persistencia, error capturado, etapa independiente, cooldown inicial/final, exito despues de expiracion, eventos sin secretos, legacy y entrada alternativa eliminada.

## 14. Prueba real

Cliente A y Profesional B con sesiones Auth independientes y credenciales temporales.
Programar -> aceptar -> en camino -> en sitio -> 12 intentos concurrentes -> bloqueo -> relogin bloqueado.
Solo se adelanto blocked_until de ese fixture, nunca la politica global.
Luego PIN correcto -> trabajando -> PIN final incorrecto -> consulta externa confirma evento persistido pese a Prefer rollback -> PIN final correcto -> completed -> pago manual confirmado.
Realtime al profesional entrego cambios de estado sin start_pin/end_pin.
Navegador Edge, viewport390: cinco intentos desde el prompt real y mensaje de espera; recarga conserva bloqueo.
No se atribuye esta prueba a un telefono fisico. Tampoco se probo correo real, porque no pertenece a PREP001.

## 15. Bugs relacionados encontrados

PREP001-SEC-001: validacion ilimitada y rechazo mediante excepcion.
PREP001-SEC-002: generacion no criptografica en aceptacion directa.
PREP001-SEC-003: propuestas aceptadas podian no generar PIN.
PREP001-SEC-004: profesional podia aceptar su propio pedido; el mismo actor podia ocupar ambos lados del desafio.
El ultimo se reprodujo por API real antes de corregir; el fixture antiguo ya no pudo avanzar ni intentar PIN despues.

## 16. Bugs corregidos

FIXED - PREP001-SEC-001: frontera unica durable, sin validadores antiguos accesibles.
FIXED - PREP001-SEC-002: nacimiento del PIN con CSPRNG sin cambiar los existentes.
FIXED - PREP001-SEC-003: trigger comun para pedidos asignados, mas backfill conservador.
FIXED - PREP001-SEC-004: trigger de separacion de actores, control redundante en validador y filtro en get_order_pin.
Se mantuvieron reglas de contrato, agenda, pagos, extras, evidencia y recurrentes.

## 17. Improvement Discovery

IMPLEMENTED: rechazo funcional confirmado, politica privada central, cooldown progresivo, auditoria acotada, bloqueo atomico, correccion de generacion y separacion de actores.
RECOMMENDED: alertas operativas ante bloqueos repetidos y metricas agregadas; revisar retencion cuando crezca el volumen.
PRODUCT_DECISION_REQUIRED: ninguna decision necesaria para cerrar esta tarea. Recuperacion excepcional por Admin seria una decision futura, no implementada.
ACCEPTED_DEBT: no panel de auditoria; owner consulta SQL. Tests browser requieren Edge/Playwright del runtime existente.

## 18. Accepted debt

No hay rate limiting HTTP general ni defensa DDoS nueva: el alcance es limitar comparaciones del secreto.
La espera progresiva puede llegar a24h si se insiste repetidamente; evita soporte obligatorio y fuerza bruta sostenida.
Clientes con bundle viejo pueden no presentar correctamente el nuevo rechazo JSON; la validacion backend sigue impidiendo transiciones. Actualizar la app tras deploy.
Los datos de auditoria privados no tienen tarea automatica de purga; no se elimino historia real.

## 19. Product Decisions Required

Ninguna para PREP001. No se inicio otro modulo. Los bloqueantes de correo, matching y QA nativa de NORM014 siguen siendo independientes.

## 20. Riesgos restantes

Una persona puede compartir voluntariamente su PIN, o una cuenta/sesion robada puede actuar como su titular; este mecanismo no sustituye Auth.
Owner/backend de confianza conserva acceso tecnico; credenciales privilegiadas nunca deben llegar al frontend.
Una caida de DB antes del commit no genera una confirmacion de intento; la app debe reintentar sin asumir exito. No se usa contador en memoria como respaldo inseguro.
PIN de cuatro digitos tiene entropia limitada: la seguridad practica depende de conservar limites, permisos y separacion de actores. No habilitar tx=rollback en PostgREST ni publicar las tablas privadas.
No se afirma GO global para piloto.

## 21. Archivos modificados

app/components/ManitoV6App.tsx
app/lib/v6Api.ts
app/lib/v6PinAttempt.ts
scripts/norm014-live.mjs
scripts/prep001-live.mjs
scripts/prep001-mobile.cjs
supabase/tests/norm_014_security_smoke.sql
supabase/tests/prep_001_pin_smoke.sql
tests/prep-001-pin-attempt.test.ts
docs/PREP_001_IMPLEMENTATION_REPORT.md
Y las dos migraciones de la seccion siguiente. Sin secretos ni outputs versionados.

## 22. Migraciones

20260909211922_prep_001_pin_attempt_hardening.sql
20260909212555_prep_001_separate_pin_actors.sql
Aplicadas en Supabase. Nombres locales alineados con las versiones del historial remoto. No se modificaron migraciones historicas.
Limpieza: cuentas, pedidos, servicio y archivos de fixtures eliminados; sesiones revocadas primero. Credenciales locales temporales borradas. Se reutilizo el procedimiento controlado de limpieza NORM014, restaurando guard de reclamos dentro de su transaccion.

## 23. Commit / deploy

Codigo: commit c6c4214, enviado a github/main. Vercel confirmo success / Deployment has completed para ese commit.
Deploy: https://vercel.com/manito/bloody/CCDW3NBVgf5oRsgWfH5LheBaVCsx
Produccion: https://bloody-eta.vercel.app (HTTP200 verificado). QA autenticada realizada contra Supabase real desde el build local, no se atribuye al HTTP200.
El commit documental posterior solo registra este resultado; no modifica la implementacion.

# PIN SECURITY: READY

READY para esta frontera y las pruebas descriptas; no implica cerrar el NO-GO global de NORM014.

## Reproduccion de pruebas

Preparar actores mediante scripts/norm014-live.mjs prepare y bootstrap SQL autorizado, segun docs/NORM_014_TESTING.md.
NORM014_PUBLISHABLE_KEY debe ser una clave publica del mismo proyecto, nunca service_role.
Ejecutar node scripts/prep001-live.mjs block. Verificar contador por SQL; adelantar SOLO blocked_until del pedido de fixture. Ejecutar node scripts/prep001-live.mjs resume.
Para navegador, ejecutar scripts/prep001-mobile.cjs con NORM014_APP_URL y PLAYWRIGHT_MODULE.
Finalizar con limpieza controlada del run. No reutilizar las credenciales eliminadas de esta corrida.
Referencias tecnicas: https://www.postgresql.org/docs/current/explicit-locking.html y https://docs.postgrest.org/en/stable/references/transactions.html
