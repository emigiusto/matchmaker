// whatsapp-messages.ts
// Locale-aware WhatsApp message templates for ES and EN.
// All message-building logic lives here; call sites only pick a locale and pass params.

type Locale = 'es' | 'en';

export type NoMatchReasonKey = 'no_more_candidates' | 'all_candidates_exhausted' | 'scheduled_time_passed';

interface MessageTemplates {
  invite(hostName: string, sport: string, format: string, date: string, time: string, loc: string, timeLeft: string): string;
  inviteReply(): string;
  noLongerAvailable(hostName: string, sport: string, format: string, date: string, time: string, loc: string): string;
  matchConfirmed(sport: string, format: string, when: string, loc: string, url: string): string;
  noMatch(sport: string, format: string, when: string, loc: string, reason: string): string;
  noMatchReason: Record<NoMatchReasonKey, string>;
  matchCancelled(sport: string, format: string, when: string, loc: string): string;
  reminder(opponentName: string, sport: string, format: string, when: string, loc: string, url?: string): string;
  courtBooked(courtName: string, when: string, loc: string): string;
}

/**
 * Format a response-window duration in a locale-aware way.
 * e.g. 90 → "2 horas" (es) / "2 hours" (en)
 */
export function formatResponseWindow(minutes: number, locale: string): string {
  const loc = resolveLocale(locale);
  if (minutes < 60) {
    const m = Math.round(minutes);
    if (loc === 'es') return `${m} ${m === 1 ? 'minuto' : 'minutos'}`;
    return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
  }
  const hours = minutes / 60;
  if (hours < 24) {
    const h = Math.round(hours);
    if (loc === 'es') return `${h} ${h === 1 ? 'hora' : 'horas'}`;
    return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  }
  const days = hours / 24;
  const d = Math.round(days);
  if (loc === 'es') return `${d} ${d === 1 ? 'día' : 'días'}`;
  return `${d} ${d === 1 ? 'day' : 'days'}`;
}

/**
 * Resolve an arbitrary locale string to one of the supported locales.
 * Defaults to 'es' unless the resolved value is explicitly 'en'.
 */
export function resolveLocale(locale?: string | null): Locale {
  return locale === 'en' ? 'en' : 'es';
}

const templates: Record<Locale, MessageTemplates> = {
  es: {
    invite(hostName, sport, format, date, time, loc, timeLeft) {
      const sportEmoji = sport === 'padel' ? '🏓' : '🎾';
      const sportLabel = `${sport.charAt(0).toUpperCase()}${sport.slice(1)} ${format.charAt(0).toUpperCase()}${format.slice(1)}`;
      return [
        `${sportEmoji} *${hostName} quiere jugar contigo!*`,
        '',
        `📅  ${date}  ·  ${time}`,
        `📍  ${loc || 'TBD'}`,
        `🏅  ${sportLabel}`,
        '',
        `⏳ Tienes *${timeLeft}* para responder`,
      ].join('\n');
    },

    inviteReply() {
      return 'Responde *SÍ* ✅ para aceptar o *NO* ❌ para declinar';
    },

    noLongerAvailable(hostName, sport, format, date, time, loc) {
      return [
        'ℹ️ *Invitación no disponible*',
        '',
        `La invitación de ${sport} ${format} de ${hostName} ya no está disponible.`,
        `*Cuándo:* ${date} · ${time}`,
        `*Dónde:* ${loc || 'TBD'}`,
        '',
        'Puedes ignorar el mensaje anterior.',
      ].join('\n');
    },

    matchConfirmed(sport, format, when, loc, url) {
      return [
        '✅ *¡Partido confirmado!*',
        '',
        `${sport} · ${format}`,
        `*Cuándo:* ${when}`,
        `*Dónde:* ${loc || 'TBD'}`,
        '',
        `🔗 *Ver partido:* ${url}`,
      ].join('\n');
    },

    noMatch(sport, format, when, loc, reason) {
      return [
        '❌ *Tu solicitud de partido no tuvo match*',
        '',
        `${sport} · ${format}`,
        `*Cuándo:* ${when}`,
        `*Dónde:* ${loc || 'TBD'}`,
        '',
        reason,
        '',
        'Puedes añadir más contactos o crear una nueva solicitud desde Matchmaker.',
      ].join('\n');
    },

    noMatchReason: {
      no_more_candidates: 'No quedaban más candidatos disponibles para contactar.',
      all_candidates_exhausted: 'Todos los candidatos rechazaron o no respondieron a tiempo.',
      scheduled_time_passed: 'Se pasó la hora programada sin confirmar el partido.',
    },

    matchCancelled(sport, format, when, loc) {
      return [
        '⚠️ *Partido cancelado*',
        '',
        `${when}`,
        `📍 ${loc || 'TBD'}`,
        '',
        'Este partido ha sido cancelado. Gracias por tu comprensión.',
      ].join('\n');
    },

    reminder(opponentName, sport, format, when, loc, url) {
      const lines = [
        '⏰ *Recordatorio Matchmaker*',
        '',
        `Tu partido vs ${opponentName} está cerca.`,
        `📅 ${when}`,
        `📍 ${loc || 'TBD'}`,
        '',
        '¡Mucha suerte y a disfrutar! 🎾',
      ];
      if (url) lines.splice(5, 0, `🔗 ${url}`);
      return lines.join('\n');
    },

    courtBooked(courtName, when, loc) {
      return [
        '✅ *¡Pista reservada!*',
        '',
        `🏟️ ${courtName}`,
        `📅 ${when}`,
        `📍 ${loc || 'TBD'}`,
      ].join('\n');
    },
  },

  en: {
    invite(hostName, sport, format, date, time, loc, timeLeft) {
      const sportEmoji = sport === 'padel' ? '🏓' : '🎾';
      const sportLabel = `${sport.charAt(0).toUpperCase()}${sport.slice(1)} ${format.charAt(0).toUpperCase()}${format.slice(1)}`;
      return [
        `${sportEmoji} *${hostName} wants to play with you!*`,
        '',
        `📅  ${date}  ·  ${time}`,
        `📍  ${loc || 'TBD'}`,
        `🏅  ${sportLabel}`,
        '',
        `⏳ You have *${timeLeft}* to respond`,
      ].join('\n');
    },

    inviteReply() {
      return 'Reply *YES* ✅ to accept or *NO* ❌ to decline';
    },

    noLongerAvailable(hostName, sport, format, date, time, loc) {
      return [
        'ℹ️ *Invite no longer available*',
        '',
        `The ${sport} ${format} invite from ${hostName} is no longer available.`,
        `*When:* ${date} · ${time}`,
        `*Where:* ${loc || 'TBD'}`,
        '',
        'You can ignore the previous invite message.',
      ].join('\n');
    },

    matchConfirmed(sport, format, when, loc, url) {
      return [
        '✅ *Match confirmed!*',
        '',
        `${sport} · ${format}`,
        `*When:* ${when}`,
        `*Where:* ${loc || 'TBD'}`,
        '',
        `🔗 *View match:* ${url}`,
      ].join('\n');
    },

    noMatch(sport, format, when, loc, reason) {
      return [
        '❌ *No match found for your request*',
        '',
        `${sport} · ${format}`,
        `*When:* ${when}`,
        `*Where:* ${loc || 'TBD'}`,
        '',
        reason,
        '',
        'You can add more contacts or create a new request in Matchmaker.',
      ].join('\n');
    },

    noMatchReason: {
      no_more_candidates: 'No more candidates were available to contact.',
      all_candidates_exhausted: 'All candidates declined or did not respond in time.',
      scheduled_time_passed: 'The scheduled time passed without confirming the match.',
    },

    matchCancelled(sport, format, when, loc) {
      return [
        '⚠️ *Match cancelled*',
        '',
        `${when}`,
        `📍 ${loc || 'TBD'}`,
        '',
        'This match has been cancelled. Thanks for your understanding.',
      ].join('\n');
    },

    reminder(opponentName, sport, format, when, loc, url) {
      const lines = [
        '⏰ *Matchmaker reminder*',
        '',
        `Your match vs ${opponentName} is coming up.`,
        `📅 ${when}`,
        `📍 ${loc || 'TBD'}`,
        '',
        'Good luck and have fun! 🎾',
      ];
      if (url) lines.splice(5, 0, `🔗 ${url}`);
      return lines.join('\n');
    },

    courtBooked(courtName, when, loc) {
      return [
        '✅ *Court booked!*',
        '',
        `🏟️ ${courtName}`,
        `📅 ${when}`,
        `📍 ${loc || 'TBD'}`,
      ].join('\n');
    },
  },
};

/**
 * Returns the message template set for the given locale.
 * Accepts any locale string (e.g. "es", "en", "es-ES") and normalises it.
 */
export function getMessages(locale?: string | null): MessageTemplates {
  return templates[resolveLocale(locale)];
}
