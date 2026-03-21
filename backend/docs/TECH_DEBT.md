# Tech Debt

*Última actualización: 2026-03-16*

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


## Rate limiting en endpoints públicos

**Prioridad:** Media
**Módulo:** `scheduling`, `auth`

Los endpoints `POST /scheduling/join/:token/accept` y los de auth no tienen rate limiting. Un actor malicioso puede intentar adivinar tokens o saturar la creación de usuarios guest.

**Propuesta:** Añadir `express-rate-limit` con ventanas cortas (p. ej. 10 req/min por IP) en:
- `POST /scheduling/join/:token/accept`
- `POST /auth/login`
- `POST /auth/signup`
- `POST /whatsapp/webhook`
