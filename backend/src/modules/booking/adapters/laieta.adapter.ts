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
      const results: { courtName: string; hour: string }[] = []
      const fieldset = document.querySelector('#edit-gpa-piw-pistas')
      if (!fieldset) return results
      const table = fieldset.querySelector('table')
      if (!table) return results

      table.querySelectorAll('tr').forEach((row) => {
        row.querySelectorAll('td').forEach((cell) => {
          const emptySlots: string[] = []
          const occupiedSlots: string[] = []
          let cellHourMin = ''
          let courtName = ''

          cell.querySelectorAll('a.a_pistas_hora').forEach((el) => {
            const a = el as HTMLAnchorElement
            const parts = a.className.split(' ')
            const slotClass = parts[2]?.trim()
            const namePart = parts[3]?.trim().split('_')[1]
            if (namePart) {
              cellHourMin = namePart.slice(0, 4)  // full HHMM, e.g. "0930"
              courtName = a.id.split(':')[1] ?? ''
            }
            if (slotClass === 'classempty') emptySlots.push(a.className)
            if (slotClass === 'class4') occupiedSlots.push(a.className)
          })

          const isAvailable =
            (emptySlots.length === 2 && occupiedSlots.length === 2) ||
            (emptySlots.length === 1 && occupiedSlots.length === 3)

          if (isAvailable && (!hhmm || cellHourMin === hhmm)) {
            results.push({ courtName, hour: cellHourMin })
          }
        })
      })

      return results
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

            return { courtName: bookingPlace.replace(/\s+/g, ' ').trim() }
          }
          return null
        },
        pageDate, pageHour, sportUpper, socioNumbers,
      )

      if (!found) return null
      const externalId = `${found.courtName}::${date}::${targetHour}`
      logger.info(`[laieta] Existing booking found on /reservas: ${externalId}`)
      return { externalId, courtName: found.courtName }
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
        const links = document.querySelectorAll('a.a_pistas_hora')
        for (const link of links) {
          const a = link as HTMLAnchorElement
          const parts = a.className.split(' ')
          const slotClass = parts[2]?.trim()
          const namePart = parts[3]?.trim().split('_')[1]
          const slotHourMin = namePart?.slice(0, 4)  // full HHMM for exact match
          const courtName = a.id.split(':')[1]
          if (courtName === targetCourtId && slotHourMin === targetHHMM && slotClass === 'classempty') {
            return a.id
          }
        }
        return null
      }, courtId, targetHourMin)

      if (!slotId) {
        throw new AppError(`Slot no longer available: court=${courtId} at ${time}`, 409, 'SLOT_NOT_FOUND')
      }
      await page.click(`[id="${slotId}"]`)

      // ── Step 2: Popup → click "Continua" ───────────────────────────
      try {
        await page.waitForSelector('.a_button_popup_fix.a_pistas_hora_sel', { timeout: 10000 })
      } catch (err) {
        const pageUrl = page.url()
        const bodySnippet = await page.evaluate(() =>
          document.body.innerText?.replace(/\s+/g, ' ').trim().slice(0, 500)
        ).catch(() => '?')
        const screenshotB64 = await page.screenshot({ encoding: 'base64', fullPage: true }).catch(() => null)
        const screenshotPath = screenshotB64 ? this.saveScreenshot(screenshotB64 as string, 'popup-missing') : null
        logger.error(`[laieta] Popup selector not found after slot click. url=${pageUrl}`)
        logger.error(`[laieta] Page text snippet: ${bodySnippet}`)
        if (screenshotPath) logger.error(`[laieta] Screenshot saved: ${screenshotPath}`)
        throw err
      }
      const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.click('.a_button_popup_fix.a_pistas_hora_sel')
      await navigationPromise.catch((err: Error) => {
        // "Navigating frame was detached" / "LifecycleWatcher terminated" can fire when
        // navigation completes so fast the frame is already gone — treat as success.
        if (err.message.includes('detached') || err.message.includes('LifecycleWatcher')) {
          logger.warn('[laieta] waitForNavigation: frame detached — navigation likely already completed')
          return
        }
        throw err
      })
      await this.checkForPageError(page)

      // ── Step 3: Register participants via AJAX API ──────────────────
      // The portal exposes /ajax/infopistas/participantes which validates and
      // registers each participant server-side in the PHP session. Using it
      // directly (with the same session cookie) is more reliable than driving
      // the DOM form, and returns structured JSON errors.
      //
      // URL after "Continua": /infopistas/{sportId}/{date}/{place}/{time}
      const bookingPageUrl = page.url()
      const urlSegments = new URL(bookingPageUrl).pathname.split('/').filter(Boolean)
      const place = urlSegments[3] ?? ''       // e.g. "09"
      const timeHHMM = urlSegments[4] ?? targetHourMin  // e.g. "0900"

      const registeredSocios = [creds.socioNumber]
      for (const participant of participants) {
        const { socioNumber, name } = participant
        const playerPos = registeredSocios.length + 1  // host occupies pos 1
        const body = new URLSearchParams({
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
        for (const p of registeredSocios) body.append('participants[]', p)
        body.append('participants[]', socioNumber)

        logger.info(`[laieta] Registering participant via API: ${socioNumber} (pos=${playerPos}, place=${place}, time=${timeHHMM})`)
        const resp = await fetch(`${BASE_URL}/ajax/infopistas/participantes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': `${SESSION_COOKIE_NAME}=${sessionValue}`,
            'Referer': bookingPageUrl,
          },
          body: body.toString(),
        })
        if (!resp.ok) {
          throw new AppError(`Participant API returned HTTP ${resp.status}`, 502, 'BOOKING_PAGE_ERROR')
        }
        const json = await resp.json() as { error: boolean; message: string; newparticipant: string }
        logger.info(`[laieta] Participant ${socioNumber}: error=${json.error}, result="${json.newparticipant}", msg="${json.message}"`)
        if (json.error) {
          const reason = json.message || 'Could not be added to the booking'
          throw new AppError(`${name}: ${reason}`, 409, 'BOOKING_PAGE_ERROR')
        }
        registeredSocios.push(socioNumber)
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
    // externalBookingId format: "courtId::YYYY-MM-DD::HH" (possibly prefixed with "[TEST-MODE]::")
    const cleanId = externalBookingId.replace(/^\[TEST-MODE\]::/, '')
    const parts = cleanId.split('::')
    if (parts.length < 3) {
      throw new AppError(`Cannot parse externalBookingId for cancellation: ${externalBookingId}`, 400, 'INVALID_BOOKING_ID')
    }
    const [courtId, date, hour] = parts

    // Convert YYYY-MM-DD → DD-MM-YYYY (format shown on the reservas page)
    const [year, month, day] = date.split('-')
    const pageDate = `${day}-${month}-${year}`
    const pageHour = `${hour}:00`

    // Normalize court name for comparison (collapse multiple spaces)
    const normalizeCourt = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase()
    const targetCourt = normalizeCourt(courtId)

    let browser: Browser | null = null
    try {
      browser = await this.launchBrowser()
      const sessionValue = await this.login(browser, creds)
      const page = await this.openWithSession(browser, `${BASE_URL}/reservas`, sessionValue)

      // Scrape all booking fieldsets to find the matching one
      const cancelButtonName = await page.evaluate(
        (targetDate: string, targetHour: string, targetCourt: string) => {
          const normalizeCourt = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase()
          const fieldsets = document.querySelectorAll('fieldset.panel.panel-default')
          for (const fieldset of fieldsets) {
            // Read date, hour, court from the booking card
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

      // Override confirmDialog to auto-confirm, then click the cancel button
      const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.evaluate((btnName: string) => {
        ;(window as unknown as Record<string, unknown>)['confirmDialog'] = () => true
        const btn = document.querySelector(`button[name="${btnName}"]`) as HTMLButtonElement | null
        btn?.click()
      }, cancelButtonName)
      await navigationPromise

      await this.checkForPageError(page)
      logger.info(`[laieta] Booking cancelled: court=${courtId}, date=${date}, time=${pageHour}`)
    } finally {
      if (browser) await browser.close()
    }
  }
}
