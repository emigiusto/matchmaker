// laieta.adapter.ts
// Booking adapter for Club Tennis Laieta via miclubonline.net (Drupal/Puppeteer).
// Availability scraping logic adapted from existing aceUp implementation.

import fs from 'fs'
import os from 'os'
import path from 'path'
import puppeteer, { type Browser, type Page } from 'puppeteer'
import type { BookingAdapter } from './base.adapter'
import type { ClubCredentials, CourtAvailabilityResult, BookingResult } from '../booking.types'
import { AppError } from '../../../shared/errors/AppError'
import { logger } from '../../../config/logger'

const BASE_URL = 'https://laieta.miclubonline.net'

// Session cookie name for miclubonline (Drupal 7 secure session)
const SESSION_COOKIE_NAME = 'SSESS08110d752f71ad6f425bc1cb43a1d27b'

// miclubonline sport IDs for the /infopistas/:sportId/:date route
const SPORT_IDS: Record<string, number> = {
  tennis: 15,
  padel: 10,
}

interface ScrapedCourt {
  courtName: string
  hour: string  // e.g. "09"
}

export class LaietaAdapter implements BookingAdapter {

  private async launchBrowser(): Promise<Browser> {
    return puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  }

  /**
   * Log in to miclubonline and return the session cookie value.
   * Uses standard Drupal 7 login form selectors.
   */
  private isOfflineError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err)
    return ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ERR_NAME_NOT_RESOLVED', 'net::ERR'].some(
      (p) => msg.includes(p),
    )
  }

  private async login(browser: Browser, creds: ClubCredentials): Promise<string> {
    const page = await browser.newPage()
    try {
      await page.goto(`${BASE_URL}/user/login`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((err) => {
        if (this.isOfflineError(err)) {
          throw new AppError('Club booking system is offline or unreachable', 503, 'ADAPTER_OFFLINE')
        }
        throw err
      })

      // Standard Drupal 7 login selectors
      await page.type('#edit-name', creds.socioNumber)
      await page.type('#edit-pass', creds.password)
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
        page.click('#edit-submit'),
      ])

      const currentUrl = page.url()
      if (currentUrl.includes('/user/login')) {
        // Still on login page → credentials rejected
        throw new AppError('Invalid credentials for club portal', 401, 'INVALID_CLUB_CREDENTIALS')
      }

      const cookies = await page.cookies()
      const sessionCookie = cookies.find((c) => c.name === SESSION_COOKIE_NAME)
      if (!sessionCookie) {
        throw new AppError(
          'Login succeeded but session cookie not found — the cookie name may have changed',
          500,
          'BOOKING_SESSION_ERROR',
        )
      }

      return sessionCookie.value
    } finally {
      await page.close()
    }
  }

  /**
   * Open a page using an existing session cookie (avoids re-login for each page).
   */
  private async openWithSession(browser: Browser, url: string, sessionValue: string): Promise<Page> {
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    await context.setCookie({
      name: SESSION_COOKIE_NAME,
      value: sessionValue,
      domain: 'laieta.miclubonline.net',
      path: '/',
    })
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    if (!response || response.status() !== 200) {
      throw new AppError(`Failed to load availability page (HTTP ${response?.status()})`, 502, 'BOOKING_PAGE_ERROR')
    }
    return page
  }

  /**
   * Scrape available courts from the infopistas page.
   * A cell is considered available when it can hold 4 players and has free slots:
   *   - 2 empty + 2 occupied (class4), or
   *   - 1 empty + 3 occupied (class4)
   * Optionally filters to a specific time (4-char HHMM string, e.g. "0900").
   */
  private async scrapeAvailableSlots(page: Page, targetHourMin?: string): Promise<ScrapedCourt[]> {
    await page.waitForSelector('#edit-gpa-piw-pistas', { timeout: 10000 })

    return page.evaluate((hhmm: string | undefined) => {
      // Iterate a.a_pistas_hora elements directly instead of walking the table via
      // querySelectorAll('tr') → querySelectorAll('td'), which is recursive and
      // double-counts courts in nested table structures.
      // Group by courtNum:hour (from the ID) — same logic as the book() slot selector.
      const targetHour = hhmm ? hhmm.slice(0, 2) : undefined  // e.g. "17" from "1700"

      const cells: Record<string, { courtName: string; hour: string; emptyCount: number; valid: boolean }> = {}

      document.querySelectorAll('a.a_pistas_hora').forEach((link) => {
        const a = link as HTMLAnchorElement
        const idParts = a.id.split(':')
        const courtNum = idParts[0]            // e.g. "07"
        const courtName = idParts[1]           // e.g. "TENNIS"
        const hourRaw = idParts[2]             // e.g. "8" or "17" (portal uses single-digit hours)
        if (!courtNum || !courtName || !hourRaw) return
        const hour = hourRaw.padStart(2, '0')  // normalise to 2 digits: "8" → "08", "17" → "17"
        if (targetHour && hour !== targetHour) return

        const slotClass = a.className.split(' ')[2]?.trim()
        const key = `${courtNum}:${hour}`
        if (!cells[key]) cells[key] = { courtName, hour: hour + '00', emptyCount: 0, valid: true }

        if (slotClass === 'classempty') cells[key].emptyCount++
        if (slotClass !== 'classempty' && slotClass !== 'class4') cells[key].valid = false
      })

      return Object.values(cells)
        .filter(({ valid, emptyCount }) => valid && emptyCount >= 1)
        .map(({ courtName, hour }) => ({ courtName, hour }))
    }, targetHourMin)
  }

  /**
   * Save a base64 screenshot to a temp file and return the path for logging.
   * Avoids dumping thousands of characters inline into log output.
   */
  private saveScreenshot(b64: string, label: string): string {
    try {
      const file = path.join(os.tmpdir(), `laieta-debug-${label}-${Date.now()}.png`)
      fs.writeFileSync(file, Buffer.from(b64, 'base64'))
      return file
    } catch {
      return '(screenshot save failed)'
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  /**
   * Check /reservas for an existing booking matching date, hour, sport, and at least one
   * of the given socio numbers. Called when a BOOKING_QUOTA_EXCEEDED error is thrown after
   * submit, to detect whether a previous attempt already succeeded on the portal.
   */
  private async findExistingBookingOnReservas(
    browser: Browser,
    sessionValue: string,
    date: string,           // YYYY-MM-DD
    targetHour: string,     // "09"
    sport: string,
    socioNumbers: string[], // host + all participants
  ): Promise<BookingResult | null> {
    try {
      const page = await this.openWithSession(browser, `${BASE_URL}/reservas`, sessionValue)

      const [year, month, day] = date.split('-')
      const pageDate = `${day}-${month}-${year}`  // DD-MM-YYYY as shown on the page
      const pageHour = `${targetHour}:00`
      const sportUpper = sport.toUpperCase()

      const found = await page.evaluate(
        (pageDate: string, pageHour: string, sportUpper: string, socioNumbers: string[]) => {
          const fieldsets = document.querySelectorAll('fieldset.panel.panel-default')
          for (const fieldset of fieldsets) {
            const dateEl = fieldset.querySelector('[id^="edit-date"]')
            const hourEl = fieldset.querySelector('[id^="edit-hour"]')
            const placeEl = fieldset.querySelector('[id^="edit-place"]')
            const playersEl = fieldset.querySelector('[id^="edit-players"]')
            if (!dateEl || !hourEl || !placeEl) continue

            const bookingDate = dateEl.textContent?.trim() ?? ''
            const bookingHour = hourEl.textContent?.trim() ?? ''
            const bookingPlace = placeEl.textContent?.trim() ?? ''
            const playersText = playersEl?.textContent ?? ''

            if (bookingDate !== pageDate || bookingHour !== pageHour) continue
            if (!bookingPlace.toUpperCase().includes(sportUpper)) continue

            // Confirm at least one of our socio numbers appears in the players list
            const hasSocio = socioNumbers.some((n) => playersText.includes(`[${n}]`))
            if (!hasSocio) continue

            // Try to extract the numeric booking ID from links in the fieldset
            const links = Array.from(fieldset.querySelectorAll('a[href]'))
            const reservaLink = links.find((a) => /\/reservas\/\d+/.test((a as HTMLAnchorElement).getAttribute('href') ?? ''))
            const hrefMatch = (reservaLink as HTMLAnchorElement | null)?.getAttribute('href')?.match(/\/reservas\/(\d+)/)
            const bookingId = hrefMatch ? hrefMatch[1] : null

            return { courtName: bookingPlace.replace(/\s+/g, ' ').trim(), bookingId }
          }
          return null
        },
        pageDate, pageHour, sportUpper, socioNumbers,
      )

      if (!found) return null
      const externalId = found.bookingId ?? `${found.courtName}::${date}::${targetHour}`
      const confirmationUrl = found.bookingId ? `${BASE_URL}/reservas/${found.bookingId}/pistas` : undefined
      logger.info(`[laieta] Existing booking found on /reservas: ${externalId}`)
      return { externalId, courtName: found.courtName, confirmationUrl }
    } catch (err) {
      logger.warn('[laieta] Could not check /reservas for existing booking:', err instanceof Error ? err.message : err)
      return null
    }
  }

  /**
   * Throws if the page contains a visible error block.
   * Checks both the standard Drupal danger alert and the Bootstrap
   * tooltip/popover used by miclubonline for participant AJAX errors.
   */
  private async checkForPageError(page: Page): Promise<void> {
    const errorText = await page.evaluate(() => {
      // Standard Drupal full-width danger alert
      const alertEl = document.querySelector('.alert.alert-block.alert-danger')
      if (alertEl) {
        const clone = alertEl.cloneNode(true) as HTMLElement
        clone.querySelectorAll('.element-invisible, .close').forEach((n) => n.remove())
        const text = clone.textContent?.trim()
        if (text) return text
      }
      // Bootstrap tooltip / popover used for participant AJAX errors
      const tooltipEl = document.querySelector('.popover-content, .tooltip-inner, .popover .popover-body')
      if (tooltipEl) {
        const text = tooltipEl.textContent?.trim()
        if (text) return text
      }
      return null
    })
    if (!errorText) return

    const isQuotaError = /nombre m.xim de reserves|quota|límit de reserves/i.test(errorText)
    if (isQuotaError) {
      throw new AppError(errorText, 409, 'BOOKING_QUOTA_EXCEEDED')
    }
    throw new AppError(errorText, 409, 'BOOKING_PAGE_ERROR')
  }

  // ─── BookingAdapter implementation ────────────────────────────────

  async testConnection(creds: ClubCredentials): Promise<boolean> {
    let browser: Browser | null = null
    try {
      browser = await this.launchBrowser()
      await this.login(browser, creds)
      return true
    } catch (err) {
      if (err instanceof AppError && err.errorCode === 'INVALID_CLUB_CREDENTIALS') return false
      throw err
    } finally {
      if (browser) await browser.close()
    }
  }

  /** Convert YYYY-MM-DD → YYYYMMDD as required by miclubonline URLs */
  private toUrlDate(date: string): string {
    return date.replace(/-/g, '')
  }

  async checkAvailability(
    creds: ClubCredentials,
    date: string,
    time?: string,
    options?: { sport?: string },
  ): Promise<CourtAvailabilityResult> {
    const sport = options?.sport ?? 'tennis'
    const sportId = SPORT_IDS[sport] ?? SPORT_IDS.tennis
    const targetHourMin = time ? time.replace(':', '') : undefined  // "09:00" → "0900", undefined → return all

    let browser: Browser | null = null
    try {
      browser = await this.launchBrowser()
      const sessionValue = await this.login(browser, creds)
      const url = `${BASE_URL}/infopistas/${sportId}/${this.toUrlDate(date)}`

      const page = await this.openWithSession(browser, url, sessionValue)
      const courts = await this.scrapeAvailableSlots(page, targetHourMin)

      return {
        date,
        sport,
        availableCourts: courts.map((c) => ({
          courtId: c.courtName,
          courtName: c.courtName,
          time: `${c.hour.slice(0, 2)}:${c.hour.slice(2, 4)}`,  // "0930" → "09:30"
        })),
      }
    } finally {
      if (browser) await browser.close()
    }
  }

  async book(
    creds: ClubCredentials,
    date: string,
    time: string,
    courtId: string,
    participants: Array<{ socioNumber: string; name: string }>,
    options?: { sport?: string },
  ): Promise<BookingResult> {
    const sport = options?.sport ?? 'tennis'
    const sportId = SPORT_IDS[sport] ?? SPORT_IDS.tennis
    const targetHour = time.slice(0, 2)          // "09" — used for /reservas page matching
    const targetHourMin = time.replace(':', '')   // "0900" — used for exact slot click
    const allSocioNumbers = [creds.socioNumber, ...participants.map((p) => p.socioNumber)]

    let browser: Browser | null = null
    try {
      browser = await this.launchBrowser()
      const sessionValue = await this.login(browser, creds)

      // ── Pre-check: idempotency ──────────────────────────────────────
      // If a matching booking already exists on /reservas (e.g. from a previous attempt),
      // return it immediately without going through the booking flow again.
      const preExisting = await this.findExistingBookingOnReservas(browser, sessionValue, date, targetHour, sport, allSocioNumbers)
      if (preExisting) {
        logger.info(`[laieta] Booking already exists on /reservas — skipping submit: ${preExisting.externalId}`)
        return preExisting
      }

      // ── Step 1: Find and click the target slot ──────────────────────
      const url = `${BASE_URL}/infopistas/${sportId}/${this.toUrlDate(date)}`
      logger.info(`[laieta] Starting booking: court=${courtId}, ${date} ${targetHour}:00, sport=${sport}`)
      const page = await this.openWithSession(browser, url, sessionValue)
      await page.waitForSelector('#edit-gpa-piw-pistas', { timeout: 10000 })

      // Return the element's id string from evaluate, then use page.click() with an
      // attribute selector so Puppeteer simulates a real mouse event sequence
      // (mousedown/mouseup/click). A synthetic DOM .click() inside page.evaluate()
      // does not fire the full event sequence and the portal's popup never appears.
      const slotId = await page.evaluate((targetCourtId: string, targetHHMM: string) => {
        // Group sub-slots by physical court number (id prefix, e.g. "07") so we can
        // check that ALL four quarter-hour sub-slots are classempty or class4 before
        // selecting a court. A cell with any classR sub-slot cannot be booked for a
        // full hour ("El temps mínim és 1 hora") even if the :00 sub-slot is empty.
        const courtMap: Record<string, { emptyId: string | null; valid: boolean }> = {}
        document.querySelectorAll('a.a_pistas_hora').forEach((link) => {
          const a = link as HTMLAnchorElement
          const courtNum = a.id.split(':')[0]        // e.g. "07"
          const courtName = a.id.split(':')[1]       // e.g. "TENNIS"
          const classParts = a.className.split(' ')
          const slotClass = classParts[2]?.trim()
          const namePart = classParts[3]?.trim().split('_')[1]
          if (!namePart || courtName !== targetCourtId) return
          const slotHourMin = namePart.slice(0, 4)  // full HHMM, e.g. "1300"
          if (slotHourMin !== targetHHMM) return

          if (!courtMap[courtNum]) courtMap[courtNum] = { emptyId: null, valid: true }
          if (slotClass === 'classempty' && !courtMap[courtNum].emptyId) {
            courtMap[courtNum].emptyId = a.id
          }
          if (slotClass !== 'classempty' && slotClass !== 'class4') {
            courtMap[courtNum].valid = false  // classR or unknown — full hour not bookable
          }
        })
        for (const { emptyId, valid } of Object.values(courtMap)) {
          if (valid && emptyId) return emptyId
        }
        return null
      }, courtId, targetHourMin)

      if (!slotId) {
        throw new AppError(`Slot no longer available: court=${courtId} at ${time}`, 409, 'SLOT_NOT_FOUND')
      }

      // Scroll the target slot into the viewport before clicking.
      // The timetable spans 6h–23h; a 17:00 slot is far down and may be outside
      // the initial viewport, causing page.click() to mis-fire on some Puppeteer builds.
      await page.evaluate((id: string) => {
        document.querySelector(`[id="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'instant' })
      }, slotId)
      await new Promise(r => setTimeout(r, 400))

      // hover() first so the portal's mouseenter handlers fire before the click
      await page.hover(`[id="${slotId}"]`).catch(() => { /* non-fatal */ })
      await new Promise(r => setTimeout(r, 150))
      await page.click(`[id="${slotId}"]`)

      // ── Step 2: Popup → click "Continua" ───────────────────────────
      const popupSelector = '.a_button_popup_fix.a_pistas_hora_sel'
      const popupFound = await page.waitForSelector(popupSelector, { timeout: 10000 }).then(() => true).catch(() => false)

      if (!popupFound) {
        // Native click did not trigger the popup — retry via jQuery, which the portal
        // uses internally and is more reliably bound at this point.
        logger.warn(`[laieta] Popup not found after native click — retrying with jQuery trigger`)
        await page.evaluate((id: string) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(window as any).$?.(`[id="${CSS.escape(id)}"]`).trigger('click')
        }, slotId)
        const popupFoundAfterJq = await page.waitForSelector(popupSelector, { timeout: 8000 }).then(() => true).catch(() => false)

        if (!popupFoundAfterJq) {
          const pageUrl = page.url()
          const bodySnippet = await page.evaluate(() =>
            document.body.innerText?.replace(/\s+/g, ' ').trim().slice(0, 500)
          ).catch(() => '?')
          const screenshotB64 = await page.screenshot({ encoding: 'base64', fullPage: true }).catch(() => null)
          const screenshotPath = screenshotB64 ? this.saveScreenshot(screenshotB64 as string, 'popup-missing') : null
          logger.error(`[laieta] Popup selector not found after slot click. url=${pageUrl}`)
          logger.error(`[laieta] Page text snippet: ${bodySnippet}`)
          if (screenshotPath) logger.error(`[laieta] Screenshot saved: ${screenshotPath}`)
          throw new AppError(`Popup did not appear after clicking slot ${slotId}`, 502, 'BOOKING_POPUP_MISSING')
        }
      }
      // Attach .catch immediately — before await page.click() — so that if the navigation
      // resolves/rejects while the click is still in progress, Node.js does not treat it as
      // an unhandled rejection and crash (strict behaviour in Node.js v15+).
      const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
        .catch((err: Error) => {
          // "Navigating frame was detached" / "LifecycleWatcher terminated" fires when
          // navigation completes so fast the frame is already gone — treat as success.
          if (err.message.includes('detached') || err.message.includes('LifecycleWatcher')) {
            logger.warn('[laieta] waitForNavigation: frame detached — navigation likely already completed')
            return
          }
          throw err
        })
      await page.evaluate(() => {
        document.querySelector('.a_button_popup_fix.a_pistas_hora_sel')?.scrollIntoView({ block: 'center', behavior: 'instant' })
      })
      await new Promise(r => setTimeout(r, 200))
      await page.click('.a_button_popup_fix.a_pistas_hora_sel').catch(() => {
        // Fall back to DOM click if Puppeteer's pointer simulation fails (e.g. element off-screen)
        logger.warn('[laieta] Native click on Continua failed — retrying via DOM click')
        return page.evaluate(() => {
          (document.querySelector('.a_button_popup_fix.a_pistas_hora_sel') as HTMLElement)?.click()
        })
      })
      await navigationPromise
      await this.checkForPageError(page)

      // ── Step 3: Add participants via portal UI ──────────────────────
      // We use the real form UI (#edit-add input + .btn-add-participant button) so the
      // portal's own JavaScript runs, calls the AJAX endpoint, and populates the
      // participant slots in the form. Bypassing the UI (direct AJAX fetch) left the
      // DOM slots empty and the form submit excluded the participant.

      // Dismiss the cookie consent banner if present — it can overlap the form inputs.
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'))
        const accept = btns.find((b) => /accepto/i.test(b.textContent ?? ''))
        ;(accept as HTMLElement)?.click()
      }).catch(() => {})
      await new Promise(r => setTimeout(r, 300))

      const bookingPageUrl = page.url()
      const urlSegments = new URL(bookingPageUrl).pathname.split('/').filter(Boolean)
      const place = urlSegments[3] ?? ''
      const timeHHMM = urlSegments[4] ?? targetHourMin
      const registeredSocios = [creds.socioNumber]

      for (const participant of participants) {
        const { socioNumber, name } = participant
        const playerPos = registeredSocios.length + 1

        // Pre-check eligibility via API before touching the UI — gives a clear error
        // message (e.g. "no és soci", quota exceeded) without leaving the form in a
        // broken state.
        const checkBody = new URLSearchParams({
          newparticipant: socioNumber,
          playerpos: String(playerPos),
          place,
          date: this.toUrlDate(date),
          time: timeHHMM,
          amount: '4',
          fromlevel: '',
          tolevel: '',
          mixed: 'N',
        })
        for (const p of registeredSocios) checkBody.append('participants[]', p)
        checkBody.append('participants[]', socioNumber)

        logger.info(`[laieta] Pre-checking participant eligibility via API: ${socioNumber} (${name})`)
        const checkResp = await fetch(`${BASE_URL}/ajax/infopistas/participantes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': `${SESSION_COOKIE_NAME}=${sessionValue}`,
            'Referer': bookingPageUrl,
          },
          body: checkBody.toString(),
        })
        if (!checkResp.ok) {
          throw new AppError(`Participant eligibility check returned HTTP ${checkResp.status}`, 502, 'BOOKING_PAGE_ERROR')
        }
        const checkJson = await checkResp.json() as { error: boolean; message: string; newparticipant: string }
        logger.info(`[laieta] Eligibility check ${socioNumber}: error=${checkJson.error}, result="${checkJson.newparticipant}", msg="${checkJson.message}"`)
        if (checkJson.error) {
          throw new AppError(`${name}: ${checkJson.message || 'Could not be added to the booking'}`, 409, 'BOOKING_PAGE_ERROR')
        }

        // Participant is eligible — now add them via the real UI so the portal's JS
        // populates the form slot (the AJAX call alone does not update the DOM).
        await page.waitForSelector('#edit-add', { timeout: 5000 })
        await page.click('#edit-add', { clickCount: 3 })
        await page.type('#edit-add', socioNumber)

        logger.info(`[laieta] Adding participant via UI: ${socioNumber} (${name})`)
        await page.click('button.btn-add-participant')

        registeredSocios.push(socioNumber)

        // Wait for the portal's AJAX to complete and the socio number to appear in
        // the participants panel. The participant slots are <input> elements whose
        // value is not included in innerText, so check input values as well.
        const appeared = await page.waitForFunction(
          (socio: string) => {
            const needle = `[${socio}]`
            if (document.body.innerText.includes(needle)) return true
            return Array.from(document.querySelectorAll('input')).some(
              (i) => (i as HTMLInputElement).value.includes(needle),
            )
          },
          { timeout: 8000 },
          socioNumber,
        ).then(() => true).catch(() => false)

        if (!appeared) {
          // Capture state for debugging before throwing
          const screenshotB64 = await page.screenshot({ encoding: 'base64', fullPage: true }).catch(() => null)
          if (screenshotB64) logger.error(`[laieta] Participant not added screenshot: ${this.saveScreenshot(screenshotB64 as string, 'participant-error')}`)
          throw new AppError(
            `Participant ${name} (${socioNumber}) did not appear in the booking form after clicking Afegeix`,
            409,
            'BOOKING_PARTICIPANT_NOT_REGISTERED',
          )
        }
        logger.info(`[laieta] Participant ${socioNumber} confirmed in booking form`)
      }
      logger.info(`[laieta] Pre-submit check passed: all ${participants.length} participant(s) present in form`)

      // Capture the booking form page so we can visually verify participants are shown
      const preSubmitB64 = await page.screenshot({ encoding: 'base64', fullPage: true }).catch(() => null)
      if (preSubmitB64) {
        const preSubmitPath = this.saveScreenshot(preSubmitB64 as string, 'pre-submit')
        logger.info(`[laieta] Pre-submit screenshot saved: ${preSubmitPath}`)
      }

      // All participants registered server-side — force-enable submit and proceed
      await page.evaluate(() => {
        const btn = document.querySelector('button#edit-submit[name="reserva"]') as HTMLButtonElement | null
        if (btn) btn.disabled = false
      })

      // ── Step 4: Submit booking ──────────────────────────────────────

      if (process.env.BOOKING_SUBMIT_ENABLED !== 'true') {
        const externalId = `[TEST-MODE]::${courtId}::${date}::${targetHour}`
        logger.info(`[laieta][TEST MODE] Submit skipped (BOOKING_SUBMIT_ENABLED != true)`)
        logger.info(`[laieta][TEST MODE] Would book: court=${courtId}, date=${date}, time=${targetHour}:00, sport=${sport}, participants=${participants.map((p) => `${p.name}(${p.socioNumber})`).join(', ')}`)
        return { externalId, courtName: courtId }
      }

      // Intercept the form submit request to log the exact POST body sent to the portal.
      // This lets us confirm that participants[] values are present in the request.
      // The intercepted request is immediately continued unchanged.
      await page.setRequestInterception(true)
      const submitInterceptHandler = (req: import('puppeteer').HTTPRequest) => {
        if (req.method() === 'POST' && req.url().includes('/infopistas/')) {
          const postData = req.postData() ?? ''
          const params = new URLSearchParams(postData)
          const participantsInPost = params.getAll('participants[]')
          logger.info(`[laieta] Form POST body — participants[]: ${JSON.stringify(participantsInPost)}`)
        }
        req.continue().catch(() => { /* page may have already navigated */ })
      }
      page.on('request', submitInterceptHandler)

      await page.evaluate(() => {
        (document.querySelector('button#edit-submit[name="reserva"]') as HTMLButtonElement)?.click()
      })

      // Wait for the page to settle (navigation or inline alert)
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 })
          .then(() => logger.info('[laieta] Post-submit: navigation settled')),
        page.waitForSelector('.alert.alert-block.alert-success', { timeout: 20000 })
          .then(() => logger.info('[laieta] Post-submit: success alert detected')),
      ]).catch(() => logger.warn('[laieta] Post-submit: neither navigation nor success alert fired within timeout'))

      page.off('request', submitInterceptHandler)
      await page.setRequestInterception(false).catch(() => { /* non-fatal if already disabled */ })

      // Check for explicit page errors; re-throw unless it's a quota error
      // (quota exceeded can still mean the booking went through — confirmed below)
      try {
        await this.checkForPageError(page)
      } catch (err) {
        if (!(err instanceof AppError && err.errorCode === 'BOOKING_QUOTA_EXCEEDED')) throw err
        logger.warn('[laieta] Quota exceeded after submit — will verify via /reservas')
      }

      // ── Post-submit /reservas check ─────────────────────────────────
      // Give the portal a moment to register the new booking before querying
      logger.info('[laieta] Waiting 2s for portal to register booking...')
      await new Promise((r) => setTimeout(r, 2000))

      const booked = await this.findExistingBookingOnReservas(browser, sessionValue, date, targetHour, sport, allSocioNumbers)
      if (booked) {
        logger.info(`[laieta] Booking confirmed via /reservas: ${booked.externalId}`)
        if (booked.confirmationUrl) {
          try {
            const confirmPage = await this.openWithSession(browser, booked.confirmationUrl, sessionValue)
            const screenshotB64 = await confirmPage.screenshot({ encoding: 'base64', fullPage: true })
            const screenshotPath = this.saveScreenshot(screenshotB64 as string, 'confirmation')
            logger.info(`[laieta] Confirmation screenshot saved: ${screenshotPath}`)
          } catch (err) {
            logger.warn('[laieta] Could not capture confirmation screenshot:', err instanceof Error ? err.message : err)
          }
        }
        return booked
      }

      // Booking not found — capture diagnostics and fail
      const pageTitle = await page.title().catch(() => '?')
      const pageUrl = page.url()
      const bodySnippet = await page.evaluate(() =>
        document.body.innerText?.replace(/\s+/g, ' ').trim().slice(0, 500)
      ).catch(() => '?')
      const screenshotB64 = await page.screenshot({ encoding: 'base64', fullPage: true }).catch(() => null)
      const screenshotPath = screenshotB64 ? this.saveScreenshot(screenshotB64 as string, 'no-confirmation') : null
      logger.error(`[laieta] Booking not confirmed on /reservas. url=${pageUrl}, title="${pageTitle}"`)
      logger.error(`[laieta] Page text snippet: ${bodySnippet}`)
      if (screenshotPath) logger.error(`[laieta] Screenshot saved: ${screenshotPath}`)
      throw new AppError('Booking submit did not produce a confirmed reservation on /reservas', 502, 'BOOKING_NO_CONFIRMATION')
    } finally {
      if (browser) await browser.close()
    }
  }

  async cancel(creds: ClubCredentials, externalBookingId: string): Promise<void> {
    // externalBookingId can be:
    //   - A numeric ID (new format): "629061" — find the fieldset by its /reservas/{id} link
    //   - A compound ID (legacy):   "courtId::YYYY-MM-DD::HH" (possibly prefixed with "[TEST-MODE]::")
    const isNumericId = /^\d+$/.test(externalBookingId)

    let browser: Browser | null = null
    try {
      browser = await this.launchBrowser()
      const sessionValue = await this.login(browser, creds)
      const page = await this.openWithSession(browser, `${BASE_URL}/reservas`, sessionValue)

      let cancelButtonName: string | null

      if (isNumericId) {
        // New format: find the fieldset that links to /reservas/{numericId}
        cancelButtonName = await page.evaluate((bookingId: string) => {
          const fieldsets = document.querySelectorAll('fieldset.panel.panel-default')
          for (const fieldset of fieldsets) {
            const links = Array.from(fieldset.querySelectorAll('a[href]'))
            const hasLink = links.some((a) => (a as HTMLAnchorElement).getAttribute('href')?.includes(`/reservas/${bookingId}`))
            if (hasLink) {
              const cancelBtn = fieldset.querySelector('button[name^="cancel-"]') as HTMLButtonElement | null
              return cancelBtn?.name ?? null
            }
          }
          return null
        }, externalBookingId)

        if (!cancelButtonName) {
          throw new AppError(
            `No reservation was found at the club for booking #${externalBookingId}. It may have already been cancelled.`,
            404,
            'BOOKING_NOT_FOUND',
          )
        }
        logger.info(`[laieta] Cancelling booking: name=${cancelButtonName}, id=${externalBookingId}`)
      } else {
        // Legacy format: courtId::YYYY-MM-DD::HH
        const cleanId = externalBookingId.replace(/^\[TEST-MODE\]::/, '')
        const parts = cleanId.split('::')
        if (parts.length < 3) {
          throw new AppError(`Cannot parse externalBookingId for cancellation: ${externalBookingId}`, 400, 'INVALID_BOOKING_ID')
        }
        const [courtId, date, hour] = parts
        const [year, month, day] = date.split('-')
        const pageDate = `${day}-${month}-${year}`
        const pageHour = `${hour}:00`
        const normalizeCourt = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase()
        const targetCourt = normalizeCourt(courtId)

        cancelButtonName = await page.evaluate(
          (targetDate: string, targetHour: string, targetCourt: string) => {
            const normalizeCourt = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase()
            const fieldsets = document.querySelectorAll('fieldset.panel.panel-default')
            for (const fieldset of fieldsets) {
              const dateEl = fieldset.querySelector('[id^="edit-date--"]')
              const hourEl = fieldset.querySelector('[id^="edit-hour--"]')
              const placeEl = fieldset.querySelector('[id^="edit-place--"]')
              if (!dateEl || !hourEl || !placeEl) continue
              const bookingDate = dateEl.textContent?.trim() ?? ''
              const bookingHour = hourEl.textContent?.trim() ?? ''
              const bookingCourt = normalizeCourt(placeEl.textContent?.trim() ?? '')
              if (bookingDate === targetDate && bookingHour === targetHour && bookingCourt === targetCourt) {
                const cancelBtn = fieldset.querySelector('button[name^="cancel-"]') as HTMLButtonElement | null
                return cancelBtn?.name ?? null
              }
            }
            return null
          },
          pageDate, pageHour, targetCourt,
        )

        if (!cancelButtonName) {
          throw new AppError(
            `No reservation was found at the club for ${courtId} on ${pageDate} at ${pageHour}. It may have already been cancelled or the booking details don't match.`,
            404,
            'BOOKING_NOT_FOUND',
          )
        }
        logger.info(`[laieta] Cancelling booking: name=${cancelButtonName}, court=${courtId}, date=${date}, time=${pageHour}`)
      }

      // Override confirmDialog to auto-confirm, then click the cancel button
      const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.evaluate((btnName: string) => {
        ;(window as unknown as Record<string, unknown>)['confirmDialog'] = () => true
        const btn = document.querySelector(`button[name="${btnName}"]`) as HTMLButtonElement | null
        btn?.click()
      }, cancelButtonName)
      await navigationPromise

      await this.checkForPageError(page)
      logger.info(`[laieta] Booking cancelled: id=${externalBookingId}`)
    } finally {
      if (browser) await browser.close()
    }
  }
}
