# Capacitor Migration – Mobile App with Native Contacts

This document describes how to migrate the MatchMaker frontend to run as a native mobile app using Capacitor, enabling device contact access for the I Want to Play and Add Contacts flows.

---

## Overview

| Aspect | Details |
|--------|---------|
| **Goal** | Run the existing Vite/React frontend on iOS and Android, with native contact picking |
| **Approach** | Wrap the web app in Capacitor; add `@capacitor-community/contacts` for device contacts |
| **Code reuse** | Full reuse of frontend logic, API client, and UI |
| **Trade-off** | WebView-based (not native UI); acceptable for quick MVP and contact access |

---

## Technology Discussion: What is Capacitor?

**Capacitor** is an open-source runtime and plugin system created by Ionic. It wraps your existing web app (HTML, CSS, JavaScript) in a native container and provides a bridge to access native device APIs that are unavailable or limited in the browser.

### How It Works

1. **Native container** – A thin native shell (iOS UIWebView/WKWebView, Android WebView) loads your built web assets from `dist/` or a remote URL.
2. **JavaScript bridge** – The Capacitor core exposes a JavaScript API that communicates with native code via message passing. Plugins extend this bridge.
3. **Plugin architecture** – Third-party plugins (e.g. `@capacitor-community/contacts`) implement native iOS (Swift) and Android (Kotlin/Java) code and expose a unified JS API.
4. **Build pipeline** – `npx cap sync` copies your web build into the native projects; you build and sign using Xcode and Android Studio as with any native app.

### Key Characteristics

- **Framework-agnostic** – Works with React, Vue, Angular, Svelte, or vanilla JS. No lock-in to a specific UI framework.
- **Web-first** – Your app is fundamentally a web app. It runs in a WebView, so rendering, layout, and animations are handled by the browser engine.
- **Progressive enhancement** – You can ship one codebase for web and mobile; use `Capacitor.isNativePlatform()` to conditionally enable native-only features (e.g. contacts).
- **Maturity** – Backed by Ionic; widely used in production. Active ecosystem and LTS versions for multiple Capacitor major releases.

---

## Pros and Cons of Capacitor

### Pros

| Benefit | Description |
|---------|-------------|
| **Maximum code reuse** | The entire Vite/React frontend runs unchanged. No UI rewrite. |
| **Low migration effort** | Add Capacitor, configure, build. Contact picking is a small incremental feature. |
| **Single codebase** | One repo, one set of components, one API layer for web and mobile. |
| **Fast iteration** | Web tooling (Vite, HMR) and familiar debugging. Deploy to both platforms from one build. |
| **Native API access** | Plugins give access to contacts, camera, filesystem, push, etc., despite the WebView. |
| **Proven stack** | React, TypeScript, Tailwind – same skills and patterns as your current web app. |
| **PWA-friendly** | The web app can remain a PWA; Capacitor is an optional packaging layer. |

### Cons

| Drawback | Description |
|----------|-------------|
| **WebView performance** | Scrolling, animations, and complex UIs can feel less fluid than native. Not ideal for highly interactive, 60fps-heavy experiences. |
| **Not truly native UI** | Buttons, inputs, and gestures are web-rendered. Platform conventions (e.g. iOS back swipe, Android FAB) require manual implementation. |
| **Bundle size** | The app includes a WebView and your full JS bundle. Typically larger than a minimal native app. |
| **Platform quirks** | WebView behavior differs between iOS and Android (e.g. input handling, keyboard, safe areas). May need platform-specific CSS/JS. |
| **Native dependency** | Still need Xcode and Android Studio for builds and signing. Cannot build iOS on Windows without a Mac or CI. |
| **Plugin availability** | Some native features rely on community plugins; quality and maintenance vary. |

### When Capacitor Fits Well

- You already have a solid web app and want mobile reach quickly.
- Contact access (and similar device APIs) is the main native need.
- Your UX is form- and list-heavy rather than gesture- and animation-heavy.
- You prioritize speed to market and maintenance simplicity over a fully native feel.

---

## Alternative Approaches

### React Native (Expo)

| Aspect | Notes |
|--------|-------|
| **What it is** | Build mobile UIs with React components that map to native views (not WebView). |
| **Contacts** | `expo-contacts` provides native contact access with permission prompts. |
| **Code reuse** | Shared logic, types, API layer. UI must be rebuilt with RN components (`View`, `Text`, `FlatList`, etc.). |
| **Pros** | Native performance and feel; large ecosystem; Expo simplifies builds and OTA updates. |
| **Cons** | Significant effort to port the UI; separate code paths for web vs mobile unless using something like Tamagui/React Native Web. |
| **Best for** | Long-term mobile-first strategy; apps where native UX and performance matter more than quick reuse. |

### Progressive Web App (PWA)

| Aspect | Notes |
|--------|-------|
| **What it is** | Web app with `manifest.json`, service worker, and “Add to Home Screen.” Runs in the browser. |
| **Contacts** | **Not available.** The Contacts Picker API exists but has limited support and does not provide full contact list access on mobile. |
| **Code reuse** | 100% – it is your web app. |
| **Pros** | No store submission; instant updates; no native tooling. |
| **Cons** | Cannot reliably pull device contacts for invite flows. Limited push/background capabilities on iOS. |
| **Best for** | Web-first strategy when contact access is not required; lightweight “Add to Home Screen” experience. |

### Cordova (Legacy)

| Aspect | Notes |
|--------|-------|
| **What it is** | Older hybrid framework; similar model to Capacitor (WebView + plugins). |
| **Contacts** | `cordova-plugin-contacts` exists but is deprecated and has compatibility issues. |
| **Pros** | Mature; many plugins. |
| **Cons** | Declining maintenance; Capacitor is the modern successor with better tooling and plugin quality. |
| **Best for** | Existing Cordova apps; not recommended for new projects. |

### Native (Swift / Kotlin)

| Aspect | Notes |
|--------|-------|
| **What it is** | Fully native iOS and Android apps. |
| **Contacts** | Full access via `CNContactStore` (iOS) and `ContactsContract` (Android). |
| **Code reuse** | Backend and API only. UI and business logic rewritten per platform. |
| **Pros** | Best performance, UX, and platform integration. |
| **Cons** | Highest cost; two codebases (or shared logic via KMP/Swift packages); longer time to market. |
| **Best for** | Apps where native quality and performance are paramount and budget allows separate implementations. |

### Tauri (Mobile)

| Aspect | Notes |
|--------|-------|
| **What it is** | Rust-backed framework for desktop and (experimental) mobile apps using web views. |
| **Contacts** | Would require custom Rust plugins; no established contacts plugin. |
| **Pros** | Smaller binary; Rust backend. |
| **Cons** | Mobile support is experimental; smaller ecosystem; more setup for native APIs. |
| **Best for** | Early adopters; not recommended for production mobile yet. |

---

## Comparison Summary

| Criterion | Capacitor | React Native (Expo) | PWA | Native |
|-----------|-----------|---------------------|-----|--------|
| Contact access | ✅ Plugin | ✅ expo-contacts | ❌ Limited | ✅ Full |
| Code reuse | High (full web UI) | Medium (logic only) | High | Low |
| Effort to add mobile | Low | High | Low | Very high |
| Performance | WebView | Native | WebView | Native |
| Maintenance | Single codebase | Shared + RN UI | Single | Two codebases |
| Best for | Quick MVP + contacts | Long-term mobile-first | Web-only, no contacts | Highest fidelity |

**Recommendation for MatchMaker:** Capacitor is the most practical choice to enable device contact picking while reusing the existing React frontend. If the app later demands a fully native UX or heavy native features, a React Native or native migration can be planned. See also [NEXT_STEPS_ROADMAP.md](./NEXT_STEPS_ROADMAP.md) for the broader mobile strategy.

---

## Prerequisites

- **Node.js** 18+
- **Xcode** (macOS) for iOS builds
- **Android Studio** for Android builds
- **Apple Developer account** for iOS deployment
- **Google Play Console** for Android deployment (optional for dev/testing)

---

## Phase 1: Add Capacitor to the Frontend

### 1.1 Install Capacitor

```bash
cd frontend
npm install @capacitor/core @capacitor/cli
npx cap init "MatchMaker" "com.matchmaker.app"
```

This creates `capacitor.config.ts` and `ios/` / `android/` folders.

### 1.2 Configure Capacitor

Edit `frontend/capacitor.config.ts`:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.matchmaker.app',
  appName: 'MatchMaker',
  webDir: 'dist',
  server: {
    // Optional: point to Vite dev server for live reload during development
    // url: 'http://YOUR_IP:5173',
    // cleartext: true,
  },
  plugins: {
    // Optional: splash screen, status bar, etc.
  },
};
```

> **Note:** For local dev, you may want `server.url` to point to your Vite dev server (`http://YOUR_IP:5173`) so hot reload works. For production builds, remove or adjust `server` so the app loads from the bundled `webDir`.

### 1.3 Build and Add Platforms

```bash
npm run build
npx cap add ios
npx cap add android
```

### 1.4 Sync and Run

```bash
npx cap sync
npx cap open ios    # Opens Xcode
npx cap open android # Opens Android Studio
```

---

## Phase 2: Add the Contacts Plugin

### 2.1 Install the Plugin

```bash
cd frontend
npm install @capacitor-community/contacts
npx cap sync
```

### 2.2 Configure Permissions

**iOS** – Add to `ios/App/App/Info.plist`:

```xml
<key>NSContactsUsageDescription</key>
<string>MatchMaker needs access to your contacts to let you invite friends to play.</string>
```

**Android** – Add to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.READ_CONTACTS" />
<uses-permission android:name="android.permission.WRITE_CONTACTS" />
```

> For read-only contact picking, `READ_CONTACTS` is sufficient. Add `WRITE_CONTACTS` only if you plan to create/update contacts.

### 2.3 API Overview

```ts
import { Contacts } from '@capacitor-community/contacts';

// Request permission (returns { contacts: 'granted' | 'denied' | 'limited' | ... })
const perm = await Contacts.requestPermissions();
if (perm.contacts !== 'granted' && perm.contacts !== 'limited') { /* handle denied */ }

// Option A: Get all contacts with phone numbers
const { contacts } = await Contacts.getContacts({
  projection: { name: true, phones: true },
});
// Each contact: { contactId, name: { display, given }, phones: [{ number, type }] }

// Option B: Native picker (single contact – uses system UI)
const { contact } = await Contacts.pickContact({
  projection: { name: true, phones: true },
});
```

---

## Phase 3: Implement Platform-Aware Contact Picker

### 3.1 Create a Contacts Service

Create `frontend/src/lib/services/contacts.service.ts`:

```ts
import { Capacitor } from '@capacitor/core';

export interface DeviceContact {
  id: string;
  name: string;
  phones: string[];
}

export const contactsService = {
  isNative(): boolean {
    return Capacitor.isNativePlatform();
  },

  async requestPermission(): Promise<'granted' | 'denied' | 'prompt'> {
    if (!this.isNative()) return 'denied';
    const { Contacts } = await import('@capacitor-community/contacts');
    const { contacts } = await Contacts.requestPermissions();
    return contacts === 'granted' || contacts === 'limited' ? 'granted' : (contacts as 'denied');
  },

  async getContacts(): Promise<DeviceContact[]> {
    if (!this.isNative()) return [];
    const { Contacts } = await import('@capacitor-community/contacts');
    const { contacts } = await Contacts.getContacts({
      projection: { name: true, phones: true },
    });
    return contacts.map((c) => ({
      id: c.contactId ?? '',
      name: c.name?.display ?? c.name?.given ?? 'Unknown',
      phones: (c.phones ?? []).map((p) => (p.number ?? '').trim()).filter(Boolean),
    }));
  },
};
```

### 3.2 Normalize Phone Numbers

The backend expects E.164 (e.g. `+34612345678`). Device contacts may have varied formats. Use the existing `frontend/src/lib/phone.utils.ts` and extend if needed:

```ts
// In contacts.service.ts or a helper
import { parseCountryCode, digitsOnly } from '@/lib/phone.utils';

function toE164(phone: string, defaultCountryCode = '34'): string {
  const digits = digitsOnly(phone);
  if (!digits) return '';
  const parsed = parseCountryCode(digits);
  const dial = parsed?.dial ?? defaultCountryCode;
  const national = parsed?.national ?? digits;
  return `+${dial}${national}`;
}
```

### 3.3 Integrate with Add Contacts Flow

Extend `AddContactsToInvite` (`frontend/src/components/add-contacts-to-invite.tsx`) to show a "Pick from device" button when running in the Capacitor app:

```tsx
// When contactsService.isNative():
// 1. Show "Pick from device" button
// 2. On click: request permission → getContacts() → show picker UI
// 3. For each selected contact: guestContactsService.ensureUserByPhone(phone, name)
// 4. schedulingService.addCandidates(requestId, userIds, hostUserId)
```

Example integration pattern:

```tsx
if (contactsService.isNative()) {
  // Add "Pick from device" button
  // On click:
  const status = await contactsService.requestPermission();
  if (status !== 'granted') {
    toast.error('Contacts permission is required to pick from your device');
    return;
  }
  const deviceContacts = await contactsService.getContacts();
  // Show modal/drawer to select contacts
  // For each selected: ensureUserByPhone(phone, name) → collect user IDs
  // Then: schedulingService.addCandidates(requestId, userIds, hostUserId)
}
```

### 3.4 Integrate with I Want to Play Wizard

The I Want to Play wizard (`i-want-to-play-wizard.tsx`) already uses `guestContactsService.ensureUserByPhone` and `guestContactsService.create`. Add a step or button:

- "Pick from device contacts" → opens contact picker → maps to `AvailableContact[]` with `type: 'guestContact'` and `phone`
- Existing logic then calls `ensureUserByPhone` and passes `candidateUserIds` to `schedulingService.create`

---

## Phase 4: Flow: Device Contacts → Backend

### 4.1 Backend Support

No schema changes are required. The backend already supports:

| Endpoint | Purpose |
|----------|---------|
| `POST /guest-contacts/ensure-user` | Find or create `User` by phone; returns `{ user: { id, name } }` |
| `POST /scheduling/:requestId/candidates` | Add candidates by `candidateUserIds` |

### 4.2 Frontend Flow

1. User taps "Pick from device" (only visible when `Capacitor.isNativePlatform()`).
2. Request contacts permission; if denied, show message and exit.
3. Fetch contacts via `Contacts.getContacts`.
4. User selects one or more contacts (with phone numbers).
5. For each selected contact:
   - Normalize phone to E.164.
   - Call `guestContactsService.ensureUserByPhone(phone, name)`.
   - Collect `user.id`.
6. Call `schedulingService.addCandidates(requestId, userIds, hostUserId)`.
7. Refresh the UI.

### 4.3 Edge Cases

- **No phone number** – Skip or show warning.
- **Duplicate phones** – `ensureUserByPhone` returns the same user; dedupe by `user.id` before `addCandidates`.
- **Permission denied** – Fall back to manual entry (PhoneInput) or groups/friends.

---

## Phase 5: Build and Deploy

### 5.1 Build Commands

```bash
cd frontend
npm run build
npx cap sync
```

### 5.2 iOS

```bash
npx cap open ios
# In Xcode: select device/simulator, run (⌘R)
```

For release: Product → Archive → Distribute to App Store or Ad Hoc.

### 5.3 Android

```bash
npx cap open android
# In Android Studio: Run on device/emulator
```

For release: Build → Generate Signed Bundle/APK.

---

## Project Structure After Migration

```
frontend/
├── src/
│   ├── lib/
│   │   └── services/
│   │       ├── api-client.ts
│   │       ├── contacts.service.ts    # NEW – Capacitor contacts wrapper
│   │       ├── guest-contacts.service.ts
│   │       └── scheduling.service.ts
│   └── components/
│       ├── add-contacts-to-invite.tsx # UPDATED – "Pick from device" button
│       └── i-want-to-play-wizard.tsx  # UPDATED – device contact picker option
├── ios/           # Capacitor iOS project
├── android/       # Capacitor Android project
├── capacitor.config.ts
├── package.json   # + @capacitor/core, @capacitor/cli, @capacitor-community/contacts
└── dist/          # Vite build output (served by Capacitor)
```

---

## Environment and API Base URL

In native apps, the API base URL must point to your deployed backend, not `localhost`. Options:

1. **Build-time** – Set `VITE_API_BASE_URL` in `.env.production` and use it in `api-client.ts` (already supported).
2. **Runtime** – Use Capacitor's `Preferences` or a config endpoint to override the API URL for different environments.

---

## Optional Enhancements

| Enhancement | Plugin / Approach |
|-------------|-------------------|
| Splash screen | `@capacitor/splash-screen` |
| Status bar styling | `@capacitor/status-bar` |
| Push notifications | `@capacitor/push-notifications` (for invite reminders) |
| Secure storage for JWT | `@capacitor/preferences` or `@capacitor-community/secure-storage` |
| Deep links | Capacitor App plugin `appUrlOpen` |

---

## Checklist

- [ ] Install Capacitor and add iOS/Android platforms
- [ ] Install `@capacitor-community/contacts` and configure permissions
- [ ] Create `contacts.service.ts` with platform detection and permission handling
- [ ] Add "Pick from device" to `AddContactsToInvite`
- [ ] Add device contact option to I Want to Play wizard
- [ ] Test on iOS simulator and Android emulator
- [ ] Test contact permission denied flow
- [ ] Configure production API URL
- [ ] Document build/sign process for team

---

*Last updated: 2026-03*
