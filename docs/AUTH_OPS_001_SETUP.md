# AUTH-OPS-001 — configuración operativa

Este archivo no contiene secretos. Las credenciales SMTP deben cargarse únicamente en Supabase Dashboard.

## SMTP requerido

Configurar un proveedor transaccional en `Authentication > Emails > SMTP Settings`:

- Host y puerto SMTP.
- Usuario SMTP.
- Contraseña o API key SMTP.
- Remitente verificado, recomendado: `MANITO <no-reply@auth.DOMINIO_PROPIO>`.
- TLS habilitado.

No usar el correo predeterminado de Supabase para usuarios públicos.

## URLs de Auth

- Site URL: `https://bloody-eta.vercel.app`
- Redirect URL permitida: `https://bloody-eta.vercel.app/auth/callback`

No hacen falta comodines ni dominios adicionales para producción. Los parámetros `flow=signup` y `flow=recovery` se conservan sobre ese callback. El service worker excluye `/auth/*` de caché, por lo que el enlace también abre correctamente desde la PWA.

## Templates

Copiar en Supabase los archivos:

- `supabase/templates/confirmation.html`
- `supabase/templates/recovery.html`

Asuntos recomendados:

- `Confirmá tu cuenta MANITO`
- `Recuperá tu cuenta MANITO`

## DNS y entregabilidad

En el DNS del dominio remitente deben publicarse los registros exactos entregados por el proveedor:

- SPF: autoriza al proveedor a enviar por el dominio.
- DKIM: firma los mensajes; obligatorio para una entrega confiable.
- DMARC: comenzar con `p=none` y reportes; endurecer después de verificar SPF/DKIM.

No publicar valores genéricos: cada proveedor entrega sus propios registros.

## Validación posterior

Probar recepción y confirmación real con cuentas nuevas Gmail, Yahoo y Outlook. Para cada una verificar `created_at`, `confirmation_sent_at`, `email_confirmed_at` y `last_sign_in_at`. `confirmation_sent_at` por sí solo no acredita entrega.

Después de habilitar SMTP, usar la acción de reenvío de MANITO sobre la cuenta Yahoo pendiente. No borrarla ni confirmarla manualmente.
