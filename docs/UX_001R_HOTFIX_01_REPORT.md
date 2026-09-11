# UX-001R HOTFIX 01 REPORT

## 1. Causa raíz ubicación

La ubicación del pedido estaba repartida entre dirección, localidad, coordenadas GPS y ubicación guardada sin una autoridad explícita. Aunque varias interacciones manuales limpiaban coordenadas, algunos recorridos podían conservar el GPS anterior y combinarlo con el texto corregido.

## 2. Cambio realizado

Se agregó una autoridad explícita para la ubicación del pedido (`gps`, `manual`, `manual_geocoded` o `saved`). Toda entrada manual invalida de inmediato la detección GPS anterior. Al confirmar, el flujo geocodifica la dirección manual cuando es posible y actualiza dirección, localidad y coordenadas como una unidad.

## 3. Ubicación autoritativa

- GPS confirmado: conserva los datos y coordenadas detectados.
- Ubicación manual geocodificada: reemplaza íntegramente al GPS previo.
- Ubicación manual no geocodificable: conserva dirección/localidad y usa una localidad normalizada válida para el matching.
- Ubicación guardada: usa sus coordenadas sólo cuando pertenecen a esa ubicación.

El resumen del paso Lugar muestra la ubicación efectivamente confirmada y se conserva al avanzar y volver.

## 4. Coordenadas stale

Al comenzar una corrección manual se eliminan las coordenadas GPS previas. Además, el payload de elegibilidad, creación, edición y guardado pasa por un helper que sólo admite coordenadas compatibles con la autoridad vigente. Una ubicación manual sin geocodificación envía `lat/lng = null`, habilitando el fallback manual de PREP-MATCH-001 sin reutilizar coordenadas obsoletas.

## 5. Causa raíz layout mobile

El asistente dependía del scroll general de la página mientras convivían una navegación inferior fija y un pie de acciones sticky. Con alturas móviles dinámicas, el contenido podía continuar por detrás de ambas capas; agregar espacio local a controles concretos no resolvía esa estructura.

## 6. Solución estructural

En mobile, el flujo activo ocupa `100dvh` y usa una grilla vertical acotada. El encabezado queda arriba; el paso actual es el único contenedor con scroll; las acciones Atrás/Continuar y la navegación inferior quedan fuera de ese scroll. Se contemplan `safe-area-inset-bottom`, `min-height: 0`, overflow vertical y cambios dinámicos de altura del navegador.

## 7. Pasos auditados

Se recorrieron Necesidad, Lugar, Modalidad, Resolución y Revisión. La validación cubrió especialidad, fotos, las tres modalidades, asignación manual, profesionales compatibles y los medios de pago. La selección manual continúa mostrando a Ariel "Caño" Ibagaza para Plomería; las reglas de elegibilidad y prohibición de autoasignación no cambiaron.

## 8. Tests

Se agregaron pruebas para autoridad GPS, reemplazo GPS A por ubicación manual B, fallback manual sin coordenadas, payload autoritativo y estructura mobile. También se actualizó la regresión PREP-MATCH-001 para verificar que la elegibilidad consume únicamente coordenadas autoritativas.

## 9. Browser/mobile QA

El recorrido browser valida físicamente los límites verticales de Presupuestar, Efectivo, el pie de acciones y la navegación inferior en 360x800 y 390x844. También repite la verificación a 700 px de alto para simular chrome móvil dinámico, y comprueba desktop 1280x844. Se verifica volver de Modalidad a Lugar, mantener la dirección manual B y conservar la selección manual compatible.

## 10. Archivos modificados

- `app/components/ManitoV6App.tsx`
- `app/globals.css`
- `app/lib/requestLocation.ts`
- `scripts/ux001r-browser.cjs`
- `tests/prep-match-001.test.ts`
- `tests/ux-001r-hotfix-01.test.ts`
- `docs/UX_001R_HOTFIX_01_REPORT.md`

## 11. Commit

Se completa al cerrar la validación final.

## 12. Deploy

Se completa después del commit, con verificación de las URLs públicas.

UX-001R HOTFIX 01: READY FOR HUMAN RETEST
