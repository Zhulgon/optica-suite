# Staging Setup

Este proyecto ya incluye base de despliegue staging:

- workflow CI: `.github/workflows/ci.yml`
- workflow de despliegue: `.github/workflows/staging-deploy.yml`
- compose staging: `docker-compose.staging.yml`
- dockerfiles: `apps/api/Dockerfile`, `apps/web/Dockerfile`

## 1) Qué hace el workflow de staging

`staging-deploy.yml`:
- construye imagen API y Web
- publica imágenes en GHCR (`optica-api:staging`, `optica-web:staging`)
- opcional: despliega por SSH a un VPS si configuras secretos

## 2) Variables/secretos requeridos en GitHub

Settings -> Secrets and variables -> Actions

Secrets:
- `STAGING_SSH_HOST`
- `STAGING_SSH_USER`
- `STAGING_SSH_KEY` (private key)
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `JWT_ACCESS_SECRET`

Variables:
- `STAGING_API_URL` (ejemplo: `https://staging-api.tudominio.com`)

Opcional:
- `GHCR_OWNER` en servidor (si no, usa valor por defecto del compose)

## 3) Despliegue en VPS (Docker Compose)

Precondiciones en servidor:
- Docker + Docker Compose
- acceso de red a puertos 3000 (API) y 8080 (Web), o reverse proxy propio

El workflow copia `docker-compose.staging.yml` a `/tmp/optica-compose.yml` y ejecuta:
- `docker compose pull`
- `docker compose up -d`

## 4) Primer arranque manual recomendado

En el VPS, una vez arriba:

```bash
docker compose -f /tmp/optica-compose.yml run --rm api pnpm --filter api prisma:migrate
```

Luego:

```bash
docker compose -f /tmp/optica-compose.yml up -d
```

## 5) Validación rápida

- API: `GET /` -> 200
- Swagger: `/api`
- Web: carga login en puerto 8080

Chequeo automatizado desde el repo:

```bash
pnpm ops:health -- --api http://localhost:3000/health --web http://localhost:8080
```

Notas:
- `docker-compose.staging.yml` incluye healthcheck en `db`, `api` y `web`.
- `api` espera `db` saludable y `web` espera `api` saludable con `depends_on.condition`.
