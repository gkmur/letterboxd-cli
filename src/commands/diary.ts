/**
 * Diary command - view diary entries
 */

import chalk from 'chalk';
import ora from 'ora';
import { getPage, closeBrowser } from '../browser/client.js';
import { getDiary } from '../browser/pages/profile.js';
import { formatRating } from '../utils.js';
import { hasCredentials, loadConfig } from '../config.js';

interface DiaryOptions {
  month?: string;
  json?: boolean;
}

export async function diaryCommand(options: DiaryOptions): Promise<void> {
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
  
  const spinner = ora('Fetching diary...').start();
  
  try {
    const page = await getPage();
    const entries = await getDiary(page, username, options.month);
    await page.close();
    
    spinner.stop();
    
    if (entries.length === 0) {
      const monthStr = options.month ? ` for ${options.month}` : '';
      console.log(chalk.yellow(`No diary entries${monthStr}.`));
      if (options.json) {
        console.log(JSON.stringify({ entries: [] }));
      }
      return;
    }
    
    if (options.json) {
      console.log(JSON.stringify({ entries }, null, 2));
    } else {
      const monthStr = options.month ? ` (${options.month})` : '';
      console.log(chalk.bold(`\nDiary${monthStr}:\n`));
      
      for (const entry of entries) {
        const rating = entry.rating ? chalk.yellow(formatRating(entry.rating)) : chalk.gray('—');
        const liked = entry.liked ? ' ❤️' : '';
        const rewatch = entry.rewatch ? chalk.dim(' ↻') : '';
        const date = entry.date ? chalk.gray(` ${entry.date}`) : '';
        
        console.log(`  ${chalk.cyan(entry.title)} ${rating}${liked}${rewatch}${date}`);
      }
    }
  } catch (error) {
    spinner.fail(chalk.red(`Failed to fetch diary: ${error}`));
    if (options.json) {
      console.log(JSON.stringify({ error: String(error) }));
    }
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}
