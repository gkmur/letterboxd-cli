/**
 * Logout command - clear stored credentials and session
 */

import chalk from 'chalk';
import { loadConfig, saveConfig, deletePassword } from '../config.js';
import { closeBrowser } from '../browser/client.js';

export async function logoutCommand(): Promise<void> {
  const config = loadConfig();
  
  if (!config.username) {
    console.log(chalk.yellow('Not logged in.'));
    return;
  }
  
  // Close any open browser
  await closeBrowser();
  
  // Delete from keychain
  await deletePassword(config.username);
  
  // Clear cookies
  const { rmSync } = await import('fs');
  const cookiesDir = `${process.env.HOME}/.letterboxd-cli/cookies`;
  try {
    rmSync(cookiesDir, { recursive: true, force: true });
  } catch {
    // Ignore errors if directory doesn't exist
  }
  
  // Clear username from config
  saveConfig({ ...config, username: undefined });
  
  console.log(chalk.green('✓ Logged out successfully'));
}
