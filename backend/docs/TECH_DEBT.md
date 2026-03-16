# Tech Debt

*Última actualización: 2026-03-16*

---

## SocioNumber no se persiste en el join-via-link

**Prioridad:** Alta
**Módulo:** `scheduling`

Cuando un usuario acepta una invite via web (`POST /scheduling/join/:token/accept`) y el request tiene `bookingEnabled=true`, el campo `socioNumber` del formulario se recibe pero solo se loguea (`logger.info('SocioNumberReceived', ...)`). No se crea ni actualiza ningún registro de `ClubMembership`.

**Propuesta:**

1. En `schedulingService.acceptViaLink`, tras crear/encontrar el usuario, hacer upsert de `ClubMembership`:
   ```ts
   await prisma.clubMembership.upsert({
     where: { userId_clubSlug: { userId, clubSlug: request.clubSlug } },
     create: { userId, clubSlug: request.clubSlug, adapterType: '...', socioNumber, status: 'unverified' },
     update: { socioNumber },
   });
   ```
2. Agregar `clubSlug` al modelo `SchedulingRequest` (o derivarlo del `locationText`/venue).
3. Con `ClubMembership` creada, el booking automático puede ejecutarse post-join igual que para el host.

---

## `(user as any).locale` en reminder.job y scheduling.service

**Prioridad:** Media
**Módulo:** `jobs`, `scheduling`

Varios lugares del código acceden a `User.locale` con casts `as any` o con un tipo inline ad-hoc porque el campo `locale` se agregó después de que algunos `include`/`select` ya estaban escritos sin él.

Archivos afectados:
- `backend/src/modules/jobs/reminder.job.ts` — `(reminder.user as any)?.locale`
- `backend/src/modules/scheduling/scheduling.service.ts` — múltiples `(candidate.contactUser as { locale?: string | null })?.locale`

**Propuesta:**

1. Crear un tipo `UserWithLocale = { id: string; name: string | null; phone: string | null; locale: string }` en `users.types.ts`.
2. Actualizar todos los `select` de usuario relevantes para incluir `locale: true`.
3. Eliminar los casts.

---

## Competitive / Practice – Reintroducir en la UI

**Prioridad:** Media
**Módulo:** `frontend`

La distinción Competitive/Practice existe en el schema (`MatchType`, `SchedulingMatchType`) pero está oculta en la UI. Todos los partidos se crean como `competitive` por defecto; no hay selector ni badge visible.

**Propuesta:**

1. **I Want to Play wizard** — Restaurar el paso que permite elegir Competitive vs Practice.
2. **MatchTypeBadge** — Volver a usar en Dashboard, Matches, MatchDetails, MatchesPast, InviteRequestsSection.
3. **AddToCalendarButton** — Restaurar títulos diferenciados ("Competitive match" vs "Practice session").
4. **Filtro** — Restaurar filtro por tipo de partido en `/matches`.
5. **i18n** — Las claves `matchType`, `competitive`, `practice` ya existen en los locales ES/EN.

---

## WhatsApp Webhook – Verificación de firma

**Prioridad:** Media
**Módulo:** `whatsapp`

El webhook (`POST /whatsapp/webhook`) acepta cualquier request sin validar que provenga realmente de Wasender/Whapi. Cualquiera que conozca la URL podría enviar POSTs falsos y simular respuestas YES/NO de candidatos.

**Propuesta:**

1. Guardar el secret del provider en env:
   ```
   WASENDER_WEBHOOK_SECRET=...
   WHAPI_WEBHOOK_SECRET=...
   ```
2. Implementar verificación de firma en `WhatsappController.webhook`:
   - Consultar la docs de cada provider para el header y algoritmo (HMAC-SHA256 habitual).
   - Validar antes de procesar el body; devolver 401 si es inválido.
3. Mantener el comportamiento actual cuando no se configure secret (desarrollo / mock provider).

---

## Rate limiting en endpoints públicos

**Prioridad:** Media
**Módulo:** `scheduling`, `auth`

Los endpoints `POST /scheduling/join/:token/accept` y los de auth no tienen rate limiting. Un actor malicioso puede intentar adivinar tokens o saturar la creación de usuarios guest.

**Propuesta:** Añadir `express-rate-limit` con ventanas cortas (p. ej. 10 req/min por IP) en:
- `POST /scheduling/join/:token/accept`
- `POST /auth/login`
- `POST /auth/signup`
- `POST /whatsapp/webhook`
