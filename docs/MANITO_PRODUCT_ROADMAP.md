# MANITO - roadmap funcional

Este documento ordena lo que falta para que MANITO pase de beta usable a app web movil realmente funcional, eficiente y practica. La idea es desarrollar por modulos chicos, verificables y deployables.

## 1. Base de producto

- Una cuenta unica con modo Cliente y modo Profesional dentro de la app.
- Perfil persistente con nombre, telefono, ciudad, direcciones, contacto de confianza y preferencias.
- Modelo de datos estable para pedidos, propuestas, adicionales, chat, pagos, evidencias, calificaciones y reclamos.
- Reglas RLS coherentes: cada usuario ve y modifica solo lo suyo, y los profesionales solo ven oportunidades compatibles.
- Datos demo diferenciados de datos reales para no confundir testers.

## 2. Flujo cliente

- Busqueda por rubro y por descripcion del problema.
- Recomendacion automatica de categoria, modalidad y precio estimado.
- Ficha de pedido completa: direccion, ciudad, GPS, descripcion, fotos/videos, urgencia, horario, metodo de pago y profesional preferido.
- Seleccion manual de profesional con perfil publico, distancia, reputacion, precio y disponibilidad.
- Pedido publicado con estado claro: buscando, aceptado, en camino, en sitio, finalizado, cancelado.
- Avisos en la pantalla principal cuando hay una cita pendiente.
- Seguimiento con chat, telefono protegido, PIN inicio/final y solicitud de adicionales.
- Historial, repetir pedido, favoritos y pedidos recurrentes.
- Reclamos, garantia MANITO y calificacion al finalizar.

## 3. Flujo profesional

- Alta profesional dentro de la misma cuenta, sin cerrar sesion.
- Wizard de verificacion: datos personales, DNI, selfie, CUIT/CUIL, CBU/CVU, seguro/matricula, antecedentes y terminos.
- Perfil publico: titulo, descripcion, experiencia, portfolio, fotos, links, rating y trabajos realizados.
- Servicios ofrecidos con tarifas por rubro, especialidades, radio de cobertura, ciudad/zona y horarios.
- Estado disponible/no disponible y reglas para pausar recepcion de trabajos.
- Bandeja de oportunidades compatibles por rubro/zona/disponibilidad.
- Envio de presupuesto con visita, mano de obra, materiales, fee y observaciones.
- Aceptacion de pedidos directos, avance de estados y pedido de adicionales.
- Panel de ingresos, trabajos completados, reputacion y cumplimiento.

## 4. Operacion y administracion

- Panel MANITO para aprobar/rechazar altas profesionales y ver documentos.
- Auditoria de cambios criticos: aprobaciones, suspensiones, reclamos, pagos y extras.
- Gestion de categorias, subrubros, precios base, zonas, comisiones y promos.
- Moderacion de chats, evidencias y reclamos.
- Metricas: pedidos por estado, conversion, tiempos, rubros demandados, profesionales activos y rating.

## 5. Pagos y dinero

- Lenguaje local: billetera, transferencia, efectivo y tarjeta.
- Metodos de pago guardados por usuario.
- Base marketplace para pagos: tabla `payments`, cuenta de cobro por profesional, credenciales privadas para OAuth, eventos de proveedor y estados de pago por pedido.
- Presupuesto y precio final separado en visita, mano de obra, materiales, adicional y fee MANITO.
- Flujo de adicionales aceptados por cliente antes de sumarse al precio.
- Recibos/comprobantes y conciliacion interna.
- Cuenta DNI/billetera como preferencia de pago coordinada por QR/link; integracion real futura recomendada con Mercado Pago Checkout Pro marketplace, OAuth por profesional, split de comision y webhooks.

## 6. Notificaciones y comunicacion

- Email correcto para alta, confirmacion y recuperacion.
- Avisos in-app para cita pendiente, pedido aceptado, profesional en camino, adicional solicitado y chat nuevo.
- Push/PWA cuando se instale en el celular.
- WhatsApp/SMS opcional para recordatorios criticos.
- Mensajes claros cuando una accion queda pendiente de confirmacion.

## 7. PWA y distribucion

- Instalable en Android/iOS como app web movil.
- Iconos, manifest, theme color y pantalla de carga pulidos.
- Dominio propio cuando se defina marca final.
- Redirects de Supabase correctos para Vercel y dominio final.
- Pagina de confirmacion de email robusta ante reloj desfasado/JWT futuro.

## 8. Seguridad y privacidad

- Nunca exponer service role ni secretos en frontend.
- Separar documentos sensibles de medios publicos.
- RLS por tabla y pruebas de permisos por rol/escenario.
- Politicas de Storage con owner por carpeta.
- Datos sensibles de profesionales con minimo necesario y acceso de admin.
- Telefono protegido hasta que el pedido este aceptado o en etapa habilitada.

## 9. Calidad y eficiencia

- Tests de clasificacion, matching, pedidos, propuestas y permisos.
- Checks visuales moviles para pantallas clave.
- Estados de carga, error y exito consistentes.
- Evitar botones sin accion.
- Formularios con validacion y mensajes locales.
- Indices para consultas frecuentes: pedidos por estado/rubro/zona, servicios de profesional, chats y propuestas.

## Modulos de desarrollo sugeridos

1. Disponibilidad profesional persistente: zona, radio, dias, horarios y tarifas. Estado: implementado.
2. Evidencias reales del pedido: subir fotos antes/durante/despues y verlas en seguimiento. Estado: implementado para fotos iniciales del cliente.
3. Wizard profesional por pasos reales, con guardado parcial y resumen final. Estado: implementado en UI; falta persistir DNI/fecha como datos sensibles separados.
4. Matching por rubro/zona/disponibilidad usando datos del profesional. Estado: implementado en frontend; falta mover scoring a backend cuando haya mas volumen.
5. Cita pendiente y notificaciones in-app persistentes. Estado: implementado aviso in-app en Inicio y Pedidos; falta push/PWA.
6. Chat y contacto del prestador con reglas claras de privacidad. Estado: chat operativo para pedidos aceptados y preferencia de telefono protegida; falta enforcement backend fino.
7. Admin de altas profesionales y documentos.
8. Pagos/adicionales mas robustos. Estado: metodos deduplicados, Cuenta DNI/billetera agregada como preferencia, datos de cobro profesional privados y base marketplace preparada; falta implementar OAuth Mercado Pago, crear preferencias Checkout Pro, webhook y flujo de reembolso.
9. PWA completa con iconos y manifest final. Estado: base instalada; falta iconografia final de marca.
10. QA de permisos y pruebas moviles antes de invitar testers mas amplios.
11. Categorias y subrubros. Estado: implementado grupo Automotor con subrubros mecanica, gomeria y chapa/pintura; falta admin editable.
12. Confirmacion de email. Estado: robustecida para Vercel y reloj desfasado/JWT futuro.
