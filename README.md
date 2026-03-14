# Optica Suite

Aplicacion web para gestion comercial y operativa de opticas.

## Stack

- Backend: NestJS + Prisma + PostgreSQL
- Frontend: React + Vite + TypeScript
- Monorepo: pnpm workspaces
- Infra local: Docker Compose

## Inicio rapido

Requisitos:

- Node.js 20+
- pnpm
- Docker

Instalacion:

```bash
pnpm install
```

Variables de entorno:

- `apps/api/.env` (copiar desde `apps/api/.env.example`)
- `apps/web/.env` (copiar desde `apps/web/.env.example`)
- Opcionales en web para comprobante comercial: `VITE_BUSINESS_NAME`, `VITE_BUSINESS_NIT`, `VITE_BUSINESS_PHONE`, `VITE_BUSINESS_ADDRESS`

Levantar entorno local:

```bash
pnpm start:all
```

URLs locales:

- Web: `http://localhost:5173`
- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/api`

## Scripts utiles

- `pnpm demo:setup`
- `pnpm start:all`
- `pnpm start:fast`
- `pnpm lan:install`
- `pnpm lan:start`
- `pnpm lan:status`
- `pnpm lan:stop`
- `pnpm dev:api`
- `pnpm dev:web`
- `pnpm ops:health`
- `pnpm ops:nightly`
- `pnpm ops:prod:preflight`
- `pnpm qa:full`
- `pnpm db:generate` (si actualizas Prisma y la API esta detenida)
- `pnpm backup:db`
- `pnpm backup:db:keep` (genera backup y mantiene los ultimos 14)
- `pnpm backup:verify`
- `pnpm backup:list`
- `pnpm restore:db -- --file data/backups/<archivo>.sql --yes`
- `pnpm db:down`

## Seguridad (resumen)

- 2FA TOTP para cuentas `ADMIN`, con QR en pantalla para setup.
- "Confiar este equipo" (30 dias) y desafio 2FA por riesgo (dispositivo/IP nuevos).
- Codigos de recuperacion 2FA de un solo uso (regenerables por ADMIN).
- Refresh token y "trusted device token" manejados por cookie `HttpOnly` (no en localStorage).
- Rate-limit de login con Redis por IP y correo (fallback en memoria si Redis no esta disponible).
- CORS estricto por lista de origenes (`CORS_ORIGINS`) y `helmet` activo.
- CSP activa en API y validaciones de configuracion segura en produccion.
- Swagger deshabilitable en produccion (`ENABLE_SWAGGER=false`).

## QA y respaldos

Validacion funcional integral (API + flujos principales):

```bash
pnpm qa:full
```

Opciones:

```bash
pnpm qa:full -- --api http://localhost:3000 --email demo@optica.local --password Demo12345
pnpm qa:full -- --no-cleanup
```

Backups operativos:

```bash
pnpm backup:db
pnpm backup:db:keep
pnpm backup:db -- --keep 7
pnpm backup:list
```

## Estructura

- `apps/api`: backend
- `apps/web`: frontend
- `scripts`: scripts operativos
- `docs`: documentacion tecnica

## Documentacion tecnica

- Mapa tecnico: [docs/technical-map.md](docs/technical-map.md)
- Staging/Deploy: [docs/staging.md](docs/staging.md)
- Produccion/Runbook: [docs/PRODUCCION.md](docs/PRODUCCION.md)
- Instalador LAN empresas: [docs/INSTALADOR_LAN_EMPRESA.md](docs/INSTALADOR_LAN_EMPRESA.md)
- Manual de usuario: [docs/MANUAL_USUARIO.md](docs/MANUAL_USUARIO.md)
- Roadmap empresarial: [docs/ROADMAP_EMPRESARIAL.md](docs/ROADMAP_EMPRESARIAL.md)
- Paquete comercial: [docs/comercial/PAQUETE_COMERCIAL.md](docs/comercial/PAQUETE_COMERCIAL.md)
