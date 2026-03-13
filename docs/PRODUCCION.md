# Produccion: deploy + backups + monitoreo

Este documento deja un camino directo para publicar Optica Suite con seguridad base operativa.

## 1) Preparar servidor (VPS)

Recomendado:

- Ubuntu 22.04+
- Docker + Docker Compose plugin
- DNS apuntando:
  - `APP_DOMAIN` -> IP del VPS
  - `API_DOMAIN` -> IP del VPS
- Puertos abiertos: `80` y `443`

## 2) Variables de produccion

1. En raiz del repo, copia:

```bash
cp .env.production.example .env.production
```

2. Completa secretos reales (especialmente `JWT_ACCESS_SECRET`, `POSTGRES_PASSWORD`).

3. Ejecuta preflight:

```bash
pnpm ops:prod:preflight
```

## 3) Levantar stack productivo

```bash
docker compose -f docker-compose.production.yml up -d --build
```

Primera migracion:

```bash
docker compose -f docker-compose.production.yml exec -T api pnpm --filter api prisma:migrate
```

Seed inicial (solo una vez, opcional):

```bash
docker compose -f docker-compose.production.yml exec -T api pnpm --filter api seed:demo
```

## 4) Verificar estado

```bash
pnpm ops:health -- --api https://api.tudominio.com/health --web https://optica.tudominio.com
```

Chequeo de backups:

```bash
pnpm backup:verify -- --max-hours 30
```

## 5) Backups y retencion

Generar backup manual:

```bash
pnpm backup:db -- --keep 14
```

Mantenimiento nocturno completo (backup + health + vigencia):

```bash
pnpm ops:nightly -- --api https://api.tudominio.com/health --web https://optica.tudominio.com --keep 14 --max-backup-hours 30
```

## 6) Automatizacion nocturna (GitHub Actions)

Workflow agregado: `.github/workflows/ops-nightly.yml`.

Configurar secrets:

- `PROD_SSH_HOST`
- `PROD_SSH_USER`
- `PROD_SSH_KEY`

Opcional variable:

- `PROD_APP_DIR` (por defecto `/opt/optica-suite`)

El workflow:

- crea backup diario en VPS,
- conserva ultimos 14,
- valida `https://APP_DOMAIN/` y `https://API_DOMAIN/health`,
- crea issue automaticamente si falla.

## 7) Restauracion de emergencia

Lista backups:

```bash
pnpm backup:list
```

Restaurar (confirmacion obligatoria):

```bash
pnpm restore:db -- --file data/backups/<archivo>.sql --yes
```

## 8) Hardening aplicado

- Validacion estricta de seguridad al arrancar API en `NODE_ENV=production`.
- Bloqueo de configuraciones debiles (`JWT_ACCESS_SECRET`, `AUTH_COOKIE_*`, `2FA admin`).
- Health readiness incluye DB + Redis para detectar degradacion real.
- TLS automatico con Caddy (Let's Encrypt) en dominios configurados.
