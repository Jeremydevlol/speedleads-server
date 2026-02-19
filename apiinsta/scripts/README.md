# Scripts – Scraping de búsqueda

Scripts que usan este repositorio para hacer **scraping de búsqueda** en Instagram (usuarios y hashtags). Requieren una cuenta de Instagram (usuario y contraseña).

## Requisitos

- Node.js (v6 o superior)
- Dependencias instaladas: `npm install` en la raíz del repo

## Búsqueda de usuarios

Devuelve una lista de usuarios que coinciden con el término (mismo tipo de búsqueda que en la app).

```bash
export IG_USERNAME=tu_usuario_instagram
export IG_PASSWORD=tu_password

node scripts/search-scrape.js "fitness"
```

Salida JSON: `{ "type": "users", "query": "fitness", "count": N, "users": [ { "id", "username", "fullName", "isPrivate", "followersCount", ... } ] }`.

## Búsqueda de hashtags

Devuelve hashtags que coinciden con el término.

```bash
node scripts/search-scrape.js hashtags "fitness"
```

Salida JSON: `{ "type": "hashtags", "query": "fitness", "count": N, "results": [ { "id", "name", "mediaCount" } ] }`.

## Proxy (opcional)

```bash
export IG_PROXY=http://usuario:password@host:puerto
node scripts/search-scrape.js "busqueda"
```

## Cookies

La sesión se guarda en `cookies/search-session.json`. Si la sesión sigue válida, no hará login de nuevo. Para forzar nuevo login, borra ese archivo.

## Notas

- Usa la **API privada** de Instagram (como la app). No abuses de la frecuencia para evitar límites o bloqueos.
- Si la cuenta tiene 2FA o checkpoint, el login puede fallar; en ese caso hay que resolverlo desde la app o el navegador primero.
