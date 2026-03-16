❯ How do you recommending handling multiple languages in whatsapp messages  
to phone numbers? some of them might not be users                           

● Let me look at what data we have about recipients before recommending.    

● Searched for 2 patterns, read 1 file (ctrl+o to expand)

● Here's my recommendation based on how the system is structured:

  ---
  Key observations

  1. Every recipient is already a User — even "guests" get a User record    
  with isGuest: true. So there's always a row to attach a language
  preference to.
  2. User has no locale field today — no language info anywhere.
  3. GuestContact is just metadata (name/phone) owned by the host; the      
  actual invite target is the linked User.

  ---
  Recommended approach

  Store locale on User, inherit for guest-created users

  model User {
    ...
    locale  String  @default("es")  // IETF tag: "es", "en", "ca", etc.     
  }

  Populating it:
  - Registered users → capture navigator.language on signup and let them    
  change it in Profile
  - Guest users (created when a host adds a phone contact) → inherit the    
  host's locale at creation time. The host's contacts are overwhelmingly in 
  the same language community

  At send time:
  const locale = candidate.contactUser?.locale ?? request.hostUser?.locale  
  ?? 'es';
  const message = formatInviteMessage(locale, ...);

  Internationalizing the templates

  Keep it simple — no i18n library needed at this scale. A plain object per 
  message type:

  const MESSAGES = {
    es: {
      wants_to_play: (name: string) => `*${name} quiere jugar contigo!*`,   
      you_have: (t: string) => `Tienes *${t}* para responder`,
      ...
    },
    en: {
      wants_to_play: (name: string) => `*${name} wants to play with you!*`, 
      you_have: (t: string) => `You have *${t}* to respond`,
      ...
    },
  } satisfies Record<string, MessageTemplates>;

  function t(locale: string) {
    return MESSAGES[locale] ?? MESSAGES['es'];
  }

  ---
  What I'd avoid

  ┌────────────────────────┬────────────────────────────────────────────┐   
  │         Option         │                  Why not                   │   
  ├────────────────────────┼────────────────────────────────────────────┤   
  │ Phone country code →   │ Unreliable: +34 doesn't mean Spanish       │   
  │ language               │ (expats, tourists), and many countries are │   
  │                        │  multilingual                              │   
  ├────────────────────────┼────────────────────────────────────────────┤   
  │ Per-GuestContact       │ Extra friction with no gain — GuestContact │   
  │ locale field           │  is just a phone book entry                │   
  ├────────────────────────┼────────────────────────────────────────────┤   
  │ Full i18n library      │ Overkill for WhatsApp text; adds build     │   
  │ (i18next, etc.)        │ complexity for no benefit                  │   
  ├────────────────────────┼────────────────────────────────────────────┤   
  │ Always use host's      │ Works 90% of the time but breaks for       │   
  │ locale                 │ mixed-language groups (international       │   
  │                        │ clubs)                                     │   
  └────────────────────────┴────────────────────────────────────────────┘   

  ---
  Rollout order

  1. Add locale to User with default "es" (no breaking change, existing     
  users get Spanish)
  2. Pass navigator.language on signup → derive locale ("es-ES" → "es")     
  3. Internationalize one message at a time (start with the invite, most    
  visible)
  4. Add locale picker in Profile for registered users

  This keeps it simple while correctly handling the non-user case (guest    
  users inherit host locale), which is the most common real-world scenario. 




  ● Here's what needs to happen, in order:
                     
  ---
  1. Add locale to User (schema + migration)                                  
  model User {                                                                  ...
    locale  String  @default("es")                                          
  }

  Migration: ALTER TABLE User ADD COLUMN locale VARCHAR(10) NOT NULL DEFAULT
   'es';

  For existing registered users you can backfill later; guests will inherit 
  the host's locale at creation time (see step 3).

  ---
  2. Create a message translations module

  The messages are template functions, not strings, so a simple typed object
   beats a full i18n library. Put it at src/lib/whatsapp-messages.ts:       

  type Locale = 'es' | 'en';

  export function resolveLocale(locale?: string | null): Locale {
    return locale === 'en' ? 'en' : 'es';
  }

  const templates = {
    es: {
      invite: (hostName: string, sport: string, fmt: string, date: string,  
  time: string, loc: string, timeLeft: string) =>
        `🎾 *${hostName} quiere jugar contigo!*\n\n📅  ${date}  ·
  ${time}\n📍  ${loc}\n🏅  ${sport} ${fmt}\n\n⏳ Tienes *${timeLeft}* para  
  responder`,
      inviteReply: () => `Responde *SÍ* ✅ para aceptar o *NO* ❌ para      
  declinar`,
      noLongerAvailable: (hostName: string, sport: string, fmt: string,     
  date: string, time: string, loc: string) =>
        `ℹ️ *Invitación no disponible*\n\nLa invitación de ${sport} ${fmt}  
  de ${hostName} ya no está disponible.\n*Cuándo:* ${date} ·
  ${time}\n*Dónde:* ${loc}\n\nPuedes ignorar el mensaje anterior.`,
      matchConfirmed: (sport: string, fmt: string, when: string, loc:       
  string, url: string) =>
        `✅ *¡Partido confirmado!*\n\n${sport} · ${fmt}\n*Cuándo:*
  ${when}\n*Dónde:* ${loc}\n\n🔗 *Ver partido:* ${url}`,
      noMatch: (sport: string, fmt: string, when: string, loc: string,      
  reason: string) =>
        `❌ *Tu solicitud de partido no tuvo match*\n\n${sport} ·
  ${fmt}\n*Cuándo:* ${when}\n*Dónde:* ${loc}\n\n${reason}\n\nPuedes añadir  
  más contactos o crear una nueva solicitud.`,
      noMatchReason: {
        no_more_candidates: 'No quedaban más candidatos disponibles.',      
        all_candidates_exhausted: 'Todos los candidatos rechazaron o no     
  respondieron.',
        scheduled_time_passed: 'Se pasó la hora programada sin confirmar el 
  partido.',
      },
    },
    en: {
      // same shape, English strings
      ...
    },
  } satisfies Record<Locale, MessageTemplates>;

  export function getMessages(locale?: string | null) {
    return templates[resolveLocale(locale)];
  }

  ---
  3. Thread locale through call sites

  The current format functions don't take a locale. Each needs to accept one
   and call getMessages(locale) instead of having hardcoded strings.        

  At each call site, resolve it from the recipient:

  ┌──────────────────────────┬──────────────────────────────────────────┐   
  │         Message          │             Recipient locale             │   
  ├──────────────────────────┼──────────────────────────────────────────┤   
  │ Invite sent              │ candidate.contactUser.locale             │   
  ├──────────────────────────┼──────────────────────────────────────────┤   
  │ Invite no longer         │ candidate.contactUser.locale             │   
  │ available / cancelled    │                                          │   
  ├──────────────────────────┼──────────────────────────────────────────┤   
  │ No-match notification    │ request.hostUser.locale                  │   
  │ (host)                   │                                          │   
  ├──────────────────────────┼──────────────────────────────────────────┤   
  │ Match confirmed (group)  │ Each participant's locale — or just pick │   
  │                          │  one (see below)                         │   
  └──────────────────────────┴──────────────────────────────────────────┘   

  For the WhatsApp group message it's one message to everyone. Options:     
  - Use the host's locale (simplest, good enough)
  - Send individual DMs instead of a group message (overkill)

  Lean toward host's locale for group messages.

  ---
  4. Propagate locale in Prisma includes

  Wherever you already include: { contactUser: true } or include: {
  hostUser: true }, the locale field will come along automatically once it's
   on the model — no query changes needed.

  ---
  5. Guest user creation — inherit host locale

  When a guest User is created from a host's phone contact, copy the host's 
  locale:

  // wherever ensureUserByPhone creates the User
  await prisma.user.create({
    data: { phone, name, isGuest: true, locale: hostLocale ?? 'es' }        
  })

  ---
  Summary of files to touch

  ┌────────────────────────────────────────────┬────────────────────────┐   
  │                    File                    │         Change         │   
  ├────────────────────────────────────────────┼────────────────────────┤   
  │ prisma/schema.prisma                       │ Add locale String      │   
  │                                            │ @default("es") to User │   
  ├────────────────────────────────────────────┼────────────────────────┤   
  │ prisma/migrations/...                      │ ALTER TABLE User ADD   │   
  │                                            │ COLUMN locale          │   
  ├────────────────────────────────────────────┼────────────────────────┤   
  │ src/lib/whatsapp-messages.ts               │ New file — all message │
  │                                            │  templates in es/en    │   
  ├────────────────────────────────────────────┼────────────────────────┤   
  │ src/modules/scheduling/scheduling.service. │ Replace hardcoded      │   
  │ ts                                         │ strings with getMessag │   
  │                                            │ es(locale).xxx(...)    │   
  ├────────────────────────────────────────────┼────────────────────────┤   
  │ src/modules/guest-contacts/guest-contacts. │ Pass hostLocale when   │   
  │ service.ts                                 │ creating guest User    │   
  └────────────────────────────────────────────┴────────────────────────┘   

  The formatResponseWindow helper ("2 hours", "1 day") also needs localizing
   ("2 horas", "1 día"), so include it in whatsapp-messages.ts.



    Beyond what was already covered, here are the additional areas:

  ---
  Matches service — cancellation notification

  matches.service.ts ~line 421 — WhatsApp group message sent to all
  participants when a match is cancelled. Recipients are mixed (all
  players), so host's locale is the pragmatic choice for group messages.    

  ---
  Reminder job

  jobs/reminder.job.ts ~line 30 — "Your match vs X is coming up" WhatsApp   
  reminder. Recipient is a specific user, so their locale field applies     
  directly here.

  ---
  Booking service — court booked confirmation

  booking.service.ts ~line 320 — "Court booked!" WhatsApp message sent to   
  the match group. Same situation as match confirmed: one message to all,   
  use host's locale.

  ---
  formatResponseWindow helper

  Currently returns "2 hours", "1 day" etc. Used inside the invite message. 
  Needs a locale-aware version ("2 horas", "1 día"). Include it in
  whatsapp-messages.ts.

  ---
  Quick-reply button labels

  const INVITE_BUTTONS = [
    { id: 'invite_yes', title: 'YES' },
    { id: 'invite_no', title: 'NO' },
  ]
  These are shown as tappable buttons on the WhatsApp message. Should be    
  'SÍ' / 'NO' for Spanish recipients. They need to be locale-aware too, and 
  the ACCEPT_PATTERNS regex on the response handling side
  (/^(yes|y|accept|👍)$|👍/i) should also accept sí, si, s.

  ---
  AppError messages

  These are returned as HTTP responses and shown in the frontend. They're   
  all in English. However, translating these is lower priority and a        
  different problem — the frontend typically owns the display layer and can 
  map error codes to translated strings. Better to add structured errorCode 
  fields to errors rather than translating the message strings in the       
  backend.

  ---
  Notification payloads (stored in DB)

  scheduling.no_match, match.created, match.cancelled — currently stored as 
  raw JSON payloads with no text. The frontend renders them. No backend     
  translation needed here since the frontend controls rendering.

  ---
  Summary of what actually needs translating in the backend

  ┌─────────────────────────────┬───────────────────────┬───────────────┐   
  │            Item             │         File          │   Priority    │   
  ├─────────────────────────────┼───────────────────────┼───────────────┤   
  │ Invite message              │ scheduling.service.ts │ High          │   
  ├─────────────────────────────┼───────────────────────┼───────────────┤   
  │ "No longer available"       │ scheduling.service.ts │ High          │   
  │ message                     │                       │               │   
  ├─────────────────────────────┼───────────────────────┼───────────────┤   
  │ "No match" notification     │ scheduling.service.ts │ High          │   
  ├─────────────────────────────┼───────────────────────┼───────────────┤   
  │ "Match confirmed" group     │ scheduling.service.ts │ High          │   
  │ message                     │                       │               │   
  ├─────────────────────────────┼───────────────────────┼───────────────┤   
  │ Match cancelled message     │ matches.service.ts    │ High          │   
  ├─────────────────────────────┼───────────────────────┼───────────────┤   
  │ Match reminder              │ jobs/reminder.job.ts  │ Medium        │   
  ├─────────────────────────────┼───────────────────────┼───────────────┤   
  │ "Court booked" message      │ booking.service.ts    │ Medium        │   
  ├─────────────────────────────┼───────────────────────┼───────────────┤   
  │ formatResponseWindow        │ scheduling.service.ts │ High (used in │   
  │                             │                       │  invite)      │   
  ├─────────────────────────────┼───────────────────────┼───────────────┤   
  │ Quick-reply button labels + │ scheduling.service.ts │ Medium        │   
  │  ACCEPT_PATTERNS            │                       │               │   
  ├─────────────────────────────┼───────────────────────┼───────────────┤   
  │ AppError messages           │ various               │ Low — handle  │   
  │                             │                       │ at frontend   │   
  └─────────────────────────────┴───────────────────────┴───────────────┘  