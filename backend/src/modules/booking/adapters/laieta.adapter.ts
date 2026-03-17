// laieta.adapter.ts
// Booking adapter for Club Tennis Laieta via miclubonline.net (Drupal/Puppeteer).
// Availability scraping logic adapted from existing aceUp implementation.

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
      logger.info(`[laieta] Navigating to login page (socio: ${creds.socioNumber})`)
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

      logger.info(`[laieta] Login successful, session cookie obtained (socio: ${creds.socioNumber})`)
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
   * Optionally filters to a specific hour (2-char string, e.g. "09").
   */
  private async scrapeAvailableSlots(page: Page, targetHour?: string): Promise<ScrapedCourt[]> {
    await page.waitForSelector('#edit-gpa-piw-pistas', { timeout: 10000 })

    return page.evaluate((hour: string | undefined) => {
      const results: { courtName: string; hour: string }[] = []
      const fieldset = document.querySelector('#edit-gpa-piw-pistas')
      if (!fieldset) return results
      const table = fieldset.querySelector('table')
      if (!table) return results

      table.querySelectorAll('tr').forEach((row) => {
        row.querySelectorAll('td').forEach((cell) => {
          const emptySlots: string[] = []
          const occupiedSlots: string[] = []
          let cellHour = ''
          let courtName = ''

          cell.querySelectorAll('a.a_pistas_hora').forEach((el) => {
            const a = el as HTMLAnchorElement
            const parts = a.className.split(' ')
            const slotClass = parts[2]?.trim()
            const namePart = parts[3]?.trim().split('_')[1]
            if (namePart) {
              cellHour = namePart.slice(0, 2)
              courtName = a.id.split(':')[1] ?? ''
            }
            if (slotClass === 'classempty') emptySlots.push(a.className)
            if (slotClass === 'class4') occupiedSlots.push(a.className)
          })

          const isAvailable =
            (emptySlots.length === 2 && occupiedSlots.length === 2) ||
            (emptySlots.length === 1 && occupiedSlots.length === 3)

          if (isAvailable && (!hour || cellHour === hour)) {
            results.push({ courtName, hour: cellHour })
          }
        })
      })

      return results
    }, targetHour)
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

  /** Throws if the page contains a .alert.alert-block.alert-danger block. */
  private async checkForPageError(page: Page): Promise<void> {
    const errorText = await page.evaluate(() => {
      const el = document.querySelector('.alert.alert-block.alert-danger')
      if (!el) return null
      // Clone and remove invisible heading nodes (e.g. "Missatge d'error") before reading text
      const clone = el.cloneNode(true) as HTMLElement
      clone.querySelectorAll('.element-invisible, .close').forEach((n) => n.remove())
      return clone.textContent?.trim() ?? null
    })
    if (!errorText) return

    // Quota / already-booked error — court is taken, likely by a previous attempt
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
    const targetHour = time?.slice(0, 2)  // undefined → return all hours

    let browser: Browser | null = null
    try {
      browser = await this.launchBrowser()
      const sessionValue = await this.login(browser, creds)
      const url = `${BASE_URL}/infopistas/${sportId}/${this.toUrlDate(date)}`

      const hourLabel = targetHour ? `hour=${targetHour}` : 'all hours'
      logger.info(`[laieta] Checking availability: ${url} (sport=${sport}, ${hourLabel})`)
      const page = await this.openWithSession(browser, url, sessionValue)
      const courts = await this.scrapeAvailableSlots(page, targetHour)

      logger.info(`[laieta] Found ${courts.length} available courts at ${date} (${hourLabel})`)
      return {
        date,
        sport,
        availableCourts: courts.map((c) => ({
          courtId: c.courtName,
          courtName: c.courtName,
          time: `${c.hour}:00`,
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
    participantSocioNumbers: string[],
    options?: { sport?: string },
  ): Promise<BookingResult> {
    const sport = options?.sport ?? 'tennis'
    const sportId = SPORT_IDS[sport] ?? SPORT_IDS.tennis
    const targetHour = time.slice(0, 2)
    const allSocioNumbers = [creds.socioNumber, ...participantSocioNumbers]

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

      const slotClicked = await page.evaluate((targetCourtId: string, hour: string) => {
        const links = document.querySelectorAll('a.a_pistas_hora')
        for (const link of links) {
          const a = link as HTMLAnchorElement
          const parts = a.className.split(' ')
          const namePart = parts[3]?.trim().split('_')[1]
          const slotHour = namePart?.slice(0, 2)
          const courtName = a.id.split(':')[1]
          if (courtName === targetCourtId && slotHour === hour) {
            const container = a.closest('.div_pistas_hora') ?? a.parentElement
            const firstAnchor = container?.querySelector('a') as HTMLAnchorElement | null
            if (firstAnchor) {
              firstAnchor.click()
              return true
            }
          }
        }
        return false
      }, courtId, targetHour)

      if (!slotClicked) {
        throw new AppError(`Slot no longer available: court=${courtId} at ${targetHour}:00`, 409, 'SLOT_NOT_FOUND')
      }

      // ── Step 2: Popup → click "Continua" ───────────────────────────
      await page.waitForSelector('.a_button_popup_fix.a_pistas_hora_sel', { timeout: 10000 })
      const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.evaluate(() => {
        (document.querySelector('.a_button_popup_fix.a_pistas_hora_sel') as HTMLElement)?.click()
      })
      await navigationPromise
      await this.checkForPageError(page)

      // ── Step 3: Participant entry form ──────────────────────────────
      await page.waitForSelector('#edit-add', { timeout: 10000 })

      for (const socioNumber of participantSocioNumbers) {
        logger.info(`[laieta] Adding participant: ${socioNumber}`)
        await page.click('#edit-add', { clickCount: 3 })
        await page.type('#edit-add', socioNumber)
        await page.click('.btn-add-participant')
        await new Promise((r) => setTimeout(r, 2000))
        await this.checkForPageError(page)
      }

      // ── Step 4: Submit booking ──────────────────────────────────────
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('button#edit-submit[name="reserva"]') as HTMLButtonElement | null
          return btn !== null && !btn.disabled
        },
        { timeout: 15000 },
      )

      if (process.env.BOOKING_SUBMIT_ENABLED !== 'true') {
        const externalId = `[TEST-MODE]::${courtId}::${date}::${targetHour}`
        logger.info(`[laieta][TEST MODE] Submit skipped (BOOKING_SUBMIT_ENABLED != true)`)
        logger.info(`[laieta][TEST MODE] Would book: court=${courtId}, date=${date}, time=${targetHour}:00, sport=${sport}, participants=${participantSocioNumbers.join(', ')}`)
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
      const bodySnippet = await page.evaluate(() => document.body.innerText?.slice(0, 500)).catch(() => '?')
      const screenshotB64 = await page.screenshot({ encoding: 'base64', fullPage: true }).catch(() => null)
      logger.error(`[laieta] Booking not confirmed on /reservas. url=${pageUrl}, title="${pageTitle}"`)
      logger.error(`[laieta] Page text snippet: ${bodySnippet}`)
      if (screenshotB64) logger.error(`[laieta] Screenshot (base64): data:image/png;base64,${screenshotB64}`)
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
