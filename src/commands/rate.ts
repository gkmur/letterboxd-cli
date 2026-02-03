/**
 * Rate command - quick rate a film without full log entry
 */

import chalk from 'chalk';
import ora from 'ora';
import { getPage, closeBrowser } from '../browser/client.js';
import { findFilm } from '../browser/pages/search.js';
import { rateFilm } from '../browser/pages/film.js';
import { parseRating, formatRating } from '../utils.js';
import { hasCredentials } from '../config.js';

interface RateOptions {
  json?: boolean;
}

export async function rateCommand(film: string, rating: string, options: RateOptions): Promise<void> {
  if (!hasCredentials()) {
    console.log(chalk.red('Not authenticated. Run: letterboxd auth'));
    process.exit(1);
  }
  
  // Parse rating
  const parsedRating = parseRating(rating);
  if (parsedRating === null) {
    console.log(chalk.red(`Invalid rating: ${rating}. Use 0.5-5.0 or stars (★★★★)`));
    process.exit(1);
  }
  
  const spinner = ora(`Searching for "${film}"...`).start();
  
  try {
    const page = await getPage();
    
    // Find the film
    const searchResult = await findFilm(page, film);
    if (!searchResult) {
      spinner.fail(chalk.red(`Film not found: ${film}`));
      process.exit(1);
    }
    
    spinner.text = `Rating ${searchResult.title}...`;
    
    // Rate the film
    await rateFilm(page, searchResult.slug, parsedRating);
    await page.close();
    
    spinner.succeed(chalk.green(`Rated ${searchResult.title} ${formatRating(parsedRating)}`));
    
    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        film: {
          title: searchResult.title,
          slug: searchResult.slug,
          year: searchResult.year,
        },
        rating: parsedRating,
      }, null, 2));
    }
  } catch (error) {
    spinner.fail(chalk.red(`Failed to rate film: ${error}`));
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: String(error) }));
    }
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}
