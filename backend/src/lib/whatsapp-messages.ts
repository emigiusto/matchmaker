// whatsapp-messages.ts
// Locale-aware WhatsApp message templates for ES and EN.
// All message-building logic lives here; call sites only pick a locale and pass params.

type Locale = 'es' | 'en';

export type NoMatchReasonKey = 'no_more_candidates' | 'all_candidates_exhausted' | 'scheduled_time_passed';

interface MessageTemplates {
  invite(hostName: string, sport: string, format: string, date: string, time: string, loc: string, timeLeft: string): string;
  /** Poll-based invite for multi-hour requests. Time options are shown as poll choices, not in the message body. */
  invitePoll(hostName: string, sport: string, format: string, date: string, loc: string, timeLeft: string): string;
  /** Poll-based invite for multi-date requests. Day+time options are shown as poll choices. */
  inviteMultiDatePoll(hostName: string, sport: string, format: string, loc: string, timeLeft: string): string;
  inviteNoLongerAvailable(hostName: string, sport: string, date: string): string;
  inviteReply(): string;
  matchConfirmed(sport: string, format: string, when: string, loc: string, url: string): string;
  noMatch(sport: string, format: string, when: string, loc: string, reason: string, url: string): string;
  noMatchReason: Record<NoMatchReasonKey, string>;
  matchCancelled(sport: string, format: string, when: string, loc: string, participants: string, url: string): string;
  matchRescheduled(when: string, loc: string, url: string): string;
  reminder(opponentName: string, sport: string, format: string, when: string, loc: string, url?: string): string;
  courtBooked(courtName: string, when: string, loc: string, bookingUrl?: string): string;
  courtBookingFailed(when: string, loc: string, reason: string): string;
  courtCancelled(courtName: string, when: string, loc: string): string;
  resultSubmitted(sets: { setNumber: number; scoreA: number; scoreB: number }[], labelA: string, labelB: string, url: string): string;
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
      const sportName = sport === 'padel' ? 'pádel' : 'tenis';
      const formatName = format.toLowerCase() === 'doubles' ? 'Dobles' : 'Individual';
      const sportLabel = `${sport === 'padel' ? 'Pádel' : 'Tenis'} ${formatName}`;
      const locationLine = loc
        ? `📍  ${loc}`
        : `📍  Una vez confirmemos el horario, ${hostName} reservará la pista.`;
      return [
        `${sportEmoji} *¡Hola! ${hostName} quiere jugar al ${sportName} contigo.*`,
        '',
        `📅  ${date}  ·  ${time}`,
        locationLine,
        `${sportEmoji}  ${sportLabel}`,
        '',
        `⏳ Tienes *${timeLeft}* para responder`,
      ].join('\n');
    },

    invitePoll(hostName, sport, format, date, loc, timeLeft) {
      const sportEmoji = sport === 'padel' ? '🏓' : '🎾';
      const sportName = sport === 'padel' ? 'pádel' : 'tenis';
      const formatName = format.toLowerCase() === 'doubles' ? 'Dobles' : 'Individual';
      const sportLabel = `${sport === 'padel' ? 'Pádel' : 'Tenis'} ${formatName}`;
      const locationLine = loc
        ? `📍  ${loc}`
        : `📍  Una vez confirmemos el horario, ${hostName} reservará la pista.`;
      return [
        `${sportEmoji} *¡Hola! ${hostName} quiere jugar al ${sportName} contigo.*`,
        '',
        `📅  ${date}`,
        locationLine,
        `${sportEmoji}  ${sportLabel}`,
        '',
        '¿A qué hora te va bien? (selecciona una o varias)',
        '',
        `⏳ Tienes *${timeLeft}* para responder`,
      ].join('\n');
    },

    inviteMultiDatePoll(hostName, sport, format, loc, timeLeft) {
      const sportEmoji = sport === 'padel' ? '🏓' : '🎾';
      const sportName = sport === 'padel' ? 'pádel' : 'tenis';
      const formatName = format.toLowerCase() === 'doubles' ? 'Dobles' : 'Individual';
      const sportLabel = `${sport === 'padel' ? 'Pádel' : 'Tenis'} ${formatName}`;
      const locationLine = loc
        ? `📍  ${loc}`
        : `📍  Una vez confirmemos el horario, ${hostName} reservará la pista.`;
      return [
        `${sportEmoji} *¡Hola! ${hostName} quiere jugar al ${sportName} contigo.*`,
        '',
        locationLine,
        `${sportEmoji}  ${sportLabel}`,
        '',
        '¿Cuál de estos días y horarios te va mejor? (selecciona uno o varios)',
        '',
        `⏳ Tienes *${timeLeft}* para responder`,
      ].join('\n');
    },

    inviteNoLongerAvailable(hostName, sport, date) {
      const sportEmoji = sport === 'padel' ? '🏓' : '🎾';
      const sportName = sport === 'padel' ? 'pádel' : 'tenis';
      return `${sportEmoji} La invitación de *${hostName}* para jugar ${sportName} el *${date}* ya no está disponible.`;
    },

    inviteReply() {
      return 'Responde *SÍ* ✅ para aceptar o *NO* ❌ para declinar';
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

    noMatch(sport, format, when, loc, reason, url) {
      return [
        '❌ *Tu solicitud de partido no tuvo match*',
        '',
        `${sport} · ${format}`,
        `*Cuándo:* ${when}`,
        `*Dónde:* ${loc || 'TBD'}`,
        '',
        reason,
        '',
        `🔗 *Ver solicitud:* ${url}`,
        '',
        'Puedes añadir más contactos o crear una nueva solicitud desde Matchmaker.',
      ].join('\n');
    },

    noMatchReason: {
      no_more_candidates: 'No quedaban más candidatos disponibles para contactar.',
      all_candidates_exhausted: 'Todos los candidatos rechazaron o no respondieron a tiempo.',
      scheduled_time_passed: 'Se pasó la hora programada sin confirmar el partido.',
    },

    matchCancelled(sport, format, when, loc, participants, url) {
      return [
        '⚠️ *Partido cancelado*',
        '',
        `📅 ${when}`,
        `📍 ${loc || 'TBD'}`,
        `👥 ${participants}`,
        '',
        'Este partido ha sido cancelado. Gracias por tu comprensión.',
        '',
        `🔗 *Ver partido:* ${url}`,
      ].join('\n');
    },

    matchRescheduled(when, loc, url) {
      return [
        '📅 *Horario actualizado*',
        '',
        `*Nuevo horario:* ${when}`,
        `📍 ${loc || 'TBD'}`,
        '',
        `🔗 *Ver partido:* ${url}`,
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

    courtBooked(courtName, when, loc, bookingUrl) {
      const lines = [
        '✅ *¡Pista reservada!*',
        '',
        `🏟️ ${courtName}`,
        `📅 ${when}`,
        `📍 ${loc || 'TBD'}`,
      ];
      if (bookingUrl) lines.push('', `🔗 ${bookingUrl}`);
      return lines.join('\n');
    },

    courtBookingFailed(when, loc, reason) {
      return [
        '⚠️ *No se pudo reservar la pista automáticamente.*',
        '',
        `📅 ${when}`,
        `📍 ${loc || 'TBD'}`,
        '',
        `Motivo: ${reason}`,
      ].join('\n');
    },

    courtCancelled(courtName, when, loc) {
      return [
        '❌ *Reserva de pista cancelada*',
        '',
        `🏟️ ${courtName}`,
        `📅 ${when}`,
        `📍 ${loc || 'TBD'}`,
      ].join('\n');
    },

    resultSubmitted(sets, labelA, labelB, url) {
      const setsStr = sets.map((s) => `Set ${s.setNumber}: *${labelA}* ${s.scoreA} - ${s.scoreB} *${labelB}*`).join('\n');
      return [
        '📊 *Resultado cargado*',
        '',
        setsStr,
        '',
        'El resultado está pendiente de confirmación.',
        '',
        `🔗 *Ver partido:* ${url}`,
      ].join('\n');
    },
  },

  en: {
    invite(hostName, sport, format, date, time, loc, timeLeft) {
      const sportEmoji = sport === 'padel' ? '🏓' : '🎾';
      const sportName = sport.charAt(0).toUpperCase() + sport.slice(1);
      const formatName = format.charAt(0).toUpperCase() + format.slice(1);
      const sportLabel = `${sportName} ${formatName}`;
      const locationLine = loc
        ? `📍  ${loc}`
        : `📍  Once we confirm the time, ${hostName} will find a court.`;
      return [
        `${sportEmoji} *Hi! ${hostName} would like to play ${sport} with you.*`,
        '',
        `📅  ${date}  ·  ${time}`,
        locationLine,
        `${sportEmoji}  ${sportLabel}`,
        '',
        `⏳ You have *${timeLeft}* to respond`,
      ].join('\n');
    },

    invitePoll(hostName, sport, format, date, loc, timeLeft) {
      const sportEmoji = sport === 'padel' ? '🏓' : '🎾';
      const sportName = sport.charAt(0).toUpperCase() + sport.slice(1);
      const formatName = format.charAt(0).toUpperCase() + format.slice(1);
      const sportLabel = `${sportName} ${formatName}`;
      const locationLine = loc
        ? `📍  ${loc}`
        : `📍  Once we confirm the time, ${hostName} will find a court.`;
      return [
        `${sportEmoji} *Hi! ${hostName} would like to play ${sport} with you.*`,
        '',
        `📅  ${date}`,
        locationLine,
        `${sportEmoji}  ${sportLabel}`,
        '',
        'Which hour(s) work for you?',
        '',
        `⏳ You have *${timeLeft}* to respond`,
      ].join('\n');
    },

    inviteMultiDatePoll(hostName, sport, format, loc, timeLeft) {
      const sportEmoji = sport === 'padel' ? '🏓' : '🎾';
      const sportName = sport.charAt(0).toUpperCase() + sport.slice(1);
      const formatName = format.charAt(0).toUpperCase() + format.slice(1);
      const sportLabel = `${sportName} ${formatName}`;
      const locationLine = loc
        ? `📍  ${loc}`
        : `📍  Once we confirm the time, ${hostName} will find a court.`;
      return [
        `${sportEmoji} *Hi! ${hostName} would like to play ${sport} with you.*`,
        '',
        locationLine,
        `${sportEmoji}  ${sportLabel}`,
        '',
        'Which of these days and times works for you? (pick one or more)',
        '',
        `⏳ You have *${timeLeft}* to respond`,
      ].join('\n');
    },

    inviteNoLongerAvailable(hostName, sport, date) {
      const sportEmoji = sport === 'padel' ? '🏓' : '🎾';
      return `${sportEmoji} *${hostName}*'s invitation to play ${sport} on *${date}* is no longer available.`;
    },

    inviteReply() {
      return 'Reply *YES* ✅ to accept or *NO* ❌ to decline';
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

    noMatch(sport, format, when, loc, reason, url) {
      return [
        '❌ *No match found for your request*',
        '',
        `${sport} · ${format}`,
        `*When:* ${when}`,
        `*Where:* ${loc || 'TBD'}`,
        '',
        reason,
        '',
        `🔗 *View request:* ${url}`,
        '',
        'You can add more contacts or create a new request in Matchmaker.',
      ].join('\n');
    },

    noMatchReason: {
      no_more_candidates: 'No more candidates were available to contact.',
      all_candidates_exhausted: 'All candidates declined or did not respond in time.',
      scheduled_time_passed: 'The scheduled time passed without confirming the match.',
    },

    matchCancelled(sport, format, when, loc, participants, url) {
      return [
        '⚠️ *Match cancelled*',
        '',
        `📅 ${when}`,
        `📍 ${loc || 'TBD'}`,
        `👥 ${participants}`,
        '',
        'This match has been cancelled. Thanks for your understanding.',
        '',
        `🔗 *View match:* ${url}`,
      ].join('\n');
    },

    matchRescheduled(when, loc, url) {
      return [
        '📅 *Schedule updated*',
        '',
        `*New time:* ${when}`,
        `📍 ${loc || 'TBD'}`,
        '',
        `🔗 *View match:* ${url}`,
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

    courtBooked(courtName, when, loc, bookingUrl) {
      const lines = [
        '✅ *Court booked!*',
        '',
        `🏟️ ${courtName}`,
        `📅 ${when}`,
        `📍 ${loc || 'TBD'}`,
      ];
      if (bookingUrl) lines.push('', `🔗 ${bookingUrl}`);
      return lines.join('\n');
    },

    courtBookingFailed(when, loc, reason) {
      return [
        '⚠️ *Court could not be booked automatically.*',
        '',
        `📅 ${when}`,
        `📍 ${loc || 'TBD'}`,
        '',
        `Reason: ${reason}`,
      ].join('\n');
    },

    courtCancelled(courtName, when, loc) {
      return [
        '❌ *Court booking cancelled*',
        '',
        `🏟️ ${courtName}`,
        `📅 ${when}`,
        `📍 ${loc || 'TBD'}`,
      ].join('\n');
    },

    resultSubmitted(sets, labelA, labelB, url) {
      const setsStr = sets.map((s) => `Set ${s.setNumber}: *${labelA}* ${s.scoreA} - ${s.scoreB} *${labelB}*`).join('\n');
      return [
        '📊 *Result submitted*',
        '',
        setsStr,
        '',
        'The result is pending confirmation.',
        '',
        `🔗 *View match:* ${url}`,
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

