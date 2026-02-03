/**
 * Profile page interactions - diary, stats, watchlist
 */

import { Page } from 'playwright';
import { navigateTo } from '../client.js';
import { ensureAuthenticated } from '../auth.js';
import { sleep } from '../../utils.js';

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
  await sleep(1000);
  
  const entries: DiaryEntry[] = [];
  
  const rows = await page.$$('tr.diary-entry-row, .diary-entry');
  
  for (const row of rows.slice(0, 20)) { // Limit to 20 entries
    try {
      // Get film link
      const filmLink = await row.$('a.film-poster, td.td-film-details a, .headline-3 a');
      if (!filmLink) continue;
      
      const href = await filmLink.getAttribute('href');
      const slug = href?.match(/\/film\/([^/]+)/)?.[1];
      if (!slug) continue;
      
      // Get title
      const titleEl = await row.$('.headline-3 a, .film-title');
      const title = titleEl ? await titleEl.textContent() : slug;
      
      // Get date
      const dateEl = await row.$('td.td-calendar time, .date, time');
      const dateAttr = dateEl ? await dateEl.getAttribute('datetime') : null;
      const date = dateAttr || '';
      
      // Get rating
      let rating: number | undefined;
      const ratingEl = await row.$('.rating, .rated');
      if (ratingEl) {
        const ratingClass = await ratingEl.getAttribute('class');
        const match = ratingClass?.match(/rated-(\d+)/);
        if (match) {
          rating = parseInt(match[1]) / 2;
        }
      }
      
      // Check if liked
      const likeEl = await row.$('.icon-liked, .liked');
      const liked = likeEl !== null;
      
      // Check if rewatch
      const rewatchEl = await row.$('.icon-rewatch, .rewatch');
      const rewatch = rewatchEl !== null;
      
      entries.push({
        title: title?.trim() || slug,
        slug,
        date,
        rating,
        liked,
        rewatch,
      });
    } catch {
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
  await sleep(1000);
  
  const items: WatchlistItem[] = [];
  
  const posters = await page.$$('li.poster-container, .film-poster');
  
  for (const poster of posters.slice(0, 50)) { // Limit to 50 items
    try {
      const link = await poster.$('a, .film-poster');
      if (!link) continue;
      
      const href = await link.getAttribute('href');
      const slug = href?.match(/\/film\/([^/]+)/)?.[1];
      if (!slug) continue;
      
      // Get title from data attribute or alt text
      const img = await poster.$('img');
      const title = img ? await img.getAttribute('alt') : slug;
      
      // Try to get year
      const frameTitle = await link.getAttribute('data-film-slug');
      
      items.push({
        title: title?.trim() || slug,
        slug,
      });
    } catch {
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
  await sleep(1000);
  
  let filmsThisYear = 0;
  let totalFilms = 0;
  let following: number | undefined;
  let followers: number | undefined;
  
  try {
    // Get profile stats
    const statsEls = await page.$$('.profile-stats .value, .stat .value');
    for (const el of statsEls) {
      const text = await el.textContent();
      const label = await el.evaluate(e => e.parentElement?.textContent?.toLowerCase() || '');
      
      const num = parseInt(text?.replace(/,/g, '') || '0');
      
      if (label.includes('films') && label.includes('this year')) {
        filmsThisYear = num;
      } else if (label.includes('films') && !label.includes('this year')) {
        totalFilms = num;
      } else if (label.includes('following')) {
        following = num;
      } else if (label.includes('follower')) {
        followers = num;
      }
    }
    
    // Alternative: look for specific elements
    const filmsEl = await page.$('.profile-statistic [href*="/films/"] .value, .profile-stats .films .value');
    if (filmsEl) {
      const text = await filmsEl.textContent();
      totalFilms = parseInt(text?.replace(/,/g, '') || '0');
    }
    
    const thisYearEl = await page.$('.profile-statistic [href*="/films/diary/"] .value, .films-this-year .value');
    if (thisYearEl) {
      const text = await thisYearEl.textContent();
      filmsThisYear = parseInt(text?.replace(/,/g, '') || '0');
    }
  } catch {
    // Stats might not be available
  }
  
  return {
    filmsThisYear,
    totalFilms,
    following,
    followers,
  };
}
