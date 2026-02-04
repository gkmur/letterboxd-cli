/**
 * Log command - log a film with optional rating, liked, date, review
 */

import chalk from 'chalk';
import ora from 'ora';
import { getPage, closeBrowser } from '../browser/client.js';
import { findFilm } from '../browser/pages/search.js';
import { logFilm, LogOptions } from '../browser/pages/film.js';
import { parseRating, formatRating, parseDate, formatDate } from '../utils.js';
import { hasCredentials } from '../config.js';

interface LogCommandOptions {
  rating?: string;
  liked?: boolean;
  date?: string;
  review?: string;
  rewatch?: boolean;
  spoilers?: boolean;
  json?: boolean;
}

export async function logCommand(film: string, options: LogCommandOptions): Promise<void> {
  if (!(await hasCredentials())) {
    console.log(chalk.red('Not authenticated. Run: letterboxd auth'));
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
    
    spinner.text = `Logging ${searchResult.title}...`;
    
    // Parse options
    const logOptions: LogOptions = {
      liked: options.liked,
      rewatch: options.rewatch,
      spoilers: options.spoilers,
    };
    
    if (options.rating) {
      const rating = parseRating(options.rating);
      if (rating === null) {
        spinner.fail(chalk.red(`Invalid rating: ${options.rating}. Use 0.5-5.0 or stars (★★★★)`));
        process.exit(1);
      }
      logOptions.rating = rating;
    }
    
    if (options.date) {
      const date = parseDate(options.date);
      if (date === null) {
        spinner.fail(chalk.red(`Invalid date: ${options.date}`));
        process.exit(1);
      }
      logOptions.date = date;
    }
    
    if (options.review) {
      logOptions.review = options.review;
    }
    
    // Log the film
    await logFilm(page, searchResult.slug, logOptions);
    await page.close();
    
    // Success output
    const ratingStr = logOptions.rating ? ` ${formatRating(logOptions.rating)}` : '';
    const likedStr = options.liked ? ' ❤️' : '';
    const dateStr = logOptions.date ? ` on ${formatDate(logOptions.date)}` : '';
    const rewatchStr = options.rewatch ? ' (rewatch)' : '';
    
    spinner.succeed(chalk.green(`Logged ${searchResult.title}${ratingStr}${likedStr}${dateStr}${rewatchStr}`));
    
    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        film: {
          title: searchResult.title,
          slug: searchResult.slug,
          year: searchResult.year,
        },
        log: {
          rating: logOptions.rating,
          liked: options.liked || false,
          date: formatDate(logOptions.date || new Date()),
          rewatch: options.rewatch || false,
        },
      }, null, 2));
    }
  } catch (error) {
    spinner.fail(chalk.red(`Failed to log film: ${error}`));
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: String(error) }));
    }
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}
