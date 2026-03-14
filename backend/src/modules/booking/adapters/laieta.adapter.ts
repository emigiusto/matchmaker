// laieta.adapter.ts
// Booking adapter for Club Tennis La Salut (Laieta) via miclubonline.net (Drupal/Puppeteer).
// Availability scraping logic adapted from existing aceUp implementation.

import puppeteer, { type Browser, type Page } from 'puppeteer'
import type { BookingAdapter } from './base.adapter'
import type { ClubCredentials, BookingSlot, BookingResult } from '../booking.types'
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
      logger.info('[laieta] Navigating to login page')
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

      logger.info('[laieta] Login successful, session cookie obtained')
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

  async checkAvailability(
    creds: ClubCredentials,
    date: string,
    time: string,
    options?: { sport?: string },
  ): Promise<BookingSlot[]> {
    const sport = options?.sport ?? 'tennis'
    const sportId = SPORT_IDS[sport] ?? SPORT_IDS.tennis
    const targetHour = time.slice(0, 2)  // "09" from "09:00"

    let browser: Browser | null = null
    try {
      browser = await this.launchBrowser()
      const sessionValue = await this.login(browser, creds)
      const url = `${BASE_URL}/infopistas/${sportId}/${date}`

      logger.info(`[laieta] Checking availability: ${url} (sport=${sport}, hour=${targetHour})`)
      const page = await this.openWithSession(browser, url, sessionValue)
      const courts = await this.scrapeAvailableSlots(page, targetHour)

      logger.info(`[laieta] Found ${courts.length} available slots at ${date} ${targetHour}:00`)
      return courts.map((c) => ({
        courtId: c.courtName,
        courtName: c.courtName,
        date,
        time: `${c.hour}:00`,
        available: true,
      }))
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
      const url = `${BASE_URL}/infopistas/${sportId}/${date}`

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
      await page.waitForSelector('.a_button_popup_fix.a_pistas_hora_sel', { timeout: 10000 })
      await page.click('.a_button_popup_fix.a_pistas_hora_sel')

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

        // Check for an inline error (participant over booking quota or not found)
        const errorText = await page.evaluate(() => {
          const el = document.querySelector(
            '.messages--error, .alert-danger, .error-message, [class*="error"]:not(input):not(button)',
          )
          return el?.textContent?.trim() ?? null
        })
        if (errorText) {
          throw new AppError(
            `Could not add participant ${socioNumber}: ${errorText}`,
            409,
            'PARTICIPANT_BOOKING_LIMIT',
          )
        }
      }

      // ── Step 4: Submit booking ──────────────────────────────────────
      // The Reserva button starts disabled and becomes enabled once all required
      // participants (2 or 4 depending on sport/format) have been successfully added.
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('input#edit-submit[name="reserva"]') as HTMLInputElement | null
          return btn !== null && !btn.disabled
        },
        { timeout: 15000 },
      )

      // ── [TEST MODE] Screenshot before submit ────────────────────────
      const screenshotPath = `/tmp/laieta-booking-${Date.now()}.png`
      await page.screenshot({ path: screenshotPath, fullPage: true })
      logger.info(`[laieta][TEST MODE] Screenshot saved: ${screenshotPath}`)
      logger.info(`[laieta][TEST MODE] Submit button is enabled — would click input#edit-submit[name="reserva"]`)
      logger.info(`[laieta][TEST MODE] Booking params: court=${courtId}, date=${date}, time=${targetHour}:00, sport=${sport}, participants=${participantSocioNumbers.join(', ')}`)

      // await page.click('input#edit-submit[name="reserva"]')

      // // Wait for post-submit navigation or inline confirmation
      // await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {
      //   // Some flows show a confirmation inline without navigating — that's fine
      // })

      // // Try to extract a booking reference from the confirmation page
      // const bookingRef = await page.evaluate(() => {
      //   const text = document.body.textContent ?? ''
      //   const match = text.match(/reserva\s*[:#]?\s*([A-Z0-9\-]{4,})/i)
      //   return match?.[1] ?? null
      // })

      // const externalId = bookingRef ?? `${courtId}::${date}::${targetHour}`
      // logger.info(`[laieta] Booking confirmed: court=${courtId}, ref=${externalId}`)

      const externalId = `[TEST-MODE]::${courtId}::${date}::${targetHour}`
      logger.info(`[laieta][TEST MODE] Returning mock booking result: ${externalId}`)

      return { externalId, courtName: courtId }
    } finally {
      if (browser) await browser.close()
    }
  }

  async cancel(_creds: ClubCredentials, _externalBookingId: string): Promise<void> {
    // TODO: Implement once the "My reservations" page selectors are known.
    throw new AppError(
      'Court cancellation not yet implemented for LaietaAdapter',
      501,
      'NOT_IMPLEMENTED',
    )
  }
}
