# Tech Debt

*Última actualización: 2026-03-16*

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
