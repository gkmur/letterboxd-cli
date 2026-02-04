/**
 * Film page interactions - log, rate, like, watchlist
 */

import { Page } from 'playwright';
import { navigateTo } from '../client.js';
import { ensureAuthenticated } from '../auth.js';
import { formatDate } from '../../utils.js';
import { debug } from '../../utils/logger.js';

export interface LogOptions {
  rating?: number;      // 0.5-5.0
  liked?: boolean;
  date?: Date;
  review?: string;
  rewatch?: boolean;
  spoilers?: boolean;
}

/**
 * Navigate to a film's page
 */
export async function goToFilm(page: Page, slug: string): Promise<void> {
  await navigateTo(page, `https://letterboxd.com/film/${slug}/`);
  debug('Waiting for film page to load...');
  await page.waitForSelector('.film-poster, .film-header, section#tabbed-content', { state: 'visible', timeout: 10000 });
}

/**
 * Log a film with optional rating, like, date, review
 */
export async function logFilm(page: Page, slug: string, options: LogOptions = {}): Promise<void> {
  await ensureAuthenticated(page);
  await goToFilm(page, slug);
  
  // Click the "Log or review" button to open the dialog
  const logButton = await page.$('a[data-track-action="AddThisFilm"], .add-this-film, [data-js-trigger="log"]');
  if (!logButton) {
    // Try the sidebar action
    const reviewLink = await page.$('a[href*="/log/"], .log-review-link');
    if (reviewLink) {
      await reviewLink.click();
    } else {
      throw new Error('Could not find log/review button');
    }
  } else {
    await logButton.click();
  }
  
  // Wait for dialog to appear
  debug('Waiting for log dialog to appear...');
  await page.waitForSelector('.modal-dialog, [data-js-component="ReviewForm"], form.review-form', { state: 'visible', timeout: 10000 });
  
  const dialog = await page.$('.modal-dialog, [data-js-component="ReviewForm"], form.review-form');
  if (!dialog) {
    throw new Error('Log dialog did not appear');
  }
  
  // Set date (default: today)
  const dateStr = formatDate(options.date || new Date());
  try {
    const dateInput = await page.$('input[name="viewingDate"], input.date-input, #specify-viewing-date-value');
    if (dateInput) {
      await dateInput.fill(dateStr);
    }
  } catch {
    // Date might be handled differently
  }
  
  // Set rating if provided
  if (options.rating !== undefined) {
    await setRatingInDialog(page, options.rating);
  }
  
  // Set liked if true
  if (options.liked) {
    try {
      const likeButton = await page.$('.like-link-target, .like-button, [data-action="like"]');
      if (likeButton) {
        const isLiked = await likeButton.getAttribute('class');
        if (!isLiked?.includes('liked')) {
          await likeButton.click();
        }
      }
    } catch {
      // Liked might be handled differently
    }
  }
  
  // Set rewatch if true
  if (options.rewatch) {
    try {
      const rewatchCheckbox = await page.$('input[name="rewatch"], #film-rewatch');
      if (rewatchCheckbox) {
        await rewatchCheckbox.check();
      }
    } catch {
      // Rewatch might not be available
    }
  }
  
  // Add review if provided
  if (options.review) {
    try {
      const reviewTextarea = await page.$('textarea[name="review"], .review-textarea, #review-text');
      if (reviewTextarea) {
        await reviewTextarea.fill(options.review);
      }
      
      // Mark as spoiler if needed
      if (options.spoilers) {
        const spoilerCheckbox = await page.$('input[name="containsSpoilers"], #contains-spoilers');
        if (spoilerCheckbox) {
          await spoilerCheckbox.check();
        }
      }
    } catch {
      // Review might not be available
    }
  }
  
  // Click save/submit
  const saveButton = await page.$('input[type="submit"][value="Save"], button[type="submit"], .save-review');
  if (saveButton) {
    await saveButton.click();
    debug('Waiting for save to complete...');
    // Wait for modal to close or success indicator
    await page.waitForSelector('.modal-dialog', { state: 'hidden', timeout: 15000 }).catch(() => {
      // Modal might not close cleanly, wait for network idle instead
      return page.waitForLoadState('networkidle', { timeout: 10000 });
    });
  } else {
    throw new Error('Could not find save button');
  }
}

/**
 * Set rating in the log dialog using the star rating widget
 */
async function setRatingInDialog(page: Page, rating: number): Promise<void> {
  // Convert rating to star position (0.5-5.0 → 1-10 half-stars)
  const halfStars = Math.round(rating * 2);
  
  try {
    // Try clicking the appropriate star position
    // Letterboxd uses a slider or clickable stars
    const ratingInput = await page.$(`input[name="rating"][value="${rating}"], input[value="${halfStars}"]`);
    if (ratingInput) {
      await ratingInput.click();
      return;
    }
    
    // Try the star rating widget
    const stars = await page.$$('.rating-stars .star, .rating .star');
    if (stars.length > 0) {
      const starIndex = Math.ceil(rating) - 1;
      if (stars[starIndex]) {
        await stars[starIndex].click();
      }
    }
  } catch {
    // Rating might be set differently
  }
}

/**
 * Quick rate a film (without full log entry)
 */
export async function rateFilm(page: Page, slug: string, rating: number): Promise<void> {
  await ensureAuthenticated(page);
  await goToFilm(page, slug);
  
  // Find the rating widget in the sidebar
  const halfStars = Math.round(rating * 2);
  
  try {
    // Try to find and click the rating stars in the sidebar
    const ratingLink = await page.$('.rating-link, [data-track-action="RateFilm"]');
    if (ratingLink) {
      await ratingLink.click();
      debug('Waiting for rating widget...');
      // Wait for rating widget to become interactive
      await page.waitForSelector('.rating .star, .rating-slider, [data-rating]', { state: 'visible', timeout: 5000 }).catch(() => {});
    }
    
    // Click the appropriate star
    const starSelector = `.rating .rated-${halfStars}, .star-${Math.ceil(rating)}, [data-rating="${rating}"]`;
    const star = await page.$(starSelector);
    if (star) {
      await star.click();
    } else {
      // Fallback: use evaluate to set rating
      await page.evaluate((r) => {
        const ratingEl = document.querySelector('.rating-slider, .rating') as HTMLElement;
        if (ratingEl) {
          ratingEl.dispatchEvent(new CustomEvent('rating:set', { detail: { rating: r } }));
        }
      }, rating);
    }
    
    debug('Waiting for rating to save...');
    // Short delay for rating to register (this is debounce-like behavior)
    await page.waitForTimeout(300);
  } catch (e) {
    throw new Error(`Failed to rate film: ${e}`);
  }
}

/**
 * Toggle watchlist status for a film
 */
export async function toggleWatchlist(page: Page, slug: string, add: boolean): Promise<void> {
  await ensureAuthenticated(page);
  await goToFilm(page, slug);
  
  // Find the watchlist button (eye icon)
  const watchlistButton = await page.$('.film-watch-link-target, [data-track-action="AddToWatchlist"], .add-to-watchlist');
  if (!watchlistButton) {
    throw new Error('Could not find watchlist button');
  }
  
  // Check current state
  const classes = await watchlistButton.getAttribute('class') || '';
  const isOnWatchlist = classes.includes('watchlisted') || classes.includes('-watched');
  
  // Only click if we need to change state
  if ((add && !isOnWatchlist) || (!add && isOnWatchlist)) {
    await watchlistButton.click();
    debug('Waiting for watchlist toggle to complete...');
    // Wait for class to change indicating state update
    await page.waitForFunction(
      ([sel, shouldHave]) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const hasClass = el.className.includes('watchlisted') || el.className.includes('-watched');
        return shouldHave ? hasClass : !hasClass;
      },
      ['.film-watch-link-target, [data-track-action="AddToWatchlist"], .add-to-watchlist', add] as const,
      { timeout: 5000 }
    ).catch(() => {});
  }
}

/**
 * Like a film
 */
export async function likeFilm(page: Page, slug: string): Promise<void> {
  await ensureAuthenticated(page);
  await goToFilm(page, slug);
  
  const likeButton = await page.$('.film-like-link-target, [data-track-action="LikeFilm"], .like-button');
  if (!likeButton) {
    throw new Error('Could not find like button');
  }
  
  const classes = await likeButton.getAttribute('class') || '';
  const isLiked = classes.includes('liked');
  
  if (!isLiked) {
    await likeButton.click();
    debug('Waiting for like to register...');
    // Wait for liked class to appear
    await page.waitForSelector('.film-like-link-target.liked, [data-track-action="LikeFilm"].liked, .like-button.liked', { state: 'attached', timeout: 5000 }).catch(() => {});
  }
}
