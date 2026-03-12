# Optica Suite - Technical Map (1-page)

## 1) Product Goal
Business and commercial platform for optical stores:
- patient lifecycle
- clinical history lifecycle
- sales and inventory traceability
- user/role governance
- audit and management reporting

## 2) Architecture Snapshot
- Monorepo with workspace tooling (`pnpm`).
- Backend: NestJS + Prisma + PostgreSQL.
- Frontend: React + Vite + TypeScript.
- Infrastructure (local): Docker Compose (Postgres).

Top-level paths:
- `apps/api`: backend API (NestJS modules by domain)
- `apps/web`: frontend app (single React app with tabs by module)
- `scripts`: operational scripts (backup/restore/list)

## 3) Delivery Methodology In Practice
- Iterative incremental delivery (small vertical slices end-to-end).
- Kanban-like flow (prioritized backlog, one completed change at a time).
- Continuous delivery on `main` with explicit commits and push.
- Business-first sequencing: security -> operations -> reports -> scale.

## 4) Core Backend Patterns
- Layered architecture per module:
  - `Controller` (HTTP contract)
  - `Service` (business rules)
  - `Prisma` (persistence)
- Modular monolith by domain:
  - `auth`, `users`, `patients`, `clinical-histories`, `sales`, `frames`, `inventory-movements`, `audit-logs`, `reports`
- DTO + validation:
  - Input DTOs + global `ValidationPipe`
- Authorization:
  - `JwtAuthGuard` + `RolesGuard` + `@Roles(...)`
- Strategy pattern:
  - `JwtStrategy` for token validation
- Transactional consistency:
  - Prisma transactions in critical writes (sales, password/session security changes)
- Cross-cutting audit:
  - central log writes from controllers for sensitive actions

## 5) Security Model (Current)
- Access token short-lived JWT.
- Rotating refresh tokens persisted hashed in DB (`RefreshToken`).
- Silent refresh in web client.
- Session invalidation by `tokenVersion`:
  - password change
  - admin password reset
  - user activation/deactivation
  - logout-all
- Login protections:
  - per-user failed-attempt lockout
  - per-IP login throttling

## 6) Key Business Flows
- Login:
  - `/auth/login` -> `accessToken + refreshToken + user`
- Silent refresh:
  - `/auth/refresh` rotates refresh token and returns new session pair
- Logout:
  - `/auth/logout` revokes current refresh token
  - `/auth/logout-all` revokes all refresh tokens + increments `tokenVersion`
- Sales:
  - validates stock -> writes sale/items -> writes inventory movement -> decrements frame stock
- Clinical history:
  - create/list by patient, printable clinical format
- Reports (admin):
  - `/reports/sales-summary` aggregates totals, payment methods, users, roles, top frames, daily series

## 7) Core Data Domains (Prisma)
- `User`, `RefreshToken`, `AuditLog`
- `Patient`, `ClinicalHistory`
- `Frame`, `InventoryMovement`
- `Sale`, `SaleItem`

Rule of thumb:
- Sales and inventory are strongly coupled by transaction.
- Session state is controlled by `RefreshToken` rows + `User.tokenVersion`.

## 8) Frontend Technical Shape
- Single app shell with tab navigation.
- State driven by React hooks (local state + `useEffect` loaders).
- Centralized API helper (`apiRequest`) with:
  - bearer auth header
  - auto-refresh on 401
  - retry original request after refresh
- Role-driven UI visibility (`ADMIN`, `ASESOR`, `OPTOMETRA`).

## 9) Ops and Runtime
- Local DB:
  - `docker-compose.yml` (`optica_db`)
- Main scripts:
  - `npm run dev:api`
  - `npm run dev:web`
  - `npm run backup:db`
  - `npm run backup:list`
  - `npm run restore:db -- --file <sql> --yes`

## 10) What To Touch For Common Requests
- Auth/session behavior:
  - `apps/api/src/auth/*`
  - `apps/web/src/App.tsx` (api helper + auth flows)
- Roles/permissions:
  - `apps/api/src/auth/guards/*`
  - `apps/api/src/auth/decorators/roles.decorator.ts`
- Sales/inventory rules:
  - `apps/api/src/sales/sales.service.ts`
- Reporting logic:
  - `apps/api/src/reports/reports.service.ts`
- Audit events:
  - controllers + `apps/api/src/audit-logs/*`

## 11) Current Enterprise Gaps (Next)
- Automated tests:
  - more e2e coverage for auth refresh and core business flows
- CI/CD:
  - build/lint/test gates on PR
- Observability:
  - structured logs, metrics, health dashboards, alerts
- Scalability hardening:
  - distributed rate limit (Redis) for multi-instance deployments
