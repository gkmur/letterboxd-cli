/**
 * Search command - search for films
 */

import chalk from 'chalk';
import ora from 'ora';
import { getPage, closeBrowser } from '../browser/client.js';
import { searchFilms } from '../browser/pages/search.js';

interface SearchOptions {
  json?: boolean;
  limit?: number;
}

export async function searchCommand(query: string, options: SearchOptions): Promise<void> {
  const spinner = ora(`Searching for "${query}"...`).start();
  
  try {
    const page = await getPage();
    const results = await searchFilms(page, query);
    await page.close();
    
    const limit = options.limit || 10;
    const limitedResults = results.slice(0, limit);
    
    spinner.stop();
    
    if (limitedResults.length === 0) {
      console.log(chalk.yellow('No results found.'));
      if (options.json) {
        console.log(JSON.stringify({ results: [] }));
      }
      return;
    }
    
    if (options.json) {
      console.log(JSON.stringify({ results: limitedResults }, null, 2));
    } else {
      console.log(chalk.bold(`\nFound ${limitedResults.length} results:\n`));
      
      for (const result of limitedResults) {
        const year = result.year ? chalk.gray(` (${result.year})`) : '';
        const director = result.director ? chalk.dim(` — ${result.director}`) : '';
        console.log(`  ${chalk.cyan(result.title)}${year}${director}`);
        console.log(chalk.gray(`    ${result.url}`));
      }
    }
  } catch (error) {
    spinner.fail(chalk.red(`Search failed: ${error}`));
    if (options.json) {
      console.log(JSON.stringify({ error: String(error) }));
    }
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}
