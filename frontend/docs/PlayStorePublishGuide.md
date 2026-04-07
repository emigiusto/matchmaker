# Publishing MatchMaker to the Google Play Store

App ID: `com.matchmaker.app`

---

## Step 1 — Build the web assets

Open a terminal in the `frontend` folder and run:

```bash
npm run build
npx cap sync android
```

This compiles the React app and copies the output into the Android project.

---

## Step 2 — Open the project in Android Studio

1. Open **Android Studio**
2. Click **Open**
3. Navigate to `frontend/android` and open that folder
4. Wait for Gradle to finish syncing (progress bar at the bottom)

---

## Step 3 — Generate a signed AAB (Android App Bundle)

Google requires a signed AAB for new apps submitted to the Play Store.

### In Android Studio (newer versions — Hedgehog / Iguana / Jellyfish):

1. In the top menu bar, click **Build**
2. If you see **Generate Signed App Bundle / APK...** → click it and skip to step 3b
3. If you don't see it there, try:
   - **Build → Build Bundle(s) / APK(s)** is for unsigned builds only — skip this
   - Instead go to the menu: **Build → Generate Signed Bundle or APK**
   - If still not visible, use the search bar: press **Shift + Shift** (double shift) and type `Generate Signed` → click the result

### Walkthrough once the wizard opens:

1. Select **Android App Bundle** → click **Next**
2. Under **Key store path**, click **Create new...**
   - Choose a location to save the `.jks` file (e.g., `C:\keys\matchmaker-release.jks`)
   - Fill in:
     - **Key store password** — choose a strong password
     - **Key alias** — e.g., `matchmaker`
     - **Key password** — choose a strong password
     - **Validity** — 25 years or more
     - **Certificate fields** — at minimum fill in your name or organization
   - Click **OK**
3. Back on the wizard, fill in the passwords and alias you just created → click **Next**
4. Select **release** as the build variant
5. Click **Finish**

The AAB will be generated at:
```
frontend/android/app/build/outputs/bundle/release/app-release.aab
```

> **Important:** Back up your `.jks` keystore file and remember both passwords.
> If you lose them, you will never be able to update the app on the Play Store.

---

## Step 4 — Create a Google Play Developer account

1. Go to [https://play.google.com/console](https://play.google.com/console)
2. Sign in with a Google account
3. Pay the one-time **$25 USD** registration fee
4. Complete identity verification (may take 24–48 hours)

---

## Step 5 — Create the app in the Play Console

1. Click **Create app**
2. Fill in:
   - App name: `MatchMaker`
   - Default language
   - App or game: **App**
   - Free or paid
3. Accept the declarations and click **Create app**

---

## Step 6 — Complete the store listing

Under **Grow → Store presence → Main store listing**:

- Short description (80 chars max)
- Full description (4000 chars max)
- Screenshots (at least 2 phone screenshots required)
- Feature graphic (1024 × 500 px)
- App icon (512 × 512 px, PNG)

---

## Step 7 — Fill in required sections

The Play Console will show a checklist. You must complete all of these before publishing:

- **App content** → Content rating (fill out the questionnaire)
- **App content** → Target audience
- **App content** → Data safety (declare what data the app collects)
- **Pricing & distribution** → select countries

---

## Step 8 — Upload the AAB and publish

1. Go to **Release → Production** (or **Internal testing** to test first — recommended)
2. Click **Create new release**
3. Upload your `app-release.aab` file
4. Add release notes (what's new)
5. Click **Save** → **Review release** → **Start rollout to Production**

---

## Version management

Every time you publish an update, you must increment `versionCode` in:

`frontend/android/app/build.gradle` — lines 10–11:

```gradle
versionCode 1        // increment by 1 each release (1, 2, 3...)
versionName "1.0"    // human-readable version shown in the store
```

Then repeat Steps 1–3 and upload the new AAB.
