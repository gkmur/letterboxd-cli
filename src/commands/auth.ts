/**
 * Auth command - check/setup authentication
 */

import { createInterface } from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import { hasCredentials, loadConfig, saveConfig } from '../config.js';
import { checkAuthStatus, login } from '../browser/auth.js';
import { getPage, closeBrowser } from '../browser/client.js';

interface AuthOptions {
  json?: boolean;
}

/**
 * Prompt for input (with optional hidden input for passwords)
 */
async function prompt(question: string, hidden = false): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (hidden) {
      process.stdout.write(question);
      let input = '';
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', (char) => {
        const c = char.toString();
        if (c === '\n' || c === '\r') {
          process.stdin.setRawMode(false);
          process.stdout.write('\n');
          rl.close();
          resolve(input);
        } else if (c === '\u0003') {
          process.exit();
        } else if (c === '\u007F') {
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          input += c;
          process.stdout.write('*');
        }
      });
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

export async function authCommand(options: AuthOptions): Promise<void> {
  // Check if credentials exist
  if (!hasCredentials()) {
    console.log(chalk.yellow('No credentials configured.\n'));
    
    // Prompt for credentials
    const username = await prompt('Letterboxd email/username: ');
    const password = await prompt('Letterboxd password: ', true);
    
    if (!username || !password) {
      console.log(chalk.red('Credentials required.'));
      process.exit(1);
    }
    
    // Save credentials
    const config = loadConfig();
    config.username = username;
    config.password = password;
    saveConfig(config);
    
    console.log(chalk.green('\n✓ Credentials saved to ~/.letterboxd-cli/config.json'));
  }
  
  // Test authentication
  const spinner = ora('Checking authentication...').start();
  
  try {
    const status = await checkAuthStatus();
    
    if (status.authenticated) {
      spinner.succeed(chalk.green(`Authenticated${status.username ? ` as ${status.username}` : ''}`));
      
      if (options.json) {
        console.log(JSON.stringify({ authenticated: true, username: status.username }));
      }
    } else {
      spinner.text = 'Session expired, logging in...';
      
      const page = await getPage();
      const success = await login(page);
      await page.close();
      
      if (success) {
        spinner.succeed(chalk.green('Logged in successfully'));
        if (options.json) {
          console.log(JSON.stringify({ authenticated: true }));
        }
      } else {
        spinner.fail(chalk.red('Login failed. Check your credentials.'));
        if (options.json) {
          console.log(JSON.stringify({ authenticated: false, error: 'Login failed' }));
        }
        process.exit(1);
      }
    }
  } catch (error) {
    spinner.fail(chalk.red(`Authentication error: ${error}`));
    if (options.json) {
      console.log(JSON.stringify({ authenticated: false, error: String(error) }));
    }
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}
