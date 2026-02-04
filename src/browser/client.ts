/**
 * Playwright browser management
 * Uses persistent context with cookies saved to ~/.letterboxd-cli/cookies/
 */

import { chromium, BrowserContext, Page } from 'playwright';
import { getCookiesDir } from '../config.js';
import { debug } from '../utils/logger.js';

let context: BrowserContext | null = null;
let debugMode = false;

/**
 * Set debug mode (headed browser, verbose logging)
 */
export function setDebugMode(enabled: boolean): void {
  debugMode = enabled;
  debug('Debug mode enabled - browser will be visible');
}

/**
 * Get or create a browser context with persistent cookies
 */
export async function getBrowserContext(): Promise<BrowserContext> {
  if (context) return context;
  
  const cookiesDir = getCookiesDir();
  debug('Using cookies dir:', cookiesDir);
  debug('Headless mode:', !debugMode);
  
  context = await chromium.launchPersistentContext(cookiesDir, {
    headless: !debugMode,
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  return context;
}

/**
 * Get a new page from the browser context
 */
export async function getPage(): Promise<Page> {
  const ctx = await getBrowserContext();
  const page = await ctx.newPage();
  return page;
}

/**
 * Close the browser context
 */
export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
  }
}

/**
 * Navigate to a URL and wait for load
 */
export async function navigateTo(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}
