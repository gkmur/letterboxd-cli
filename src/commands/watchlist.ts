/**
 * Watchlist command - add/remove/list watchlist items
 */

import chalk from 'chalk';
import ora from 'ora';
import { getPage, closeBrowser } from '../browser/client.js';
import { findFilm } from '../browser/pages/search.js';
import { toggleWatchlist } from '../browser/pages/film.js';
import { getWatchlist } from '../browser/pages/profile.js';
import { hasCredentials, loadConfig } from '../config.js';

interface WatchlistOptions {
  json?: boolean;
}

export async function watchlistAddCommand(film: string, options: WatchlistOptions): Promise<void> {
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
    
    spinner.text = `Adding ${searchResult.title} to watchlist...`;
    
    // Add to watchlist
    await toggleWatchlist(page, searchResult.slug, true);
    await page.close();
    
    spinner.succeed(chalk.green(`Added ${searchResult.title} to watchlist`));
    
    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        action: 'add',
        film: {
          title: searchResult.title,
          slug: searchResult.slug,
          year: searchResult.year,
        },
      }, null, 2));
    }
  } catch (error) {
    spinner.fail(chalk.red(`Failed to add to watchlist: ${error}`));
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: String(error) }));
    }
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}

export async function watchlistRemoveCommand(film: string, options: WatchlistOptions): Promise<void> {
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
    
    spinner.text = `Removing ${searchResult.title} from watchlist...`;
    
    // Remove from watchlist
    await toggleWatchlist(page, searchResult.slug, false);
    await page.close();
    
    spinner.succeed(chalk.green(`Removed ${searchResult.title} from watchlist`));
    
    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        action: 'remove',
        film: {
          title: searchResult.title,
          slug: searchResult.slug,
          year: searchResult.year,
        },
      }, null, 2));
    }
  } catch (error) {
    spinner.fail(chalk.red(`Failed to remove from watchlist: ${error}`));
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: String(error) }));
    }
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}

export async function watchlistListCommand(options: WatchlistOptions): Promise<void> {
  if (!(await hasCredentials())) {
    console.log(chalk.red('Not authenticated. Run: letterboxd auth'));
    process.exit(1);
  }
  
  const config = loadConfig();
  // Extract username from email if needed (use first part before @)
  const username = config.username?.includes('@') 
    ? config.username.split('@')[0] 
    : config.username;
  
  if (!username) {
    console.log(chalk.red('Username not configured.'));
    process.exit(1);
  }
  
  const spinner = ora('Fetching watchlist...').start();
  
  try {
    const page = await getPage();
    const items = await getWatchlist(page, username);
    await page.close();
    
    spinner.stop();
    
    if (items.length === 0) {
      console.log(chalk.yellow('Your watchlist is empty.'));
      if (options.json) {
        console.log(JSON.stringify({ items: [] }));
      }
      return;
    }
    
    if (options.json) {
      console.log(JSON.stringify({ items }, null, 2));
    } else {
      console.log(chalk.bold(`\nWatchlist (${items.length} films):\n`));
      
      for (const item of items) {
        const year = item.year ? chalk.gray(` (${item.year})`) : '';
        console.log(`  ${chalk.cyan(item.title)}${year}`);
      }
    }
  } catch (error) {
    spinner.fail(chalk.red(`Failed to fetch watchlist: ${error}`));
    if (options.json) {
      console.log(JSON.stringify({ error: String(error) }));
    }
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}
