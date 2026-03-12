# Optica Suite

Monorepo con backend NestJS + Prisma y frontend React + Vite para gestión de óptica.

## Requisitos

- Node.js 20+
- pnpm
- Docker

## Configuración inicial

1. Instalar dependencias:

```bash
pnpm install
```

2. Crear variables de entorno:

- Copia `apps/api/.env.example` como `apps/api/.env`
- Copia `apps/web/.env.example` como `apps/web/.env`

## Levantar demo local (todo listo para probar)

```bash
pnpm demo:setup
```

Este comando:

- levanta Postgres con Docker
- ejecuta migraciones Prisma
- genera cliente Prisma
- crea/actualiza un usuario demo

Luego inicia apps en dos terminales:

```bash
pnpm dev:api
pnpm dev:web
```

## Credenciales demo por defecto

- Email: `demo@optica.local`
- Password: `Demo12345`
- Rol: `ADMIN`

Puedes cambiarlas con variables opcionales en `apps/api/.env`:

- `DEMO_EMAIL`
- `DEMO_PASSWORD`
- `DEMO_NAME`
- `DEMO_ROLE` (`ADMIN`, `ASESOR`, `OPTOMETRA`)

## URLs útiles

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/api`
- Web: `http://localhost:5173`

## Scripts principales

- `pnpm demo:setup`
- `pnpm dev:api`
- `pnpm dev:web`
- `pnpm db:down`
