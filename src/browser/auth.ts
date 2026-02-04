/**
 * Authentication flow for Letterboxd
 */

import { Page } from 'playwright';
import { getPage, navigateTo, closeBrowser } from './client.js';
import { getCredentials } from '../config.js';
import { debug } from '../utils/logger.js';

/**
 * Check if the current session is authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    // Look for sign-in link (means NOT authenticated)
    const signInLink = await page.$('a[href="/sign-in/"]');
    return signInLink === null;
  } catch {
    return false;
  }
}

/**
 * Scrape the actual username from the page after login
 */
async function scrapeUsername(page: Page): Promise<string | undefined> {
  try {
    // Try multiple selectors for the profile link
    const selectors = [
      'a.nav-link[href^="/"][href$="/"]',
      'nav a[href^="/"][href$="/"][class*="profile"]',
      '.nav-account a[href^="/"]',
      'a[href^="/"][data-person]',
    ];
    
    for (const selector of selectors) {
      const profileLink = await page.$(selector);
      if (profileLink) {
        const href = await profileLink.getAttribute('href');
        if (href) {
          // Extract username from href like "/username/"
          const match = href.match(/^\/([a-zA-Z0-9_]+)\/$/);
          if (match && match[1]) {
            debug(`Scraped username: ${match[1]}`);
            return match[1];
          }
        }
      }
    }
    
    // Fallback: look for profile link in the navigation
    const allNavLinks = await page.$$('nav a[href^="/"]');
    for (const link of allNavLinks) {
      const href = await link.getAttribute('href');
      if (href) {
        // Skip common non-profile links
        const skipPaths = ['/films/', '/lists/', '/members/', '/journal/', '/sign-out/', '/settings/', '/search/', '/about/', '/pro/', '/patron/'];
        if (skipPaths.some(path => href.includes(path))) {
          continue;
        }
        const match = href.match(/^\/([a-zA-Z0-9_]+)\/$/);
        if (match && match[1]) {
          debug(`Scraped username from nav: ${match[1]}`);
          return match[1];
        }
      }
    }
    
    debug('Could not scrape username from page');
    return undefined;
  } catch (error) {
    debug(`Error scraping username: ${error}`);
    return undefined;
  }
}

/**
 * Perform login with stored credentials
 * Returns success status and scraped username
 */
export async function login(page: Page): Promise<{ success: boolean; username?: string }> {
  const { username, password } = await getCredentials();
  
  await navigateTo(page, 'https://letterboxd.com/sign-in/');
  debug('Waiting for sign-in form to load...');
  await page.waitForSelector('input[name="username"]', { state: 'visible', timeout: 10000 });
  
  // Fill username
  await page.fill('input[name="username"]', username);
  
  // Fill password
  await page.fill('input[name="password"]', password);
  
  // Check "Remember me" if present
  try {
    await page.check('input[name="remember"]');
  } catch {
    // Checkbox might not exist
  }
  
  // Click sign in button
  await page.click('input[type="submit"][value="Sign in"], button[type="submit"]');
  
  // Wait for navigation to complete after login
  debug('Waiting for login to complete...');
  await page.waitForURL((url) => !url.toString().includes('/sign-in/'), { timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
  
  // Verify login succeeded
  const success = await isAuthenticated(page);
  
  if (success) {
    // Scrape the actual username from the profile link
    const scrapedUsername = await scrapeUsername(page);
    return { success: true, username: scrapedUsername };
  }
  
  return { success: false };
}

/**
 * Ensure we're authenticated, logging in if necessary
 */
export async function ensureAuthenticated(page: Page): Promise<void> {
  // Navigate to home to check auth status
  await navigateTo(page, 'https://letterboxd.com/');
  debug('Waiting for page to load to check auth status...');
  await page.waitForLoadState('domcontentloaded');
  
  if (await isAuthenticated(page)) {
    return;
  }
  
  const result = await login(page);
  if (!result.success) {
    throw new Error('Login failed. Check your credentials with: letterboxd auth');
  }
}

/**
 * Check auth status and return current username if logged in
 */
export async function checkAuthStatus(): Promise<{ authenticated: boolean; username?: string }> {
  const page = await getPage();
  
  try {
    await navigateTo(page, 'https://letterboxd.com/');
    debug('Waiting for page to load...');
    await page.waitForLoadState('domcontentloaded');
    
    const authenticated = await isAuthenticated(page);
    
    if (authenticated) {
      const username = await scrapeUsername(page);
      return { authenticated: true, username };
    }
    
    return { authenticated: false };
  } finally {
    await page.close();
  }
}
