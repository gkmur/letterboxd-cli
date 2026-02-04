/**
 * Retry utility for flaky operations
 */

import { debug } from './logger.js';

/**
 * Execute a function with retry logic
 * @param fn - The async function to execute
 * @param attempts - Number of attempts (default: 3)
 * @param delayMs - Delay between retries in ms (default: 1000)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  delayMs = 1000
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === attempts - 1) throw e;
      debug(`Retry ${i + 1}/${attempts} after error:`, e);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error('unreachable');
}
