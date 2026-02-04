# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A CLI tool for Letterboxd that uses browser automation (Playwright) because Letterboxd's API isn't publicly available. Users can log films, manage watchlists, view diary entries, and see stats from their terminal.

## Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run dev            # Run directly with tsx (no build needed)
npm run dev -- search "Dark Knight"  # Run with args
npm run dev -- --debug search "Anora"  # Debug mode: headed browser + verbose logs
npm link               # Create global 'letterboxd' command after building
```

## Architecture

```
src/
├── index.ts              # CLI entry (Commander setup)
├── config.ts             # Credentials & keychain integration
├── types/
│   └── branded.ts        # Type-safe FilmSlug, Rating, LetterboxdUsername
├── browser/
│   ├── client.ts         # Playwright context lifecycle
│   ├── auth.ts           # Login/session management
│   └── pages/            # Page-specific automation
│       ├── search.ts     # Film search
│       ├── film.ts       # Film actions (log, rate, watchlist)
│       └── profile.ts    # Diary, stats, watchlist list
├── commands/             # CLI command handlers (thin wrappers)
└── utils/
    ├── logger.ts         # Debug logging
    └── retry.ts          # withRetry() for flaky operations
```

**Data flow**: Command handler → browser/pages/ function → Playwright page interactions → formatted output

## Key Patterns

### Playwright Locators
Always use semantic locators with `.or()` fallback chains, not raw CSS selectors:
```typescript
const button = page.getByRole('link', { name: /log|review/i })
  .or(page.locator('a[data-track-action="AddThisFilm"]'))
  .or(page.locator('.add-this-film'));
```

### Branded Types
Use typed wrappers for compile-time safety:
- `FilmSlug` - URL slugs like "the-dark-knight"
- `Rating` - Enforces 0.5-5.0 scale in 0.5 increments
- `LetterboxdUsername` - Tagged username type

### Command Structure
Commands follow this pattern:
1. Validate input / parse options
2. Create spinner with ora
3. Get page via `getPage()`
4. Call browser/pages/ functions
5. Output text or JSON
6. Always call `closeBrowser()` in finally block

### Credential Storage
- Config: `~/.letterboxd-cli/config.json` (chmod 600)
- Passwords: System keychain via keytar (not plaintext)
- Cookies: `~/.letterboxd-cli/cookies/` for session persistence

## Debugging

Use `--debug` flag to run with visible browser and verbose logging:
```bash
npm run dev -- --debug log "Anora" --rating 4
```

Debug output uses `debug()` from `src/utils/logger.ts`.
