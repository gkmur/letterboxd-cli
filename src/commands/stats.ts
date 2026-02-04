/**
 * Stats command - view basic stats
 */

import chalk from 'chalk';
import ora from 'ora';
import { getPage, closeBrowser } from '../browser/client.js';
import { getStats } from '../browser/pages/profile.js';
import { hasCredentials, loadConfig } from '../config.js';

interface StatsOptions {
  json?: boolean;
}

export async function statsCommand(options: StatsOptions): Promise<void> {
  if (!(await hasCredentials())) {
    console.log(chalk.red('Not authenticated. Run: letterboxd auth'));
    process.exit(1);
  }
  
  const config = loadConfig();
  // Extract username from email if needed
  const username = config.username?.includes('@') 
    ? config.username.split('@')[0] 
    : config.username;
  
  if (!username) {
    console.log(chalk.red('Username not configured.'));
    process.exit(1);
  }
  
  const spinner = ora('Fetching stats...').start();
  
  try {
    const page = await getPage();
    const stats = await getStats(page, username);
    await page.close();
    
    spinner.stop();
    
    if (options.json) {
      console.log(JSON.stringify({ stats }, null, 2));
    } else {
      console.log(chalk.bold('\n📊 Your Stats:\n'));
      console.log(`  Films this year: ${chalk.cyan(stats.filmsThisYear)}`);
      console.log(`  Total films:     ${chalk.cyan(stats.totalFilms)}`);
      
      if (stats.following !== undefined) {
        console.log(`  Following:       ${chalk.cyan(stats.following)}`);
      }
      if (stats.followers !== undefined) {
        console.log(`  Followers:       ${chalk.cyan(stats.followers)}`);
      }
      if (stats.hoursWatched !== undefined) {
        console.log(`  Hours watched:   ${chalk.cyan(stats.hoursWatched)}`);
      }
      
      console.log();
    }
  } catch (error) {
    spinner.fail(chalk.red(`Failed to fetch stats: ${error}`));
    if (options.json) {
      console.log(JSON.stringify({ error: String(error) }));
    }
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}
