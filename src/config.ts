/**
 * Configuration management for letterboxd-cli
 * Config stored at ~/.letterboxd-cli/config.json
 * Password stored securely in system keychain via keytar
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import keytar from 'keytar';

export interface Config {
  username?: string;
  password?: string; // Legacy - will be migrated to keychain
}

const SERVICE_NAME = 'com.letterboxd-cli';
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
  // Don't store password in config file - use keychain
  const { password: _password, ...safeConfig } = config;
  writeFileSync(CONFIG_FILE, JSON.stringify(safeConfig, null, 2));
  chmodSync(CONFIG_FILE, 0o600);
}

/**
 * Get password from system keychain
 */
export async function getPassword(username: string): Promise<string | null> {
  return keytar.getPassword(SERVICE_NAME, username);
}

/**
 * Store password in system keychain
 */
export async function setPassword(username: string, password: string): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, username, password);
}

/**
 * Delete password from system keychain
 */
export async function deletePassword(username: string): Promise<boolean> {
  return keytar.deletePassword(SERVICE_NAME, username);
}

/**
 * Migrate plaintext password from config to keychain
 */
export async function migratePassword(): Promise<boolean> {
  const config = loadConfig();
  if (config.username && config.password) {
    // Store in keychain
    await setPassword(config.username, config.password);
    // Remove from config file
    saveConfig({ username: config.username });
    return true;
  }
  return false;
}

/**
 * Check if we have credentials configured
 */
export async function hasCredentials(): Promise<boolean> {
  // Check env vars first
  if (process.env.LETTERBOXD_USERNAME && process.env.LETTERBOXD_PASSWORD) {
    return true;
  }
  
  const config = loadConfig();
  if (!config.username) {
    return false;
  }
  
  // Check keychain
  const password = await getPassword(config.username);
  return password !== null;
}

/**
 * Get credentials (throws if not configured)
 * Priority: env vars > keychain
 */
export async function getCredentials(): Promise<{ username: string; password: string }> {
  // Check env vars first
  if (process.env.LETTERBOXD_USERNAME && process.env.LETTERBOXD_PASSWORD) {
    return {
      username: process.env.LETTERBOXD_USERNAME,
      password: process.env.LETTERBOXD_PASSWORD,
    };
  }
  
  const config = loadConfig();
  if (!config.username) {
    throw new Error('No credentials configured. Run: letterboxd auth');
  }
  
  // Try to migrate legacy plaintext password
  if (config.password) {
    await migratePassword();
  }
  
  // Get password from keychain
  const password = await getPassword(config.username);
  if (!password) {
    throw new Error('No password found. Run: letterboxd auth');
  }
  
  return { username: config.username, password };
}
