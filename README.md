# SpeedLeads Backend

API y Socket.IO para SpeedLeads (WhatsApp, personalidades, leads, calendario, etc.).

## Desarrollo local

```bash
npm install
npm run start
```

Servidor en `http://localhost:5001`. Frontend en `.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:5001`.

## Producción

`npm run start` con variables de entorno en `.env` (Supabase, JWT_SECRET, Stripe, etc.).

Opcional: `VERBOSE_WHATSAPP=1` para ver logs detallados de sincronización de contactos (por defecto va silencioso para no saturar consola).
