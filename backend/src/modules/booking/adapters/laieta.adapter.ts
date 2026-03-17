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
    if (errorText) {
      throw new AppError(errorText, 409, 'BOOKING_PAGE_ERROR')
    }
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

    let browser: Browser | null = null
    try {
      browser = await this.launchBrowser()
      const sessionValue = await this.login(browser, creds)
      const url = `${BASE_URL}/infopistas/${sportId}/${this.toUrlDate(date)}`

      logger.info(`[laieta] Starting booking: court=${courtId}, ${date} ${targetHour}:00, sport=${sport}`)
      const page = await this.openWithSession(browser, url, sessionValue)

      // ── Step 1: Find and click the target slot ──────────────────────
      await page.waitForSelector('#edit-gpa-piw-pistas', { timeout: 10000 })

      const slotClicked = await page.evaluate((targetCourtId: string, hour: string) => {
        // Find the a.a_pistas_hora whose court + hour match what we want
        const links = document.querySelectorAll('a.a_pistas_hora')
        for (const link of links) {
          const a = link as HTMLAnchorElement
          const parts = a.className.split(' ')
          const namePart = parts[3]?.trim().split('_')[1]
          const slotHour = namePart?.slice(0, 2)
          const courtName = a.id.split(':')[1]
          if (courtName === targetCourtId && slotHour === hour) {
            // The booking is initiated by clicking the first <a> in the parent div.div_pistas_hora
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
      // The popup button id encodes the slot, e.g. "21:PADEL   A:16:0"
      // We match by class since only one popup opens at a time.
      // Use evaluate-based click to bypass Puppeteer's interactability check
      // (the popup overlay can cause page.click() to throw "not clickable").
      await page.waitForSelector('.a_button_popup_fix.a_pistas_hora_sel', { timeout: 10000 })
      // Clicking "Continua" triggers a full page navigation — start listening before the click
      const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.evaluate(() => {
        (document.querySelector('.a_button_popup_fix.a_pistas_hora_sel') as HTMLElement)?.click()
      })
      await navigationPromise

      // Check for page-level errors (e.g. booking quota exceeded)
      await this.checkForPageError(page)

      // ── Step 3: Participant entry form ──────────────────────────────
      await page.waitForSelector('#edit-add', { timeout: 10000 })

      for (const socioNumber of participantSocioNumbers) {
        logger.info(`[laieta] Adding participant: ${socioNumber}`)

        // Clear the input and type the socio number
        await page.click('#edit-add', { clickCount: 3 })
        await page.type('#edit-add', socioNumber)
        await page.click('.btn-add-participant')

        // Wait for the form to process (participant added or error shown)
        await new Promise((r) => setTimeout(r, 2000))

        // Check for page-level errors (quota exceeded, participant not found, etc.)
        await this.checkForPageError(page)
      }

      // ── Step 4: Submit booking ──────────────────────────────────────
      // The Reserva button starts disabled and becomes enabled once all required
      // participants (2 or 4 depending on sport/format) have been successfully added.
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('button#edit-submit[name="reserva"]') as HTMLButtonElement | null
          return btn !== null && !btn.disabled
        },
        { timeout: 15000 },
      )

      if (process.env.BOOKING_SUBMIT_ENABLED !== 'true') {
        const screenshotPath = `/tmp/laieta-booking-${Date.now()}.png`
        await page.screenshot({ path: screenshotPath, fullPage: true })
        const externalId = `[TEST-MODE]::${courtId}::${date}::${targetHour}`
        logger.info(`[laieta][TEST MODE] Submit skipped (BOOKING_SUBMIT_ENABLED != true). Screenshot: ${screenshotPath}`)
        logger.info(`[laieta][TEST MODE] Would book: court=${courtId}, date=${date}, time=${targetHour}:00, sport=${sport}, participants=${participantSocioNumbers.join(', ')}`)
        return { externalId, courtName: courtId }
      }

      await page.evaluate(() => {
        (document.querySelector('button#edit-submit[name="reserva"]') as HTMLButtonElement)?.click()
      })

      // Wait for the success alert specifically (can take 2-3s — inline, no navigation).
      // Also race against a navigation in case the portal redirects instead.
      // Wait for the page to fully settle after submit.
      // Using networkidle0 on the navigation branch so that redirect chains complete
      // before we evaluate the page — avoids "execution context was destroyed" errors.
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 }).then(() => logger.info('[laieta] Post-submit: navigation settled (networkidle0)')),
        page.waitForSelector('.alert.alert-block.alert-success', { timeout: 20000 }).then(() => logger.info('[laieta] Post-submit: success alert detected')),
      ]).catch(() => {
        logger.warn('[laieta] Post-submit: neither navigation nor success alert fired within timeout')
      })

      // Check for errors on confirmation page
      await this.checkForPageError(page)

      // Confirm that the success alert is present — if it's missing, something went wrong
      const { hasSuccess, bookingRef, confirmationMsg } = await page.evaluate(() => {
        const successEl = document.querySelector('.alert.alert-block.alert-success')
        let confirmationMsg: string | null = null
        if (successEl) {
          const clone = successEl.cloneNode(true) as HTMLElement
          clone.querySelectorAll('.element-invisible, .close').forEach((n) => n.remove())
          confirmationMsg = clone.textContent?.trim() ?? null
        }

        const bodyText = document.body.textContent ?? ''
        // Require at least one digit so plain words like "confirmada" are not captured
        const match = bodyText.match(/reserva\s*[:#]?\s*([A-Z0-9\-]*\d[A-Z0-9\-]*)/i)
        return { hasSuccess: !!successEl, bookingRef: match?.[1] ?? null, confirmationMsg }
      })

      if (!hasSuccess) {
        const pageTitle = await page.title().catch(() => '?')
        const pageUrl = page.url()
        const bodySnippet = await page.evaluate(() => document.body.innerText?.slice(0, 500)).catch(() => '?')
        const screenshotB64 = await page.screenshot({ encoding: 'base64', fullPage: true }).catch(() => null)
        logger.error(`[laieta] No success confirmation. url=${pageUrl}, title="${pageTitle}"`)
        logger.error(`[laieta] Page text snippet: ${bodySnippet}`)
        if (screenshotB64) {
          logger.error(`[laieta] Screenshot (base64): data:image/png;base64,${screenshotB64}`)
        }
        throw new AppError('Booking submit did not produce a success confirmation', 502, 'BOOKING_NO_CONFIRMATION')
      }

      logger.info(`[laieta] Confirmation: ${confirmationMsg ?? '(no text)'}`)

      const externalId = bookingRef ?? `${courtId}::${date}::${targetHour}`
      logger.info(`[laieta] Booking confirmed: court=${courtId}, ref=${externalId}`)

      return { externalId, courtName: courtId }
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
