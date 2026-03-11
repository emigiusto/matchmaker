# Tech Debt

Items técnicos pendientes o mejoras identificadas.

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
