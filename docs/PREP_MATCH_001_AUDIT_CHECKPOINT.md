# PREP-MATCH-001 - Auditoria inicial

Nota de cierre: este documento conserva la auditoria inicial. El estado posterior esta en PREP_MATCH_001_IMPLEMENTATION_REPORT.md.

Estado: INCOMPLETO. No se implementaron cambios de matching ni se aplicaron migraciones.
Base local: 3e43d5c. Inspeccion de funciones y esquema real de Manito: 2026-09-09.

## Evidencia comprobada

- `private.manual_order_target_is_valid` permite cobertura mediante `distance_km(...) is null or distance <= radius` en produccion. Conserva controles de aprobacion, rubro, disponibilidad inmediata y jornada/conflictos.
- `private.start_immediate_matching_round_impl` tiene dos ramas NULL permisivas, para radio de ronda y radio profesional. Sus bonificaciones de especialidad comprueban cualquier especialidad del servicio, no una especialidad requerida por el pedido.
- `public.list_professional_opportunities`, version NORM-008, filtra rubro, rondas, solicitud manual, limite de propuestas y agenda, pero no contiene filtro geografico en su WHERE final.
- `private.send_order_proposal_impl` comprueba aprobacion y servicio; no comprueba cobertura ni especialidad requerida.
- `private.accept_proposal_impl` vuelve a comprobar aprobacion, servicio y agenda; no comprueba cobertura ni especialidad requerida. Debe conservar su snapshot contractual y locking actuales.
- `private.accept_order_impl` bloquea el pedido, valida invitacion inmediata y delega en `private.accept_order_pre_matching_impl`. La cadena delegada aun necesita inspeccion completa antes de editarla.
- `orders` no tiene ciudad estructurada ni especialidad requerida. Tiene `address`, `description`, `client_lat`, `client_lng`.
- `professional_profiles` tiene `work_city` de texto y `service_radius_km`. No se debe asumir que una ciudad base declara cobertura de toda la ciudad.
- Existen `specialties(id, service_id, active)` y `professional_specialties(professional_id, service_id, specialty_id)`; se pueden reutilizar sus identificadores.
- En `ManitoV6App.tsx`, `addSpecialtyToRequest` agrega texto a description/problemQuery. No persiste una eleccion estructurada; el estado visual utiliza coincidencias inferidas del texto.
- `createV6Order` no transmite ciudad separada. Ahora/Presupuestar insertan directamente; Programar utiliza `create_scheduled_order(p_data)`.
- `captureLocation` del formulario solo muestra un error generico cuando falla GPS y utiliza acceso opcional cuando geolocation no existe.
- El envio de coordenadas utiliza `coords?.lat || null` y `coords?.lng || null`: convierte coordenadas cero validas a NULL.
- Recurrentes comparte `private.create_scheduled_request` y `private.manual_order_target_is_valid`. Debe conservar los nuevos requisitos en pedidos derivados, sin cambiar frecuencia ni agenda.
- RLS orders: SELECT solo cliente, profesional asignado o admin; INSERT exige cliente autenticado. Las oportunidades son una interfaz RPC separada: preservar la direccion reducida y coordenadas nulas preaceptacion.

## Datos agregados observados

Una solicitud abierta; carece de par de coordenadas. Dieciocho perfiles profesionales con work_city no vacio. No se extrajeron direcciones personales ni credenciales.

## Diseno pendiente de implementar y verificar

1. Fuente normalizada de localidades/cobertura con identificadores estables, evitando confundir nombres iguales en diferentes jurisdicciones. Mar del Plata debe estar disponible sin cerrar el modelo a otras ciudades.
2. Declaracion explicita de cobertura manual profesional. No convertir automaticamente work_city en cobertura municipal completa.
3. Pedido con localidad normalizada y especialidad opcional, validada contra servicio/estado activo. No inferirla de description.
4. Predicado backend compartido: con ambos pares de coordenadas validos, distancia/radio; sin distancia calculable, cobertura normalizada explicita; sin evidencia suficiente, incompatible. Un resultado fuera de radio no debe rescatarse mediante fallback de ciudad.
5. Aplicar el mismo predicado a rondas, oportunidades, manual, envio de presupuesto y aceptaciones; revalidar al contratar. Mantener locking y condiciones de cada modalidad.
6. Propagar estos datos por create_scheduled_request y pedidos recurrentes. Bloquear cambios silenciosos posteriores a contratacion.
7. Frontend con especialidad opcional explicita, reiniciada al cambiar rubro; ubicacion manual usable sin GPS; no conservar coordenadas antiguas despues de cambiar direccion.
8. Backfill conservador: no interpretar direccion libre como ubicacion comprobada, no inventar especialidades. El pedido abierto sin coordenadas necesita completar ubicacion antes de matching confiable.
9. Revisar grants de columnas nuevas, triggers, snapshots, payloads y Realtime para no ampliar acceso a direccion precisa ni PIN.

## Verificacion pendiente

No se ejecutaron tests de implementacion porque todavia no existe una implementacion nueva.
Faltan los 18 escenarios solicitados, incluidos concurrencia, regresion NORM-006/007/008/012, SQL/API y UX sin GPS.
No hubo commit, push, deploy ni escrituras a produccion.

MATCHING PILOT READINESS: NOT READY
