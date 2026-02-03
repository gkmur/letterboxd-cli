/**
 * Configuration management for letterboxd-cli
 * Config stored at ~/.letterboxd-cli/config.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface Config {
  username?: string;
  password?: string;
}

const CONFIG_DIR = join(homedir(), '.letterboxd-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const COOKIES_DIR = join(CONFIG_DIR, 'cookies');

/**
 * Ensure the config directory exists
 */
export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  if (!existsSync(COOKIES_DIR)) {
    mkdirSync(COOKIES_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Get the cookies directory path
 */
export function getCookiesDir(): string {
  ensureConfigDir();
  return COOKIES_DIR;
}

/**
 * Load config from disk
 */
export function loadConfig(): Config {
  ensureConfigDir();
  
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  
  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Save config to disk (chmod 600 for security)
 */
export function saveConfig(config: Config): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  chmodSync(CONFIG_FILE, 0o600);
}

/**
 * Check if we have credentials configured
 */
export function hasCredentials(): boolean {
  const config = loadConfig();
  return !!(config.username && config.password);
}

/**
 * Get credentials (throws if not configured)
 */
export function getCredentials(): { username: string; password: string } {
  const config = loadConfig();
  if (!config.username || !config.password) {
    throw new Error('No credentials configured. Run: letterboxd auth');
  }
  return { username: config.username, password: config.password };
}
