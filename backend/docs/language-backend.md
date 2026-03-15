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