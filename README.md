# Optica Suite

Monorepo con backend NestJS + Prisma y frontend React + Vite para gestion de optica.

## Requisitos

- Node.js 20+
- pnpm
- Docker

## Configuracion inicial

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

## URLs utiles

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/api`
- Web: `http://localhost:5173`

## Scripts principales

- `pnpm demo:setup`
- `pnpm dev:api`
- `pnpm dev:web`
- `pnpm db:down`
- `pnpm backup:db`
- `pnpm backup:list`
- `pnpm restore:db -- --file data/backups/<archivo>.sql --yes`

## Seguridad de sesion

- Access token JWT corto (`15m`) + refresh token rotativo.
- Refresco silencioso de sesion en la web.
- Invalidacion inmediata de sesiones cuando:
  - el usuario cambia su contrasena
  - un admin resetea contrasena de un usuario
  - un usuario se activa/desactiva
  - el usuario usa `logout-all`

Variable opcional en `apps/api/.env`:

- `JWT_REFRESH_DAYS` (default `7`)

## Reportes de negocio

Ruta API (solo `ADMIN`):

- `GET /reports/sales-summary?from=YYYY-MM-DD&to=YYYY-MM-DD`

La web incluye pestana **Reportes** con:

- resumen general (ventas, ingresos, ticket promedio, items, pacientes)
- ranking por usuario
- top monturas
- export CSV (serie diaria)

## Backup y restore (Postgres Docker)

1. Crear backup:

```bash
pnpm backup:db
```

2. Listar backups disponibles:

```bash
pnpm backup:list
```

3. Restaurar backup (pisa la base actual):

```bash
pnpm restore:db -- --file data/backups/optica_backup_YYYYMMDD_HHMMSS.sql --yes
```

Notas:

- Usa el contenedor `optica_db` por defecto.
- Puedes cambiar contenedor/credenciales con variables:
  - `DB_CONTAINER`
  - `POSTGRES_USER`
  - `POSTGRES_DB`