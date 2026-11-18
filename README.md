# slot-booking

Fullstack service for booking shared resources (meeting rooms, coworking desks) in time slots.

> **Status: work in progress.** This is a learning project built with production-grade standards:
> I'm a frontend engineer extending my skills to the React ecosystem and backend development
> (REST API, business logic, PostgreSQL), plus Docker and CI/CD.

## Highlights (planned)

- Booking rules enforced in the database: no overlapping bookings per resource via a PostgreSQL
  exclusion constraint; concurrent requests resolve to `409 Conflict`
- Timezone-aware availability (resource working hours in its own IANA timezone)
- JWT auth with refresh token rotation in httpOnly cookies
- Typed contract: OpenAPI spec from the backend → generated TypeScript types on the frontend
- Server state with TanStack Query, including optimistic updates with rollback
- Errors in RFC 9457 Problem Details format, handled centrally on both sides

## Tech stack

| Area | Tools |
|---|---|
| Monorepo | pnpm workspaces, TypeScript (strict) |
| Frontend (`apps/web`) | React, Vite, React Router, TanStack Query, Zustand, React Hook Form, Zod, Tailwind CSS |
| Backend (`apps/api`) | NestJS, PostgreSQL, Prisma, Swagger/OpenAPI |
| Testing | Vitest, React Testing Library, MSW, Playwright |
| Infra | Docker Compose, GitHub Actions |

## Repository structure

```
apps/web     React SPA
apps/api     NestJS REST API
docs/adr     architecture decision records
```

## Getting started

_Coming in milestone M1._

## Roadmap

- [x] M0 — monorepo skeleton
- [ ] M1 — app scaffolding, linting, Docker Compose, CI
- [ ] M2 — authentication
- [ ] M3 — resources management
- [ ] M4 — availability and booking with concurrency guarantees
- [ ] M5 — my bookings, cancellation
- [ ] M6 — e2e tests, Docker images, deployment
