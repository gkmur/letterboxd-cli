/**
 * Profile page interactions - diary, stats, watchlist
 */

import { Page } from 'playwright';
import { navigateTo } from '../client.js';
import { ensureAuthenticated } from '../auth.js';
import { debug } from '../../utils/logger.js';

export interface DiaryEntry {
  title: string;
  slug: string;
  date: string;
  rating?: number;
  liked?: boolean;
  rewatch?: boolean;
}

export interface WatchlistItem {
  title: string;
  slug: string;
  year?: string;
}

export interface Stats {
  filmsThisYear: number;
  totalFilms: number;
  hoursWatched?: number;
  listsCreated?: number;
  following?: number;
  followers?: number;
}

/**
 * Get diary entries for a user
 */
export async function getDiary(page: Page, username: string, month?: string): Promise<DiaryEntry[]> {
  let url = `https://letterboxd.com/${username}/films/diary/`;
  if (month) {
    // Month format: YYYY-MM → /for/YYYY/MM/
    const [year, mon] = month.split('-');
    url = `https://letterboxd.com/${username}/films/diary/for/${year}/${mon}/`;
  }
  
  await navigateTo(page, url);
  
  debug('Waiting for diary entries to load...');
  // Use locator with or() for robustness
  const diaryContent = page.locator('tr.diary-entry-row')
    .or(page.locator('.diary-entry'))
    .or(page.getByText(/no entries/i));
  await diaryContent.first().waitFor({ state: 'visible', timeout: 10000 });
  
  const entries: DiaryEntry[] = [];
  
  // Use locator for better iteration
  const rows = page.locator('tr.diary-entry-row, .diary-entry');
  const rowCount = await rows.count();
  
  for (let i = 0; i < Math.min(rowCount, 20); i++) { // Limit to 20 entries
    try {
      const row = rows.nth(i);
      
      // Get film link - prefer role-based within row, fall back to CSS
      const filmLinks = row.getByRole('link').filter({ has: page.locator('img, .film-title') });
      const filmLinkFallback = row.locator('a.film-poster, td.td-film-details a, .headline-3 a');
      
      let href: string | null = null;
      if (await filmLinks.count() > 0) {
        href = await filmLinks.first().getAttribute('href');
      } else if (await filmLinkFallback.count() > 0) {
        href = await filmLinkFallback.first().getAttribute('href');
      }
      
      const slug = href?.match(/\/film\/([^/]+)/)?.[1];
      if (!slug) {
        debug(`Skipping diary row ${i}: no valid slug`);
        continue;
      }
      
      // Get title - prefer heading role, fall back to CSS
      let title: string | null = null;
      const headingLink = row.getByRole('heading').getByRole('link');
      const titleFallback = row.locator('.headline-3 a, .film-title');
      
      if (await headingLink.count() > 0) {
        title = await headingLink.textContent();
      } else if (await titleFallback.count() > 0) {
        title = await titleFallback.first().textContent();
      }
      
      // Get date - prefer time element with datetime attribute
      const dateEl = row.locator('time[datetime]').or(row.locator('td.td-calendar time, .date'));
      let date = '';
      if (await dateEl.count() > 0) {
        const dateAttr = await dateEl.first().getAttribute('datetime');
        date = dateAttr || '';
      }
      
      // Get rating - check for aria-label first, then class
      let rating: number | undefined;
      const ratingByAria = row.locator('[aria-label*="star" i]');
      const ratingByClass = row.locator('.rating, .rated');
      
      if (await ratingByAria.count() > 0) {
        const ariaLabel = await ratingByAria.first().getAttribute('aria-label');
        const match = ariaLabel?.match(/([\d.]+)\s*star/i);
        if (match) {
          rating = parseFloat(match[1]);
        }
      } else if (await ratingByClass.count() > 0) {
        const ratingClass = await ratingByClass.first().getAttribute('class');
        const match = ratingClass?.match(/rated-(\d+)/);
        if (match) {
          rating = parseInt(match[1]) / 2;
        }
      }
      
      // Check if liked - prefer aria-label or icon class
      const likeEl = row.locator('[aria-label*="liked" i], .icon-liked, .liked');
      const liked = await likeEl.count() > 0;
      
      // Check if rewatch - prefer aria-label or icon class
      const rewatchEl = row.locator('[aria-label*="rewatch" i], .icon-rewatch, .rewatch');
      const rewatch = await rewatchEl.count() > 0;
      
      entries.push({
        title: title?.trim() || slug,
        slug,
        date,
        rating,
        liked,
        rewatch,
      });
    } catch (e) {
      debug(`Error parsing diary entry ${i}: ${e}`);
      // Skip malformed entries
    }
  }
  
  return entries;
}

/**
 * Get watchlist items for a user
 */
export async function getWatchlist(page: Page, username: string): Promise<WatchlistItem[]> {
  await ensureAuthenticated(page);
  await navigateTo(page, `https://letterboxd.com/${username}/watchlist/`);
  
  debug('Waiting for watchlist to load...');
  // Use locator with or() for robustness
  const watchlistContent = page.locator('li.poster-container')
    .or(page.locator('.film-poster'))
    .or(page.getByText(/empty|no films/i));
  await watchlistContent.first().waitFor({ state: 'visible', timeout: 10000 });
  
  const items: WatchlistItem[] = [];
  
  // Use locator for better iteration - prefer list items
  const posters = page.locator('li.poster-container, .film-poster');
  const posterCount = await posters.count();
  
  for (let i = 0; i < Math.min(posterCount, 50); i++) { // Limit to 50 items
    try {
      const poster = posters.nth(i);
      
      // Get link - prefer role-based, fall back to CSS
      const link = poster.getByRole('link').first().or(poster.locator('a'));
      
      if (await link.count() === 0) continue;
      
      const href = await link.first().getAttribute('href');
      const slug = href?.match(/\/film\/([^/]+)/)?.[1];
      if (!slug) {
        debug(`Skipping watchlist item ${i}: no valid slug`);
        continue;
      }
      
      // Get title from img alt text (most reliable) or data attribute
      let title: string | null = null;
      const img = poster.locator('img');
      if (await img.count() > 0) {
        title = await img.first().getAttribute('alt');
      }
      
      // Try data-film-name or similar data attributes as fallback
      if (!title) {
        const dataName = await poster.getAttribute('data-film-name');
        title = dataName || slug;
      }
      
      items.push({
        title: title?.trim() || slug,
        slug,
      });
    } catch (e) {
      debug(`Error parsing watchlist item ${i}: ${e}`);
      // Skip malformed items
    }
  }
  
  return items;
}

/**
 * Get basic stats for a user
 */
export async function getStats(page: Page, username: string): Promise<Stats> {
  await navigateTo(page, `https://letterboxd.com/${username}/`);
  
  debug('Waiting for profile page to load...');
  // Use locator with or() for robustness
  const profileContent = page.locator('.profile-stats')
    .or(page.locator('.profile-statistic'))
    .or(page.locator('.body-content'));
  await profileContent.first().waitFor({ state: 'visible', timeout: 10000 });
  
  let filmsThisYear = 0;
  let totalFilms = 0;
  let following: number | undefined;
  let followers: number | undefined;
  
  try {
    // Get profile stats - use locators for better reliability
    const statsEls = page.locator('.profile-stats .value, .stat .value');
    const statsCount = await statsEls.count();
    
    for (let i = 0; i < statsCount; i++) {
      const el = statsEls.nth(i);
      const text = await el.textContent();
      const label = await el.evaluate(e => e.parentElement?.textContent?.toLowerCase() || '');
      
      const num = parseInt(text?.replace(/,/g, '') || '0');
      
      if (label.includes('films') && label.includes('this year')) {
        filmsThisYear = num;
        debug(`Found films this year: ${filmsThisYear}`);
      } else if (label.includes('films') && !label.includes('this year')) {
        totalFilms = num;
        debug(`Found total films: ${totalFilms}`);
      } else if (label.includes('following')) {
        following = num;
        debug(`Found following: ${following}`);
      } else if (label.includes('follower')) {
        followers = num;
        debug(`Found followers: ${followers}`);
      }
    }
    
    // Alternative: look for specific elements using links with href patterns
    const filmsLink = page.locator('a[href*="/films/"]').filter({ hasNot: page.locator('a[href*="/diary/"]') });
    const filmsEl = filmsLink.locator('.value').or(page.locator('.profile-stats .films .value'));
    if (await filmsEl.count() > 0 && totalFilms === 0) {
      const text = await filmsEl.first().textContent();
      totalFilms = parseInt(text?.replace(/,/g, '') || '0');
      debug(`Found total films (fallback): ${totalFilms}`);
    }
    
    const thisYearLink = page.locator('a[href*="/films/diary/"]');
    const thisYearEl = thisYearLink.locator('.value').or(page.locator('.films-this-year .value'));
    if (await thisYearEl.count() > 0 && filmsThisYear === 0) {
      const text = await thisYearEl.first().textContent();
      filmsThisYear = parseInt(text?.replace(/,/g, '') || '0');
      debug(`Found films this year (fallback): ${filmsThisYear}`);
    }
  } catch (e) {
    debug(`Error parsing stats: ${e}`);
  }
  
  return {
    filmsThisYear,
    totalFilms,
    following,
    followers,
  };
}
