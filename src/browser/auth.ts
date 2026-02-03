/**
 * Authentication flow for Letterboxd
 */

import { Page } from 'playwright';
import { getPage, navigateTo, closeBrowser } from './client.js';
import { getCredentials } from '../config.js';
import { sleep } from '../utils.js';

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
 * Perform login with stored credentials
 */
export async function login(page: Page): Promise<boolean> {
  const { username, password } = getCredentials();
  
  await navigateTo(page, 'https://letterboxd.com/sign-in/');
  await sleep(1000);
  
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
  
  // Wait for navigation
  await sleep(2000);
  
  // Verify login succeeded
  return await isAuthenticated(page);
}

/**
 * Ensure we're authenticated, logging in if necessary
 */
export async function ensureAuthenticated(page: Page): Promise<void> {
  // Navigate to home to check auth status
  await navigateTo(page, 'https://letterboxd.com/');
  await sleep(500);
  
  if (await isAuthenticated(page)) {
    return;
  }
  
  const success = await login(page);
  if (!success) {
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
    await sleep(500);
    
    const authenticated = await isAuthenticated(page);
    
    if (authenticated) {
      // Try to get username from profile link
      const profileLink = await page.$('a.nav-link[href^="/"][href$="/"]');
      if (profileLink) {
        const href = await profileLink.getAttribute('href');
        const username = href?.replace(/\//g, '');
        return { authenticated: true, username };
      }
      return { authenticated: true };
    }
    
    return { authenticated: false };
  } finally {
    await page.close();
  }
}
