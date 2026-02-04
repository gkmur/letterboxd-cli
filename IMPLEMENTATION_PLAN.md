# Implementation Plan: letterboxd-cli v0.2

## Executive Summary

This plan addresses three categories of improvements:
1. **Security** - Secure credential storage, logout, env vars
2. **Stability** - Better selectors, proper waits, retry logic, username handling
3. **Developer Experience** - Debug mode, tests, verbose logging

---

## 1. Secure Credential Storage

### Current State
- `src/config.ts` lines 49-62: Credentials stored in plaintext JSON at `~/.letterboxd-cli/config.json`
- Password visible to anyone with file access
- No way to clear credentials

### Files to Modify
- `src/config.ts` - Add keychain integration
- `src/commands/auth.ts` - Add logout subcommand
- `package.json` - Add keytar dependency

### Dependencies
```json
"keytar": "^7.9.0"
```

Note: `keytar` requires native compilation. For pure-JS alternative, consider `keychain` on macOS.

### Option A: Keychain-Only (Recommended)

**Changes to `src/config.ts`:**
```typescript
import keytar from 'keytar';

const SERVICE_NAME = 'letterboxd-cli';

export interface Config {
  username?: string;
  // password removed from file storage
}

export async function getPassword(): Promise<string | null> {
  const config = loadConfig();
  if (!config.username) return null;
  return await keytar.getPassword(SERVICE_NAME, config.username);
}

export async function setPassword(username: string, password: string): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, username, password);
}

export async function deletePassword(): Promise<void> {
  const config = loadConfig();
  if (config.username) {
    await keytar.deletePassword(SERVICE_NAME, config.username);
  }
}

export async function getCredentials(): Promise<{ username: string; password: string }> {
  // Check env vars first
  const envUsername = process.env.LETTERBOXD_USERNAME;
  const envPassword = process.env.LETTERBOXD_PASSWORD;
  
  if (envUsername && envPassword) {
    return { username: envUsername, password: envPassword };
  }
  
  const config = loadConfig();
  if (!config.username) {
    throw new Error('No credentials configured. Run: letterboxd auth');
  }
  
  const password = await getPassword();
  if (!password) {
    throw new Error('No password found. Run: letterboxd auth');
  }
  
  return { username: config.username, password };
}
```

**Pros:**
- Most secure - passwords never touch disk
- Uses OS-level encryption (macOS Keychain, Windows Credential Vault, Linux Secret Service)

**Cons:**
- Requires native compilation (can fail on some systems)
- Won't work in headless CI without keychain setup

### Option B: Keychain with Encrypted File Fallback

**Additional changes:**
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY_FILE = join(CONFIG_DIR, '.key');

function getOrCreateKey(): Buffer {
  if (existsSync(ENCRYPTION_KEY_FILE)) {
    return readFileSync(ENCRYPTION_KEY_FILE);
  }
  const key = randomBytes(32);
  writeFileSync(ENCRYPTION_KEY_FILE, key, { mode: 0o600 });
  return key;
}

function encryptPassword(password: string): string {
  const key = getOrCreateKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export async function getCredentials(): Promise<{ username: string; password: string }> {
  // 1. Try env vars
  // 2. Try keytar
  // 3. Fall back to encrypted file
}
```

**Pros:**
- Works everywhere
- Graceful degradation

**Cons:**
- Still stores password on disk (albeit encrypted)
- Key file is the weak point

### Recommendation: **Option A** (Keychain-only)

For a CLI tool, env vars provide the CI escape hatch. Users who can't use keychain can use `LETTERBOXD_USERNAME` and `LETTERBOXD_PASSWORD`.

### Migration Path
1. On first run after upgrade, detect old config with password
2. Migrate to keychain automatically
3. Remove password from config file
4. Print migration notice

---

## 2. Logout Command

### Files to Modify
- `src/commands/auth.ts` - Add logout function
- `src/index.ts` - Register logout subcommand

### Implementation

**Add to `src/commands/auth.ts`:**
```typescript
export async function logoutCommand(options: { json?: boolean }): Promise<void> {
  const spinner = ora('Logging out...').start();
  
  try {
    // Clear keychain password
    await deletePassword();
    
    // Clear config
    saveConfig({});
    
    // Clear cookies
    const cookiesDir = getCookiesDir();
    if (existsSync(cookiesDir)) {
      rmSync(cookiesDir, { recursive: true });
      mkdirSync(cookiesDir, { mode: 0o700 });
    }
    
    spinner.succeed(chalk.green('Logged out successfully'));
    
    if (options.json) {
      console.log(JSON.stringify({ success: true }));
    }
  } catch (error) {
    spinner.fail(chalk.red(`Logout failed: ${error}`));
    process.exit(1);
  }
}
```

**Add to `src/index.ts`:**
```typescript
program
  .command('logout')
  .description('Clear stored credentials and session')
  .option('--json', 'Output as JSON')
  .action(logoutCommand);
```

---

## 3. Environment Variable Support

### Implementation (included in config.ts changes above)

Priority order:
1. `LETTERBOXD_USERNAME` + `LETTERBOXD_PASSWORD` env vars
2. Keychain
3. Config file (username only after migration)

This enables CI usage:
```bash
LETTERBOXD_USERNAME=user LETTERBOXD_PASSWORD=pass letterboxd log "The Matrix"
```

---

## 4. Replace Brittle CSS Selectors

### Current State
Selectors like `'input[name="username"]'`, `'.rating-link'`, `'ul.results li.search-result'` are fragile and break when Letterboxd updates their HTML.

### Strategy
Use Playwright's recommended locators:
- `page.getByRole()` - semantic/accessible
- `page.getByText()` - text content
- `page.getByLabel()` - form fields
- `page.getByTestId()` - if data-testid exists

### Files to Modify
- `src/browser/auth.ts`
- `src/browser/pages/film.ts`
- `src/browser/pages/search.ts`
- `src/browser/pages/profile.ts`

### Detailed Changes

**`src/browser/auth.ts`:**
```typescript
// Before (line 18-19)
await page.fill('input[name="username"]', username);
await page.fill('input[name="password"]', password);

// After
await page.getByLabel('Username or email').fill(username);
await page.getByLabel('Password').fill(password);

// Before (line 27)
await page.click('input[type="submit"][value="Sign in"], button[type="submit"]');

// After
await page.getByRole('button', { name: 'Sign in' }).click();

// Before (line 10) - checking auth
const signInLink = await page.$('a[href="/sign-in/"]');

// After
const signInLink = await page.getByRole('link', { name: 'Sign in' }).count();
return signInLink === 0;
```

**`src/browser/pages/search.ts`:**
```typescript
// Before (line 18)
const items = await page.$$('ul.results li.search-result');

// After - use locator API
const items = page.locator('[data-type="film"]').or(page.locator('.search-result'));

// Better approach: scrape the JSON data if available
// Letterboxd embeds film data in data attributes
```

**`src/browser/pages/film.ts`:**
```typescript
// Before (line 35-40) - finding log button
const logButton = await page.$('a[data-track-action="AddThisFilm"], .add-this-film, [data-js-trigger="log"]');

// After - use text locator
const logButton = page.getByRole('link', { name: /log/i })
  .or(page.getByRole('button', { name: /log/i }));

// Before (line 62-65) - like button
const likeButton = await page.$('.like-link-target, .like-button, [data-action="like"]');

// After
const likeButton = page.getByRole('button', { name: /like/i });
```

**`src/browser/pages/profile.ts`:**
```typescript
// Before (line 28)
const rows = await page.$$('tr.diary-entry-row, .diary-entry');

// After - more specific
const rows = page.locator('section.diary-entries').locator('.diary-entry-row');

// Or use table structure
const rows = page.getByRole('row').filter({ has: page.locator('.film-poster') });
```

### Selector Audit (complete list)

| File | Line | Current Selector | Replacement |
|------|------|-----------------|-------------|
| auth.ts | 10 | `a[href="/sign-in/"]` | `getByRole('link', { name: 'Sign in' })` |
| auth.ts | 18 | `input[name="username"]` | `getByLabel('Username or email')` |
| auth.ts | 19 | `input[name="password"]` | `getByLabel('Password')` |
| auth.ts | 23 | `input[name="remember"]` | `getByLabel('Remember me')` |
| auth.ts | 27 | `input[type="submit"]...` | `getByRole('button', { name: 'Sign in' })` |
| auth.ts | 49 | `a.nav-link[href^="/"]...` | `getByRole('link', { name: username })` |
| film.ts | 35 | Multiple selectors | `getByRole('link', { name: /log/i })` |
| film.ts | 62 | `.like-link-target...` | `getByRole('button', { name: /like/i })` |
| search.ts | 18 | `ul.results li.search-result` | `locator('.search-result')` |
| profile.ts | 28 | `tr.diary-entry-row...` | `locator('.diary-entry-row')` |

---

## 5. Replace sleep() with Proper Waits

### Current State
`sleep()` calls throughout the codebase create unnecessary delays and can still fail if page is slow.

### Strategy
Replace with Playwright's built-in waiting mechanisms:
- `waitFor()` on locators
- `waitForLoadState()`
- `waitForResponse()` for AJAX

### Files to Modify
- `src/browser/auth.ts` - 5 sleep() calls
- `src/browser/pages/film.ts` - ~10 sleep() calls
- `src/browser/pages/search.ts` - 1 sleep() call
- `src/browser/pages/profile.ts` - 3 sleep() calls

### Detailed Changes

**`src/browser/auth.ts`:**
```typescript
// Before (lines 17, 28)
await navigateTo(page, 'https://letterboxd.com/sign-in/');
await sleep(1000);
// ... fill form ...
await page.click('...');
await sleep(2000);

// After
await navigateTo(page, 'https://letterboxd.com/sign-in/');
await page.getByLabel('Username or email').waitFor();
// ... fill form ...
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL(/letterboxd\.com\/((?!sign-in).)*$/, { timeout: 10000 });
```

**`src/browser/pages/film.ts`:**
```typescript
// Before (line 27-29)
await logButton.click();
await sleep(1000);
const dialog = await page.$('.modal-dialog...');

// After
await logButton.click();
const dialog = page.locator('.modal-dialog, [role="dialog"]');
await dialog.waitFor({ state: 'visible', timeout: 5000 });

// Before (line 92-93) - after save
await saveButton.click();
await sleep(1500);

// After
await saveButton.click();
await dialog.waitFor({ state: 'hidden', timeout: 5000 });
// Or wait for success indicator
await page.waitForSelector('.flash-message, .success', { timeout: 5000 }).catch(() => {});
```

**`src/browser/pages/search.ts`:**
```typescript
// Before (line 15)
await navigateTo(page, searchUrl);
await sleep(1000);

// After
await navigateTo(page, searchUrl);
await page.waitForLoadState('networkidle');
// Or wait for results
await page.locator('.search-result').first().waitFor({ timeout: 5000 }).catch(() => {});
```

### Sleep Audit (complete list)

| File | Line | Current | Replacement |
|------|------|---------|-------------|
| auth.ts | 17 | `sleep(1000)` | `waitFor()` on form field |
| auth.ts | 28 | `sleep(2000)` | `waitForURL()` |
| auth.ts | 41 | `sleep(500)` | `waitForLoadState()` |
| auth.ts | 51 | `sleep(500)` | `waitForLoadState()` |
| auth.ts | 64 | `sleep(500)` | `waitForLoadState()` |
| film.ts | 27 | `sleep(500)` | `waitForLoadState()` |
| film.ts | 37 | `sleep(1000)` | Dialog `waitFor()` |
| film.ts | 93 | `sleep(1500)` | Dialog `waitFor({ state: 'hidden' })` |
| film.ts | 121 | `sleep(300)` | Rating widget `waitFor()` |
| film.ts | 134 | `sleep(500)` | Remove (no wait needed) |
| film.ts | 150 | `sleep(500)` | `waitForLoadState()` |
| film.ts | 162 | `sleep(500)` | Remove |
| film.ts | 174 | `sleep(500)` | `waitForLoadState()` |
| film.ts | 186 | `sleep(500)` | Remove |
| search.ts | 15 | `sleep(1000)` | `waitForLoadState('networkidle')` |
| profile.ts | 23 | `sleep(1000)` | `waitForLoadState()` |
| profile.ts | 66 | `sleep(1000)` | `waitForLoadState()` |
| profile.ts | 104 | `sleep(1000)` | `waitForLoadState()` |

---

## 6. Add Retry Logic

### Strategy
Create a wrapper for flaky operations that retries with exponential backoff.

### Files to Add
- `src/utils.ts` - Add retry utility

### Implementation

**Add to `src/utils.ts`:**
```typescript
export interface RetryOptions {
  retries?: number;
  delay?: number;
  backoff?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { retries = 3, delay = 1000, backoff = 2, onRetry } = options;
  
  let lastError: Error;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === retries) {
        throw lastError;
      }
      
      onRetry?.(lastError, attempt);
      
      const waitTime = delay * Math.pow(backoff, attempt - 1);
      await sleep(waitTime);
    }
  }
  
  throw lastError!;
}
```

### Usage in Browser Operations

**`src/browser/pages/film.ts`:**
```typescript
import { retry } from '../utils.js';

export async function logFilm(page: Page, slug: string, options: LogOptions = {}): Promise<void> {
  await retry(async () => {
    await ensureAuthenticated(page);
    await goToFilm(page, slug);
    
    const logButton = page.getByRole('link', { name: /log/i });
    await logButton.waitFor({ timeout: 5000 });
    await logButton.click();
    
    // ... rest of implementation
  }, {
    retries: 3,
    delay: 1000,
    onRetry: (err, attempt) => {
      console.error(`Attempt ${attempt} failed: ${err.message}, retrying...`);
    }
  });
}
```

---

## 7. Fix Username Derivation

### Current State
- `src/commands/watchlist.ts` lines 90-93
- `src/commands/diary.ts` lines 25-28  
- `src/commands/stats.ts` lines 25-28

All use this hacky pattern:
```typescript
const username = config.username?.includes('@') 
  ? config.username.split('@')[0] 
  : config.username;
```

This fails for users whose Letterboxd username differs from their email prefix.

### Solution
Scrape the actual username from the profile after login and store it.

### Files to Modify
- `src/config.ts` - Add `letterboxdUsername` field
- `src/browser/auth.ts` - Scrape username after login
- `src/commands/watchlist.ts` - Use stored username
- `src/commands/diary.ts` - Use stored username
- `src/commands/stats.ts` - Use stored username

### Implementation

**`src/config.ts`:**
```typescript
export interface Config {
  username?: string;           // Login email/username
  letterboxdUsername?: string; // Actual Letterboxd profile username
}

export function getLetterboxdUsername(): string {
  const config = loadConfig();
  if (!config.letterboxdUsername) {
    throw new Error('Username not discovered. Run: letterboxd auth');
  }
  return config.letterboxdUsername;
}
```

**`src/browser/auth.ts`:**
```typescript
export async function login(page: Page): Promise<boolean> {
  // ... existing login code ...
  
  // After successful login, scrape the username
  const profileLink = await page.getByRole('link', { name: 'Profile' })
    .or(page.locator('nav a[href^="/"][href$="/"]'))
    .first();
  
  if (profileLink) {
    const href = await profileLink.getAttribute('href');
    const username = href?.replace(/\//g, '');
    
    if (username) {
      const config = loadConfig();
      config.letterboxdUsername = username;
      saveConfig(config);
    }
  }
  
  return await isAuthenticated(page);
}
```

**Update commands to use `getLetterboxdUsername()`:**
```typescript
// Before
const username = config.username?.includes('@') 
  ? config.username.split('@')[0] 
  : config.username;

// After
import { getLetterboxdUsername } from '../config.js';
const username = getLetterboxdUsername();
```

---

## 8. Add --headed Debug Flag

### Files to Modify
- `src/browser/client.ts` - Accept headless option
- `src/index.ts` - Add global --headed flag
- All command files - Pass through option

### Implementation

**`src/browser/client.ts`:**
```typescript
let browserOptions = {
  headless: true,
};

export function setBrowserOptions(options: { headless?: boolean }): void {
  browserOptions = { ...browserOptions, ...options };
}

export async function getBrowserContext(): Promise<BrowserContext> {
  if (context) return context;
  
  const cookiesDir = getCookiesDir();
  
  context = await chromium.launchPersistentContext(cookiesDir, {
    headless: browserOptions.headless,  // Now configurable
    viewport: { width: 1280, height: 720 },
    userAgent: '...',
  });
  
  return context;
}
```

**`src/index.ts`:**
```typescript
import { setBrowserOptions } from './browser/client.js';

program
  .name('letterboxd')
  .option('--headed', 'Run browser in visible mode for debugging')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.headed) {
      setBrowserOptions({ headless: false });
    }
  });
```

### Usage
```bash
letterboxd --headed log "The Matrix"
letterboxd --headed auth
```

---

## 9. Add Verbose Mode

### Files to Modify
- `src/utils.ts` - Add logger
- `src/browser/client.ts` - Log navigation
- `src/browser/pages/*.ts` - Log actions
- `src/index.ts` - Add --verbose flag

### Implementation

**`src/utils.ts`:**
```typescript
let verboseMode = false;

export function setVerbose(enabled: boolean): void {
  verboseMode = enabled;
}

export function verbose(...args: unknown[]): void {
  if (verboseMode) {
    console.error(chalk.dim('[verbose]'), ...args);
  }
}
```

**`src/browser/client.ts`:**
```typescript
import { verbose } from '../utils.js';

export async function navigateTo(page: Page, url: string): Promise<void> {
  verbose(`Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}
```

**`src/index.ts`:**
```typescript
program
  .option('-v, --verbose', 'Enable verbose logging')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      setVerbose(true);
    }
  });
```

### Usage
```bash
letterboxd -v log "The Matrix"
letterboxd --verbose --headed auth  # Combined
```

---

## 10. Add Tests

### Strategy
Use Vitest for testing with Playwright mocks.

### Files to Add
- `vitest.config.ts`
- `src/__tests__/utils.test.ts`
- `src/__tests__/config.test.ts`
- `src/__tests__/commands/log.test.ts`
- `src/__tests__/integration/auth.test.ts`

### Dependencies
```json
"devDependencies": {
  "vitest": "^1.0.0",
  "@vitest/coverage-v8": "^1.0.0"
}
```

### Implementation

**`vitest.config.ts`:**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
```

**`src/__tests__/utils.test.ts`:**
```typescript
import { describe, it, expect } from 'vitest';
import { slugify, parseRating, formatRating, parseDate } from '../utils.js';

describe('slugify', () => {
  it('converts title to slug', () => {
    expect(slugify('The Dark Knight')).toBe('the-dark-knight');
  });
  
  it('handles apostrophes', () => {
    expect(slugify("Schindler's List")).toBe('schindlers-list');
  });
  
  it('handles special characters', () => {
    expect(slugify('WALL·E')).toBe('wall-e');
  });
});

describe('parseRating', () => {
  it('parses numeric ratings', () => {
    expect(parseRating('4')).toBe(4);
    expect(parseRating('3.5')).toBe(3.5);
  });
  
  it('parses star characters', () => {
    expect(parseRating('★★★★')).toBe(4);
    expect(parseRating('★★★½')).toBe(3.5);
  });
  
  it('clamps to valid range', () => {
    expect(parseRating('10')).toBe(5);
    expect(parseRating('0.1')).toBe(0.5);
  });
});

describe('formatRating', () => {
  it('formats as stars', () => {
    expect(formatRating(4)).toBe('★★★★');
    expect(formatRating(3.5)).toBe('★★★½');
  });
});

describe('parseDate', () => {
  it('handles "today"', () => {
    const result = parseDate('today');
    const today = new Date();
    expect(result?.toDateString()).toBe(today.toDateString());
  });
  
  it('handles "yesterday"', () => {
    const result = parseDate('yesterday');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(result?.toDateString()).toBe(yesterday.toDateString());
  });
  
  it('handles ISO dates', () => {
    const result = parseDate('2024-06-15');
    expect(result?.toISOString().startsWith('2024-06-15')).toBe(true);
  });
});
```

**`package.json` scripts:**
```json
"scripts": {
  "test": "vitest",
  "test:coverage": "vitest --coverage",
  "test:watch": "vitest --watch"
}
```

---

## Implementation Order

| Order | Item | Reason | Dependencies |
|-------|------|--------|--------------|
| 1 | **Verbose mode** | Helps debug all other changes | None |
| 2 | **--headed flag** | Essential for debugging selectors | None |
| 3 | **Replace sleep() with waitFor()** | Foundation for stability | None |
| 4 | **Replace brittle selectors** | Major stability improvement | #2, #3 for testing |
| 5 | **Retry logic** | Handles remaining flakiness | #3, #4 |
| 6 | **Fix username derivation** | Required for profile commands | #4 (selectors) |
| 7 | **Secure credential storage** | Security improvement | None |
| 8 | **Logout command** | Security/UX | #7 |
| 9 | **Env var support** | CI enablement | #7 |
| 10 | **Tests** | Quality assurance | All above |

### Why This Order?

1. **Debug tools first** (#1, #2) - You'll need these to verify all other changes work
2. **Stability core** (#3-5) - These are interdependent; proper waits enable better selectors
3. **Username fix** (#6) - Depends on stable selectors to scrape profile
4. **Security** (#7-9) - Can be done independently but best after core is stable
5. **Tests last** (#10) - Write tests for the final implementation

---

## Estimated Effort

| Item | Hours | Notes |
|------|-------|-------|
| 1. Secure credential storage | 3-4h | Keytar integration, migration |
| 2. Logout command | 0.5h | Simple addition |
| 3. Env var support | 0.5h | Config priority logic |
| 4. Replace selectors | 4-6h | Manual testing required |
| 5. Replace sleep() calls | 2-3h | ~15 replacements |
| 6. Add retry logic | 1h | Utility + integration |
| 7. Fix username derivation | 1h | Config + scraping |
| 8. --headed flag | 0.5h | Simple flag |
| 9. Verbose mode | 1h | Logger + instrumentation |
| 10. Tests | 3-4h | Unit + integration |

**Total: 16-22 hours**

### Suggested Milestones

**v0.2.0-alpha** (8-10h)
- Verbose mode
- --headed flag
- Replace sleep() with proper waits
- Replace critical selectors (auth, log, search)

**v0.2.0-beta** (6-8h)
- All selector replacements
- Retry logic
- Username derivation fix

**v0.2.0** (4-6h)
- Secure credentials (keytar)
- Logout command
- Env var support
- Tests

---

## Breaking Changes

### Credential Storage Migration
- Old: Password in `~/.letterboxd-cli/config.json`
- New: Password in system keychain

**Migration strategy:**
```typescript
// On startup, check for old-style config
const config = loadConfig();
if (config.password) {
  // Migrate to keychain
  await setPassword(config.username!, config.password);
  
  // Remove from file
  delete config.password;
  saveConfig(config);
  
  console.log(chalk.yellow('Migrated credentials to system keychain'));
}
```

### New Config Fields
- `letterboxdUsername` added (scraped from profile)
- `password` removed from file

---

## Notes for Implementation

### Testing Selectors
Before deploying selector changes, test each manually:
```bash
letterboxd --headed --verbose auth
letterboxd --headed --verbose log "The Matrix" --rating 4
letterboxd --headed --verbose diary
```

### Keytar Alternatives
If native compilation is problematic:
- macOS only: Use `security` CLI via child_process
- Cross-platform pure JS: Consider `wincred` + `keychain` separately

### Future Improvements (v0.3)
- API integration (if Letterboxd opens API)
- Offline mode with sync
- Browser profile selection
- Multiple account support
