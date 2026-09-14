# BRAND-002 REFERENCE REVISION REPORT

## 1. Logo seleccionado

Se reemplazó la reconstrucción anterior por recortes exactos de la lámina aprobada. No se redibujó el símbolo ni se alteraron sus colores.

## 2. Variantes creadas

- Logo horizontal superior para acceso y pantallas de marca.
- App icon inferior para instalación, favicon y header compacto.
- Isotipo independiente y composición vertical, preservados para usos futuros.

## 3. Assets creados/reemplazados

La lámina original se conserva sin cambios en `public/brand/source`. `scripts/extract-brand-reference.ps1` reproduce los encuadres aprobados y genera los tamaños técnicos de 64, 180, 192 y 512 px. La familia reconstruida anterior se conserva en `public/brand/archive/brand-002-reconstructed`.

## 4. Cambios en header

El header utiliza el app icon exacto de la referencia a 38 px en mobile y 44 px en pantallas mayores. La ubicación, el cambio de experiencia y las notificaciones conservan su funcionamiento.

## 5. Cambios PWA/favicon

El manifest usa derivados fieles del app icon en 192/512 px y un maskable de 512 px. Next metadata apunta al favicon PNG, Apple touch icon y logo horizontal de referencia para Open Graph.

## 6. Referencias antiguas eliminadas

Acceso, confirmación, carga, configuración, header, metadata, manifest y caché offline apuntan exclusivamente a los recortes aprobados. Los assets anteriores quedan archivados sin referencias activas.

## 7. Responsive

Los recortes conservan su proporción y no generan overflow. Se validan acceso, header Cliente y header Profesional en 360x800 y 390x844, más desktop en 1280x844.

## 8. Validación

La suite comprueba fuente original, archivo histórico, dimensiones PNG, referencias activas, manifest, favicon y versionado de caché. Browser QA comprueba render, tamaño físico del header, ausencia de overflow y disponibilidad HTTP de los iconos PWA.

## 9. Archivos modificados

- `app/components/AuthConfirmationScreen.tsx`
- `app/components/ManitoV6App.tsx`
- `app/components/SetupNotice.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `public/brand/*`
- `public/manifest.webmanifest`
- `public/sw.js`
- `scripts/brand002-browser.cjs`
- `scripts/generate-brand-assets.cjs`
- `scripts/extract-brand-reference.ps1`
- `tests/brand-002.test.ts`

## 10. Commit

El SHA del commit de cierre se informa junto con la entrega desplegada.

## 11. Deploy

El despliegue se realiza después de la validación final sobre el mismo commit auditado.

## 12. Deuda menor restante

La lámina fuente es JPG y contiene una textura muy leve propia de la imagen aprobada. Se conserva deliberadamente para respetar el pedido de no modificar el diseño.

BRAND-002: READY FOR VISUAL REVIEW
