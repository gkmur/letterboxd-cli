/**
 * Search page automation
 */

import { Page } from 'playwright';
import { navigateTo } from '../client.js';
import { debug } from '../../utils/logger.js';
import { FilmSlug, toFilmSlug } from '../../types/index.js';

export interface SearchResult {
  title: string;
  year?: string;
  slug: FilmSlug;
  url: string;
  director?: string;
}

/**
 * Search for films on Letterboxd
 */
export async function searchFilms(page: Page, query: string): Promise<SearchResult[]> {
  const searchUrl = `https://letterboxd.com/search/films/${encodeURIComponent(query)}/`;
  await navigateTo(page, searchUrl);
  
  debug('Waiting for search results to load...');
  // Use locator with or() for fallback - primary: results list, fallback: no-results message
  const resultsContainer = page.locator('ul.results').or(page.getByText(/no results/i));
  await resultsContainer.first().waitFor({ state: 'visible', timeout: 10000 });
  
  const results: SearchResult[] = [];
  
  // Get all search result items - use locator chain for better reliability
  const resultsList = page.locator('ul.results');
  const items = resultsList.locator('li.search-result');
  const itemCount = await items.count();
  
  for (let i = 0; i < Math.min(itemCount, 10); i++) { // Limit to 10 results
    try {
      const item = items.nth(i);
      
      // Get the film link - prefer role-based selector, fall back to CSS
      const filmLink = item.getByRole('link').filter({ hasText: /.+/ }).first();
      
      // Try to get href from poster link or title link
      const posterLink = item.locator('a.film-poster, [data-film-slug]');
      const titleLink = item.locator('.film-title-wrapper a, .headline-3 a');
      
      let href: string | null = null;
      if (await posterLink.count() > 0) {
        href = await posterLink.first().getAttribute('href');
      } else if (await titleLink.count() > 0) {
        href = await titleLink.first().getAttribute('href');
      } else if (await filmLink.count() > 0) {
        href = await filmLink.getAttribute('href');
      }
      
      if (!href || !href.startsWith('/film/')) {
        debug(`Skipping result ${i}: no valid film link found`);
        continue;
      }
      
      // Extract slug from URL
      const slug = toFilmSlug(href.replace('/film/', '').replace(/\/$/, ''));
      
      // Get title - prefer heading role, fall back to CSS
      let title: string | null = null;
      const headingLink = item.getByRole('heading').getByRole('link');
      if (await headingLink.count() > 0) {
        title = await headingLink.textContent();
      } else if (await titleLink.count() > 0) {
        title = await titleLink.first().textContent();
      }
      
      // Get year from metadata
      const yearEl = item.locator('.metadata, small.metadata, small');
      let year: string | undefined;
      if (await yearEl.count() > 0) {
        const yearText = await yearEl.first().textContent();
        const match = yearText?.match(/\d{4}/);
        year = match?.[0];
      }
      
      // Get director - look for link in film detail content
      const directorEl = item.locator('.film-detail-content p a, .prettify').first();
      const director = await directorEl.count() > 0 ? await directorEl.textContent() : undefined;
      
      results.push({
        title: title?.trim() || slug,
        year,
        slug,
        url: `https://letterboxd.com/film/${slug}/`,
        director: director?.trim(),
      });
    } catch (e) {
      debug(`Error parsing search result ${i}: ${e}`);
      // Skip malformed results
    }
  }
  
  return results;
}

/**
 * Find the best matching film for a query
 */
export async function findFilm(page: Page, query: string): Promise<SearchResult | null> {
  const results = await searchFilms(page, query);
  return results[0] || null;
}
