# Tech Debt

Items técnicos pendientes o mejoras identificadas.

---

## Competitive / Practice – Reintroducir en la UI

**Prioridad:** Media  
**Módulo:** `frontend`

En la v1, la distinción Competitive/Practice está oculta: todos los partidos e invites se crean como **practice** por defecto. No se muestra el selector ni los badges en la UI.

**Propuesta para reintroducir:**

1. **I Want to Play wizard** – Restaurar el paso 2 (o el bloque dentro de él) que permite elegir Competitive vs Practice.
2. **MatchTypeBadge** – Volver a usar en: Dashboard, Matches, MatchDetails, MatchesPast, InviteRequestsSection.
3. **InviteConfirm** – Mostrar tipo de partido (competitive/practice) en el mensaje y en la tarjeta de detalles.
4. **AddToCalendarButton** – Restaurar títulos diferenciados (“Competitive match” vs “Practice session”).
5. **Suggested** – Restaurar el filtro por tipo de partido.
6. **i18n** – Las claves `matchType`, `competitive`, `practice` ya existen en los locales.

---

## WhatsApp Webhook – Verificación de firma

**Prioridad:** Media  
**Módulo:** `whatsapp`

El webhook (`POST /whatsapp/webhook`) acepta cualquier request sin validar que provenga realmente de Wasender/Whapi. Cualquiera que conozca la URL podría enviar POSTs falsos e intentar provocar respuestas no deseadas (p. ej. simular SÍ/NO de candidatos).

**Propuesta:**

1. Configurar el Webhook Secret en Wasender (si aplica) y guardarlo en env, p. ej.:
   ```
   WASENDER_WEBHOOK_SECRET=...
   WHAPI_WEBHOOK_SECRET=...   # si Whapi lo soporta
   ```

2. Implementar verificación de firma en `WhatsappController.webhook`:
   - Revisar en la documentación de cada provider cómo firman los webhooks (header, algoritmo HMAC, etc.).
   - Validar la firma antes de procesar el body.
   - Devolver 401 si la firma es inválida.

3. Mantener el comportamiento actual cuando no se configure secret (para desarrollo o compatibilidad con el mock provider).

---

*Última actualización: 2026-03*
