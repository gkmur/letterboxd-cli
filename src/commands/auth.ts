/**
 * Auth command - check/setup authentication
 */

import { createInterface } from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import { hasCredentials, loadConfig, saveConfig, setPassword, migratePassword } from '../config.js';
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
  // Check for and migrate any legacy plaintext passwords
  await migratePassword();
  
  // Check if credentials exist
  if (!(await hasCredentials())) {
    console.log(chalk.yellow('No credentials configured.\n'));
    
    // Prompt for credentials
    const username = await prompt('Letterboxd email/username: ');
    const password = await prompt('Letterboxd password: ', true);
    
    if (!username || !password) {
      console.log(chalk.red('Credentials required.'));
      process.exit(1);
    }
    
    // Save username to config (not password)
    const config = loadConfig();
    config.username = username;
    saveConfig(config);
    
    // Store password in keychain
    await setPassword(username, password);
    
    console.log(chalk.green('\n✓ Credentials saved securely (username in config, password in keychain)'));
  }
  
  // Test authentication
  const spinner = ora('Checking authentication...').start();
  
  try {
    const status = await checkAuthStatus();
    
    if (status.authenticated) {
      spinner.succeed(chalk.green(`Authenticated${status.username ? ` as ${status.username}` : ''}`));
      
      // Update stored username if we scraped the real one
      if (status.username) {
        const config = loadConfig();
        if (config.username !== status.username) {
          // The original username might be an email, update to actual username
          saveConfig({ ...config, username: status.username });
        }
      }
      
      if (options.json) {
        console.log(JSON.stringify({ authenticated: true, username: status.username }));
      }
    } else {
      spinner.text = 'Session expired, logging in...';
      
      const page = await getPage();
      const result = await login(page);
      await page.close();
      
      if (result.success) {
        spinner.succeed(chalk.green(`Logged in successfully${result.username ? ` as ${result.username}` : ''}`));
        
        // Update stored username if we scraped the real one
        if (result.username) {
          const config = loadConfig();
          saveConfig({ ...config, username: result.username });
        }
        
        if (options.json) {
          console.log(JSON.stringify({ authenticated: true, username: result.username }));
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
