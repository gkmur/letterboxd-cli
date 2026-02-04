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
  // Use multiple locators with or() for robustness
  const filmPageIndicator = page.locator('.film-poster').or(page.locator('.film-header')).or(page.locator('section#tabbed-content'));
  await filmPageIndicator.first().waitFor({ state: 'visible', timeout: 10000 });
}

/**
 * Log a film with optional rating, like, date, review
 */
export async function logFilm(page: Page, slug: string, options: LogOptions = {}): Promise<void> {
  await ensureAuthenticated(page);
  await goToFilm(page, slug);
  
  // Click the "Log or review" button to open the dialog
  // Prefer getByRole for buttons/links, fall back to data attributes and CSS
  const logButton = page.getByRole('link', { name: /log|review|add this film/i })
    .or(page.locator('a[data-track-action="AddThisFilm"]'))
    .or(page.locator('.add-this-film'))
    .or(page.locator('[data-js-trigger="log"]'));
  
  if (await logButton.count() > 0) {
    await logButton.first().click();
    debug('Clicked log/review button');
  } else {
    // Try the sidebar action as fallback
    const reviewLink = page.getByRole('link', { name: /log|review/i })
      .or(page.locator('a[href*="/log/"]'))
      .or(page.locator('.log-review-link'));
    if (await reviewLink.count() > 0) {
      await reviewLink.first().click();
      debug('Clicked review link (fallback)');
    } else {
      throw new Error('Could not find log/review button');
    }
  }
  
  // Wait for dialog to appear - prefer role="dialog", fall back to CSS
  debug('Waiting for log dialog to appear...');
  const dialog = page.getByRole('dialog')
    .or(page.locator('.modal-dialog'))
    .or(page.locator('[data-js-component="ReviewForm"]'))
    .or(page.locator('form.review-form'));
  await dialog.first().waitFor({ state: 'visible', timeout: 10000 });
  
  if (await dialog.count() === 0) {
    throw new Error('Log dialog did not appear');
  }
  
  // Set date (default: today)
  const dateStr = formatDate(options.date || new Date());
  try {
    // Prefer getByLabel for form fields
    const dateInput = page.getByLabel(/date|when did you watch/i)
      .or(page.locator('input[name="viewingDate"]'))
      .or(page.locator('input.date-input'))
      .or(page.locator('#specify-viewing-date-value'));
    if (await dateInput.count() > 0) {
      await dateInput.first().fill(dateStr);
      debug(`Set date to ${dateStr}`);
    }
  } catch {
    debug('Date input not found or not fillable');
  }
  
  // Set rating if provided
  if (options.rating !== undefined) {
    await setRatingInDialog(page, options.rating);
  }
  
  // Set liked if true
  if (options.liked) {
    try {
      // Prefer aria-label or role for like button
      const likeButton = page.getByRole('button', { name: /like/i })
        .or(page.locator('[aria-label*="like" i]'))
        .or(page.locator('.like-link-target'))
        .or(page.locator('.like-button'))
        .or(page.locator('[data-action="like"]'));
      if (await likeButton.count() > 0) {
        const btn = likeButton.first();
        const isLiked = await btn.getAttribute('class');
        if (!isLiked?.includes('liked')) {
          await btn.click();
          debug('Clicked like button');
        }
      }
    } catch {
      debug('Like button interaction failed');
    }
  }
  
  // Set rewatch if true
  if (options.rewatch) {
    try {
      // Prefer getByLabel or getByRole for checkbox
      const rewatchCheckbox = page.getByLabel(/rewatch|watched before/i)
        .or(page.getByRole('checkbox', { name: /rewatch/i }))
        .or(page.locator('input[name="rewatch"]'))
        .or(page.locator('#film-rewatch'));
      if (await rewatchCheckbox.count() > 0) {
        await rewatchCheckbox.first().check();
        debug('Checked rewatch checkbox');
      }
    } catch {
      debug('Rewatch checkbox not found');
    }
  }
  
  // Add review if provided
  if (options.review) {
    try {
      // Prefer getByLabel or getByPlaceholder for textarea
      const reviewTextarea = page.getByLabel(/review/i)
        .or(page.getByPlaceholder(/review|thoughts/i))
        .or(page.locator('textarea[name="review"]'))
        .or(page.locator('.review-textarea'))
        .or(page.locator('#review-text'));
      if (await reviewTextarea.count() > 0) {
        await reviewTextarea.first().fill(options.review);
        debug('Filled review textarea');
      }
      
      // Mark as spoiler if needed
      if (options.spoilers) {
        const spoilerCheckbox = page.getByLabel(/spoiler/i)
          .or(page.getByRole('checkbox', { name: /spoiler/i }))
          .or(page.locator('input[name="containsSpoilers"]'))
          .or(page.locator('#contains-spoilers'));
        if (await spoilerCheckbox.count() > 0) {
          await spoilerCheckbox.first().check();
          debug('Checked spoilers checkbox');
        }
      }
    } catch {
      debug('Review textarea interaction failed');
    }
  }
  
  // Click save/submit - prefer getByRole
  const saveButton = page.getByRole('button', { name: /save|submit/i })
    .or(page.locator('input[type="submit"][value="Save"]'))
    .or(page.locator('button[type="submit"]'))
    .or(page.locator('.save-review'));
  
  if (await saveButton.count() > 0) {
    await saveButton.first().click();
    debug('Clicked save button, waiting for completion...');
    // Wait for modal to close or success indicator
    await dialog.first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {
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
    // Try aria-label based selector first (most semantic)
    const ariaRating = page.locator(`[aria-label*="${rating} star" i], [aria-label*="rate ${rating}" i]`);
    if (await ariaRating.count() > 0) {
      await ariaRating.first().click();
      debug(`Set rating via aria-label: ${rating}`);
      return;
    }
    
    // Try clicking the appropriate star position via input
    const ratingInput = page.locator(`input[name="rating"][value="${rating}"], input[value="${halfStars}"]`);
    if (await ratingInput.count() > 0) {
      await ratingInput.first().click();
      debug(`Set rating via input: ${rating}`);
      return;
    }
    
    // Try the star rating widget - use locator for better chaining
    const stars = page.locator('.rating-stars .star, .rating .star');
    const starCount = await stars.count();
    if (starCount > 0) {
      const starIndex = Math.ceil(rating) - 1;
      if (starIndex < starCount) {
        await stars.nth(starIndex).click();
        debug(`Set rating via star widget: ${rating}`);
      }
    } else {
      debug('No star rating widget found');
    }
  } catch (e) {
    debug(`Rating interaction failed: ${e}`);
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
    // Prefer role-based or aria-label selectors
    const ratingLink = page.getByRole('button', { name: /rate/i })
      .or(page.locator('[aria-label*="rate" i]'))
      .or(page.locator('.rating-link'))
      .or(page.locator('[data-track-action="RateFilm"]'));
    
    if (await ratingLink.count() > 0) {
      await ratingLink.first().click();
      debug('Clicked rating link, waiting for widget...');
      // Wait for rating widget to become interactive
      const ratingWidget = page.locator('.rating .star, .rating-slider, [data-rating]');
      await ratingWidget.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
        debug('Rating widget not immediately visible');
      });
    }
    
    // Click the appropriate star - prefer aria-label or data-rating
    const starByAria = page.locator(`[aria-label*="${rating} star" i]`);
    const starByData = page.locator(`[data-rating="${rating}"]`);
    const starByClass = page.locator(`.rating .rated-${halfStars}, .star-${Math.ceil(rating)}`);
    
    const star = starByAria.or(starByData).or(starByClass);
    
    if (await star.count() > 0) {
      await star.first().click();
      debug(`Clicked star for rating ${rating}`);
    } else {
      debug('Star element not found, trying evaluate fallback');
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
  
  // Find the watchlist button (eye icon) - prefer aria-label or role
  const watchlistButton = page.getByRole('button', { name: /watchlist|watch later/i })
    .or(page.locator('[aria-label*="watchlist" i]'))
    .or(page.locator('.film-watch-link-target'))
    .or(page.locator('[data-track-action="AddToWatchlist"]'))
    .or(page.locator('.add-to-watchlist'));
  
  if (await watchlistButton.count() === 0) {
    throw new Error('Could not find watchlist button');
  }
  
  const btn = watchlistButton.first();
  
  // Check current state
  const classes = await btn.getAttribute('class') || '';
  const ariaPressed = await btn.getAttribute('aria-pressed');
  const isOnWatchlist = classes.includes('watchlisted') || classes.includes('-watched') || ariaPressed === 'true';
  
  // Only click if we need to change state
  if ((add && !isOnWatchlist) || (!add && isOnWatchlist)) {
    await btn.click();
    debug(`Toggled watchlist (add=${add}), waiting for completion...`);
    // Wait for class to change indicating state update
    await page.waitForFunction(
      ([sel, shouldHave]) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const hasClass = el.className.includes('watchlisted') || el.className.includes('-watched');
        const ariaState = el.getAttribute('aria-pressed') === 'true';
        return shouldHave ? (hasClass || ariaState) : (!hasClass && !ariaState);
      },
      ['.film-watch-link-target, [data-track-action="AddToWatchlist"], .add-to-watchlist', add] as const,
      { timeout: 5000 }
    ).catch(() => {
      debug('Watchlist state change detection timed out');
    });
  } else {
    debug(`Watchlist already in desired state (add=${add}, isOnWatchlist=${isOnWatchlist})`);
  }
}

/**
 * Like a film
 */
export async function likeFilm(page: Page, slug: string): Promise<void> {
  await ensureAuthenticated(page);
  await goToFilm(page, slug);
  
  // Prefer aria-label or role for like button
  const likeButton = page.getByRole('button', { name: /^like$/i })
    .or(page.locator('[aria-label*="like" i]'))
    .or(page.locator('.film-like-link-target'))
    .or(page.locator('[data-track-action="LikeFilm"]'))
    .or(page.locator('.like-button'));
  
  if (await likeButton.count() === 0) {
    throw new Error('Could not find like button');
  }
  
  const btn = likeButton.first();
  const classes = await btn.getAttribute('class') || '';
  const ariaPressed = await btn.getAttribute('aria-pressed');
  const isLiked = classes.includes('liked') || ariaPressed === 'true';
  
  if (!isLiked) {
    await btn.click();
    debug('Clicked like button, waiting for confirmation...');
    // Wait for liked class to appear or aria-pressed to change
    const likedSelector = page.locator('.film-like-link-target.liked, [data-track-action="LikeFilm"].liked, .like-button.liked, [aria-pressed="true"]');
    await likedSelector.first().waitFor({ state: 'attached', timeout: 5000 }).catch(() => {
      debug('Like confirmation detection timed out');
    });
  } else {
    debug('Film already liked');
  }
}
