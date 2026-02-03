/**
 * Search page automation
 */

import { Page } from 'playwright';
import { navigateTo } from '../client.js';
import { sleep } from '../../utils.js';

export interface SearchResult {
  title: string;
  year?: string;
  slug: string;
  url: string;
  director?: string;
}

/**
 * Search for films on Letterboxd
 */
export async function searchFilms(page: Page, query: string): Promise<SearchResult[]> {
  const searchUrl = `https://letterboxd.com/search/films/${encodeURIComponent(query)}/`;
  await navigateTo(page, searchUrl);
  await sleep(1000);
  
  const results: SearchResult[] = [];
  
  // Get all search result items
  const items = await page.$$('ul.results li.search-result');
  
  for (const item of items.slice(0, 10)) { // Limit to 10 results
    try {
      // Get the film link
      const link = await item.$('a.film-poster, span.film-title-wrapper a');
      if (!link) continue;
      
      const href = await link.getAttribute('href');
      if (!href || !href.startsWith('/film/')) continue;
      
      // Extract slug from URL
      const slug = href.replace('/film/', '').replace(/\/$/, '');
      
      // Get title
      const titleEl = await item.$('.film-title-wrapper a, .headline-3 a');
      const title = titleEl ? await titleEl.textContent() : slug;
      
      // Get year
      const yearEl = await item.$('.metadata, small.metadata');
      let year: string | undefined;
      if (yearEl) {
        const yearText = await yearEl.textContent();
        const match = yearText?.match(/\d{4}/);
        year = match?.[0];
      }
      
      // Get director
      const directorEl = await item.$('.film-detail-content p a, .prettify');
      const director = directorEl ? await directorEl.textContent() : undefined;
      
      results.push({
        title: title?.trim() || slug,
        year,
        slug,
        url: `https://letterboxd.com/film/${slug}/`,
        director: director?.trim(),
      });
    } catch {
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
