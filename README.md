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
- `pnpm dev:api`
- `pnpm dev:web`
- `pnpm ops:health`
- `pnpm db:down`

## Estructura

- `apps/api`: backend
- `apps/web`: frontend
- `scripts`: scripts operativos
- `docs`: documentacion tecnica

## Documentacion tecnica

- Mapa tecnico: [docs/technical-map.md](docs/technical-map.md)
- Staging/Deploy: [docs/staging.md](docs/staging.md)
