#!/usr/bin/env node
/**
 * letterboxd-cli - CLI tool for Letterboxd
 */

import { Command } from 'commander';
import { authCommand } from './commands/auth.js';
import { searchCommand } from './commands/search.js';
import { logCommand } from './commands/log.js';
import { rateCommand } from './commands/rate.js';
import { watchlistAddCommand, watchlistRemoveCommand, watchlistListCommand } from './commands/watchlist.js';
import { diaryCommand } from './commands/diary.js';
import { statsCommand } from './commands/stats.js';
import { setDebug } from './utils/logger.js';
import { setDebugMode } from './browser/client.js';

const program = new Command();

program
  .name('letterboxd')
  .description('CLI tool for Letterboxd - log films, manage watchlist, view diary and stats')
  .version('0.1.0')
  .option('--debug', 'Enable debug mode (headed browser, verbose logging)')
  .hook('preAction', () => {
    const opts = program.opts();
    if (opts.debug) {
      setDebug(true);
      setDebugMode(true);
    }
  });

// Auth command
program
  .command('auth')
  .description('Check authentication status or set up credentials')
  .option('--json', 'Output as JSON')
  .action(authCommand);

// Search command
program
  .command('search <query>')
  .description('Search for films')
  .option('--json', 'Output as JSON')
  .option('-l, --limit <number>', 'Limit results', '10')
  .action(searchCommand);

// Log command
program
  .command('log <film>')
  .description('Log a film to your diary')
  .option('-r, --rating <rating>', 'Rating (0.5-5.0 or ★★★★)')
  .option('-l, --liked', 'Mark as liked (❤️)')
  .option('-d, --date <date>', 'Watch date (YYYY-MM-DD, "today", "yesterday")')
  .option('--review <text>', 'Add a review')
  .option('--rewatch', 'Mark as a rewatch')
  .option('--spoilers', 'Mark review as containing spoilers')
  .option('--json', 'Output as JSON')
  .action(logCommand);

// Rate command
program
  .command('rate <film> <rating>')
  .description('Quick rate a film (without full log entry)')
  .option('--json', 'Output as JSON')
  .action(rateCommand);

// Watchlist commands
const watchlist = program
  .command('watchlist')
  .description('Manage your watchlist');

watchlist
  .command('add <film>')
  .description('Add a film to your watchlist')
  .option('--json', 'Output as JSON')
  .action(watchlistAddCommand);

watchlist
  .command('remove <film>')
  .description('Remove a film from your watchlist')
  .option('--json', 'Output as JSON')
  .action(watchlistRemoveCommand);

watchlist
  .command('list')
  .description('List films on your watchlist')
  .option('--json', 'Output as JSON')
  .action(watchlistListCommand);

// Diary command
program
  .command('diary')
  .description('View your diary entries')
  .option('-m, --month <YYYY-MM>', 'Filter by month')
  .option('--json', 'Output as JSON')
  .action(diaryCommand);

// Stats command
program
  .command('stats')
  .description('View your stats')
  .option('--json', 'Output as JSON')
  .action(statsCommand);

program.parse();
