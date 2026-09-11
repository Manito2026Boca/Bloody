# UX-001R HUMAN REVIEW IMPLEMENTATION REPORT

## 1. Resumen

UX-001R corrige los problemas observados en teléfono sin cambiar reglas contractuales ni de matching. La ubicación ahora es accionable y confirmable, las solicitudes sin candidatos tienen recuperación, el reintento es perceptible y atómico, y la configuración Profesional usa progressive disclosure. Se creó además un set persistente de 18 cuentas QA identificadas como ficticias.

## 2. Causa raíz de cada problema

- Ubicación: el encabezado mostraba una etiqueta sin acción y el GPS se consideraba listo antes de que el usuario pudiera verificar el resultado.
- Responsive: varias grillas y filas flex permitían contracción destructiva; el CTA inferior no reservaba suficiente espacio sobre la navegación.
- Edición: el flujo sólo conservaba el borrador previo a publicar; no existía una frontera segura para editar pedidos aún no contratados.
- Reintento: la acción no tenía feedback ni guardia contra doble envío. Además, RPC y trigger podían iniciar dos rondas para un único intento.
- Notificaciones: transiciones internas de matching generaban mensajes genéricos y el doble despacho producía eventos repetidos.
- Servicios: el estado visual esperaba persistencia y refetch; se mostraba el catálogo completo con todas sus especialidades.
- Agenda: el estado vacío se expresaba con horarios nulos y mezclaba disponibilidad inmediata con horario habitual.

## 3. Ubicación

`Agregar ciudad` abre un editor compacto. Permite GPS o ubicación manual. El GPS muestra localidad, detalle legible cuando está disponible y coordenadas; el usuario debe confirmarlo antes de continuar. Ante rechazo, error o geocodificación insuficiente se ofrece ingreso manual inmediato. Se conserva la distinción PREP-MATCH-001 entre coordenadas válidas y cobertura manual normalizada.

## 4. Responsive

Se corrigieron anchos mínimos, contracción, wrapping, precios, chips horizontales, paneles, sheets, safe areas y separación respecto de la navegación inferior. Se validaron 360, 390 y 1280 píxeles sin overflow horizontal.

## 5. Edición de solicitud

El Cliente puede editar una solicitud propia mientras no exista contrato ni propuesta activa. Se preservan servicio, especialidad, descripción, ubicación, modalidad, horario, asignación, profesional preferido y pago. La RPC rechaza pedidos ajenos, estados incompatibles y contratos ya congelados.

## 6. Reintentar búsqueda

La acción muestra `Buscando profesionales...`, impide doble submit y refresca el resultado. Backend usa advisory lock y cooldown corto. El trigger existente quedó como único despachador de la ronda, eliminando el doble inicio detectado durante QA adversarial.

## 7. Selección manual

Cuando hay candidatos se mantienen seleccionables. Con cero compatibles aparece una explicación humana y `Editar búsqueda`, sin afirmar una causa que el backend no conoce.

## 8. Notificaciones

Las transiciones internas de matching ya no crean avisos genéricos. Los eventos conocidos usan microcopy específica y el nombre del profesional. Se verificó que dos reintentos inmediatos produzcan una sola ronda y un solo aviso lógico.

## 9. Servicios/especialidades

La vista muestra primero servicios seleccionados. El catálogo se abre sólo al agregar o editar, incluye búsqueda y muestra especialidades únicamente para el servicio activo. Los taps actualizan la UI de inmediato, persisten en segundo plano y revierten con error si la operación falla.

## 10. Agenda

Disponibilidad Ahora y horario habitual quedaron separados. El vacío ofrece `Configurar horarios`; una agenda configurada muestra días y franjas reales. Ya no se presenta `--:--` como contenido normal.

## 11. Header

El encabezado mobile se redujo a una fila compacta. Ubicación, cambio Cliente/Profesional y notificaciones siguen accesibles sin competir con la acción principal.

## 12. Trabajo sin candidatos

La pantalla prioriza qué ocurrió y las dos recuperaciones posibles: reintentar con los criterios actuales o editar la solicitud. La información secundaria permanece debajo.

## 13. Usuarios QA creados

Se crearon dos clientes y dieciséis profesionales persistentes. Todos tienen metadata `manito_qa`, correos bajo `qa.manito.invalid` y datos explícitamente ficticios. El script idempotente exige contraseña por variable de entorno y nunca la escribe en el repositorio.

## 14. Configuración de cada Profesional QA

Cada rubro tiene un profesional aprobado, disponible para Ahora, con tres especialidades válidas, cobertura Mar del Plata, coordenadas, radio de 15 km y horario habitual de lunes a sábado de 08:00 a 20:00. Se usan iniciales/avatar genérico y no fotos reales.

## 15. Tests reales Cliente - Profesional

En transacción de rollback se verificó: creación manual de Plomería, aceptación por Caño Ibagaza, avance, PIN inicial visible sólo al Cliente, inicio por Profesional, PIN final, finalización y ausencia de duplicados lógicos.

## 16. Matching

- Plomería: Caño elegible y Rayo excluido.
- Electricidad: Rayo elegible y Caño excluido.
- Autoasignación: la misma cuenta no puede aceptar su pedido.
- Manual: el backend vuelve a validar compatibilidad al editar/seleccionar.

## 17. Realtime

Se conservaron las suscripciones actuales. La corrección elimina duplicados en el origen en vez de ocultarlos en frontend. El panel mobile tiene altura acotada, scroll interno, cierre y safe areas.

## 18. Bugs relacionados descubiertos

Un reintento ejecutaba matching dos veces: la RPC despachaba directamente y luego el trigger reaccionaba a la misma actualización. La prueba adversarial produjo dos avisos antes del fix.

## 19. IMPLEMENTED

- Ubicación general y de pedido confirmable.
- Fallback manual contextual.
- Edición precontractual segura.
- Retry con feedback, lock, cooldown y despacho único.
- Recuperación para cero candidatos.
- Notificaciones específicas sin duplicación del evento lógico probado.
- Servicios/especialidades progresivos y optimistas.
- Agenda comprensible.
- Header y responsive mobile corregidos.
- Onboarding agrupado visualmente en cinco etapas sin quitar requisitos.
- Dieciocho cuentas QA persistentes y recreables.

## 20. RECOMMENDED

- Activar protección de contraseñas filtradas en Supabase Auth antes del piloto abierto.
- Revisar con datos reales si el onboarding agrupado necesita autosave durable entre sesiones.
- Consolidar en una etapa futura las policies permisivas duplicadas y los índices faltantes reportados por el advisor.

## 21. PRODUCT_DECISION_REQUIRED

Ninguna decisión contractual, comercial o central de marketplace fue necesaria para completar UX-001R.

## 22. ACCEPTED_DEBT

- La geocodificación pública puede devolver sólo localidad; la UI lo comunica sin inventar calle.
- No se agregó persistencia multidispositivo del borrador.
- Los avisos históricos ya existentes se depuraron sólo cuando eran duplicados exactos; no se reescribió toda la historia.

## 23. Tests automáticos

- Vitest: 32 archivos, 233 tests aprobados.
- TypeScript: aprobado con `pnpm exec tsc --noEmit`.
- Build: aprobado con `pnpm run vercel-build`.
- Tests SQL reales: permisos RPC, edición owner/no-owner, matching cruzado, autoasignación, retry simple/concurrente y flujo completo Cliente-Profesional.

## 24. Browser QA

Playwright autenticado aprobó Cliente en 360, 390 y 1280 px y Profesional en 390 px. Se revisaron Home, ubicación, necesidad, modalidad, notificaciones, Hoy, Agenda, servicios y catálogo; no se detectó overflow horizontal.

## 25. Archivos modificados

- `app/components/ManitoUx.tsx`
- `app/components/ManitoV6App.tsx`
- `app/globals.css`
- `app/lib/v6Api.ts`
- `scripts/seed-qa-users.mjs`
- `scripts/ux001r-browser.cjs`
- `tests/prep-match-001.test.ts`
- `tests/ux-001-progressive-experience.test.ts`
- `tests/ux-001r-human-review.test.ts`
- Este informe.

## 26. Migraciones

- `20260911170000_ux_001r_human_review_fixes.sql`
- `20260911173000_ux_001r_notification_copy.sql`
- `20260911180000_ux_001r_retry_single_dispatch.sql`

Las tres están aplicadas en producción y aparecen en el historial remoto.

## 27. Commit

El hash del commit se informa junto con la entrega desplegada, ya que este documento forma parte de ese mismo commit.

## 28. Deploy

La URL y el estado del deploy se informan al finalizar la publicación.

# QA ACCOUNTS

Clientes:

- `cliente.qa1@qa.manito.invalid`
- `cliente.qa2@qa.manito.invalid`

Profesionales:

- `prof.plomeria@qa.manito.invalid`
- `prof.electricidad@qa.manito.invalid`
- `prof.limpieza@qa.manito.invalid`
- `prof.gas@qa.manito.invalid`
- `prof.cerrajeria@qa.manito.invalid`
- `prof.pintura@qa.manito.invalid`
- `prof.jardin@qa.manito.invalid`
- `prof.arreglos@qa.manito.invalid`
- `prof.aire@qa.manito.invalid`
- `prof.electro@qa.manito.invalid`
- `prof.mudanzas@qa.manito.invalid`
- `prof.carpinteria@qa.manito.invalid`
- `prof.fumigacion@qa.manito.invalid`
- `prof.tecnologia@qa.manito.invalid`
- `prof.albanileria@qa.manito.invalid`
- `prof.pileta@qa.manito.invalid`

La contraseña QA no está almacenada en git. Se entrega al responsable del test por un canal separado.

# HUMAN REVIEW CHECKLIST

1. Entrar como Cliente QA 1 y configurar `Agregar ciudad` manualmente.
2. Crear Plomería con GPS y confirmar la ubicación detectada.
3. Verificar selección manual con Caño y exclusión de Rayo.
4. Provocar cero candidatos, editar la solicitud y reintentar.
5. Entrar como Caño, aceptar y completar el flujo con Cliente QA 1.
6. Revisar que cada evento produzca un único aviso.
7. Revisar Servicios, especialidades y respuesta inmediata de los taps.
8. Revisar disponibilidad Ahora y Agenda configurada.
9. Repetir en un teléfono angosto y comprobar que precios/textos no se corten.

UX-001R: READY FOR HUMAN RETEST
