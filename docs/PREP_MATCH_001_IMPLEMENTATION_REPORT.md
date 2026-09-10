# PREP-MATCH-001 IMPLEMENTATION REPORT

Fecha: 2026-09-10. Alcance: cobertura y especialidad; no se inicio Auth ni el modulo Mobile QA.

## 1. Arquitectura final

`private.order_professional_eligible(orders, uuid)` centraliza aprobacion/no suspension, servicio activo, especialidad explicita, cobertura, disponibilidad inmediata, restriccion manual y jornada/conflictos de agenda. Rondas, oportunidades, propuestas y aceptaciones reutilizan el predicado. Un trigger adicional protege la asignacion incluso desde otras rutas backend.

## 2. Modelo

`service_locations`: catalogo normalizado por ID, nombre, provincia y pais. `professional_service_locations`: cobertura municipal explicitamente declarada, no inferida desde work_city. Orders y recurring_service_plans conservan location_id y required_specialty_id. Las especialidades existentes se reutilizan y se validan contra el servicio activo.

## 3. GPS

Con ambos pares de coordenadas validos, se exige distancia dentro del radio. La coincidencia de localidad no rescata un resultado fuera de radio. Se rechazan pares incompletos, NaN y coordenadas fuera de rango; cero es valido.

## 4. Sin GPS

Sin distancia calculable se exige localidad activa y cobertura explicita del profesional para esa localidad. NULL no concede compatibilidad. Catalogo inicial: Mar del Plata, Batan y Tres Arroyos, Buenos Aires, Argentina. Es ampliable por backend sin cambiar componentes. No se declaro cobertura en nombre de usuarios existentes.

## 5. Especialidad

Seleccion opcional por ID; puede deseleccionarse. Nunca se deriva de description. Cambiar rubro descarta selecciones incompatibles. Repetir el ultimo pedido conserva una especialidad estructurada existente, no una inferencia textual.

## 6. Ahora

Mantiene disponibilidad, rondas, radios de expansion, vencimientos y aceptacion atomica. La elegibilidad se comprueba al invitar y nuevamente al aceptar. Las invitaciones antiguas no eluden cobertura/especialidad actuales.

## 7. Programar

create_scheduled_request recibe y guarda ambos requisitos. El helper conserva jornada y deteccion de conflictos; la solicitud sigue requiriendo aceptacion profesional.

## 8. Presupuestar

Se filtran oportunidades, envio/edicion de propuesta y aceptacion. Retirar cobertura despues de cotizar impide contratar esa propuesta. El snapshot economico NORM-003 permanece intacto.

## 9. Recurrentes

El plan copia los requisitos del pedido fuente y el generador los transmite a cada visita. La seleccion de preferido evalua tambien las coordenadas del plan, que antes no se pasaban al candidato temporal. Editar ubicacion desde la UI permite elegir localidad y descarta coordenadas antiguas al cambiar direccion/localidad. No se alteraron frecuencia, agenda ni reglas de generacion.

## 10. Matching/ranking

La elegibilidad precede al ranking. La bonificacion backend de especialidad corresponde ahora a la especialidad requerida. La previsualizacion cliente consulta IDs elegibles por RPC; respuestas antiguas se descartan al cambiar datos. Elegir reemplazo manual usa el mismo filtro; no se cambia silenciosamente manual a automatico al publicar sin candidato.

## 11. UX

Selector accesible de localidad, opcion GPS con alternativa clara ante rechazo/no disponibilidad, especialidad explicita, cobertura profesional con checkboxes y guardado individual. Pedidos legacy abiertos sin ubicacion suficiente muestran una accion para completarla. No se redisenaron pantallas generales.

## 12. Seguridad/privacidad

Nuevas tablas con RLS. Catalogo solo lectura para authenticated; cobertura modificable exclusivamente por su propietario. Helpers privados sin EXECUTE para PUBLIC/anon/authenticated. RPCs publicas nuevas solo para authenticated y con controles de identidad/propiedad; search_path explicito vacio. Grants verificados en produccion. Coordenadas preaceptacion siguen ocultas. No se modificaron las reglas de PIN ni se ampliaron grants sobre sus datos.

## 13. Legacy/backfill

No se inventaron ubicaciones ni especialidades. Las nuevas columnas permanecen NULL en historial. Servicio sin especialidad sigue siendo valido; ubicacion desconocida no entra automaticamente. Se comprobo antes de migrar una solicitud existente sin coordenadas, que requiere completar localidad. El historial contratado no se reescribe.

## 14. Tests

- pnpm test: 218 tests, 30 archivos, todos pasan.
- pnpm exec tsc --noEmit: pasa.
- pnpm run vercel-build: pasa.
- SQL real: 35 comprobaciones con rollback, antes y despues de aplicar migracion.
- API real: 6 grupos de comprobaciones, incluidas 12 aceptaciones concurrentes y un unico ganador.
- Navegador Edge headless sobre build de produccion local y Supabase real: 390 y 1440 px, rechazo GPS simulado, seleccion manual, especialidad y publicacion real; sin pageerrors ni overflow horizontal.

Las pruebas de navegador anteriores cubren el formulario cliente. No equivalen a una certificacion de todas las pantallas ni a pruebas en hardware de telefono. La edicion de planes se verifico mediante TypeScript/build; el flujo SQL de generacion se ejercito realmente.

## 15. Pruebas reales

Cliente y profesionales independientes por API: carrera de aceptacion; accepted, llegada, PIN inicio, trabajo, PIN final y completed; profesional no obtiene PIN; request sin ubicacion rechazado; cobertura manual; cotizacion incompatible rechazada; anon rechazado. Se verifico en SQL retiro de cobertura entre propuesta y aceptacion y generacion recurrente con requisitos intactos. Fixtures remotos eliminados al terminar; archivos locales con credenciales temporales eliminados. Evidencia no secreta en outputs/prep-match-001, ignorado por Git.

## 16. Bugs corregidos

- NULL geografia permisivo y filtros ausentes en presupuestos.
- Especialidad escrita solo como texto.
- Requisitos perdidos al crear programados/recurrentes.
- Coordenadas cero convertidas en NULL en el formulario.
- Coordenadas anteriores conservadas al cambiar una direccion guardada sin GPS.
- Listas cliente/reemplazo que ofrecian candidatos incompatibles.
- Aceptacion con payment_method NULL fallaba por online_payment_required NOT NULL: se usa coalesce(..., false), sin nueva regla comercial.
- Etiquetado accesible ambiguo del selector de localidad.

## 17. Improvement Discovery

IMPLEMENTED: predicado compartido, defensa adicional por trigger, previsualizacion sin resultados obsoletos, reparacion de localidad legacy y propagacion a recurrencias.
RECOMMENDED: ampliar catalogo con datos oficiales y medir rendimiento al crecer el volumen; indices/geografia espacial cuando exista evidencia de necesidad.

## 18. Accepted Debt

Catalogo inicial acotado; fuera de esas localidades hace falta ampliarlo para fallback manual. No hay editor administrativo de localidades. Las suites SQL historicas que crean fixtures incompletos no se adaptaron ni se presentaron como ejecutadas: la suite nueva usa datos validos y las pruebas unitarias existentes siguen pasando.

## 19. Product Decisions Required

Ninguna para estas reglas. Cobertura mas granular que localidad completa y eventual soporte operativo de geocoding pueden evaluarse posteriormente, sin inferir cobertura retrospectivamente.

## 20. Riesgos restantes

Para operar sin GPS, los profesionales reales deben declarar su cobertura y los clientes completar una localidad valida. La migracion deliberadamente no inventa esas declaraciones. Las coordenadas/manual son datos aportados por usuarios, no una certificacion presencial. READY de matching no cambia el NO-GO global de otros bloqueantes NORM-014. Advertencias Auth preexistentes no fueron modificadas.

## 21. Archivos/migraciones

- supabase/migrations/20260909225833_prep_match_001_eligibility.sql
- supabase/tests/prep_match_001_smoke.sql
- app/components/ManitoV6App.tsx
- app/components/MatchingLocation.tsx
- app/components/RecurringServicesPanel.tsx
- app/lib/v6Api.ts
- app/lib/v6Types.ts
- app/lib/v6RecurringApi.ts
- tests/prep-match-001.test.ts
- scripts/prep-match-001-live.mjs
- scripts/prep-match-001-browser.cjs
- docs/PREP_MATCH_001_AUDIT_CHECKPOINT.md
- docs/PREP_MATCH_001_IMPLEMENTATION_REPORT.md

## 22. Commit/deploy

Migracion aplicada y representada en historial remoto con version 20260909225833. Implementacion publicada en `main` mediante el commit `9ee3f28`. El despliegue de Vercel finalizo correctamente y `https://bloody-eta.vercel.app` respondio HTTP 200 en la verificacion de cierre.

MATCHING PILOT READINESS: READY
