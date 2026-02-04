# letterboxd-cli

[![npm version](https://img.shields.io/npm/v/@gkmur/letterboxd-cli.svg)](https://www.npmjs.com/package/@gkmur/letterboxd-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

CLI tool for [Letterboxd](https://letterboxd.com) — log films, manage your watchlist, view diary and stats.

Since Letterboxd's official API isn't available for personal use, this CLI uses browser automation (Playwright) to interact with the web UI.

## Installation

```bash
# From npm (when published)
npm install -g @gkmur/letterboxd-cli

# From source
git clone https://github.com/gkmur/letterboxd-cli.git
cd letterboxd-cli
npm install
npm run build
npm link
```

## Quick Start

```bash
# Set up authentication
letterboxd auth

# Search for a film
letterboxd search "The Dark Knight"

# Log a film
letterboxd log "Anora" --rating 4.5 --liked

# Quick rate without full log
letterboxd rate "Nosferatu" 4

# Manage watchlist
letterboxd watchlist add "Sinners"
letterboxd watchlist remove "Sinners"
letterboxd watchlist list

# View diary
letterboxd diary
letterboxd diary --month 2026-01

# View stats
letterboxd stats
```

## Commands

### `letterboxd auth`

Check authentication status or set up credentials. On first run, prompts for your Letterboxd email and password.

Credentials are stored in `~/.letterboxd-cli/config.json` (chmod 600).

```bash
letterboxd auth
letterboxd auth --json
```

### `letterboxd search <query>`

Search for films on Letterboxd.

```bash
letterboxd search "The Brutalist"
letterboxd search "Dark Knight" --limit 5
letterboxd search "Dune" --json
```

### `letterboxd log <film>`

Log a film to your diary with optional rating, liked status, date, and review.

```bash
# Basic log
letterboxd log "Anora"

# With rating and liked
letterboxd log "The Brutalist" --rating 5 --liked

# With specific date
letterboxd log "Nosferatu" -r 4 -d 2026-01-15

# Full log with review
letterboxd log "Conclave" --rating 4 --liked --review "Great performances" --date yesterday
```

Options:
- `-r, --rating <rating>` — Rating from 0.5 to 5.0 (supports decimals, stars: ★★★★)
- `-l, --liked` — Mark as liked (❤️)
- `-d, --date <date>` — Watch date (YYYY-MM-DD, "today", "yesterday")
- `--review <text>` — Add a review
- `--rewatch` — Mark as a rewatch
- `--spoilers` — Mark review as containing spoilers
- `--json` — Output as JSON

### `letterboxd rate <film> <rating>`

Quick rate a film without creating a full diary entry.

```bash
letterboxd rate "Wicked" 3.5
letterboxd rate "Dune Part Two" 5 --json
```

### `letterboxd watchlist`

Manage your watchlist.

```bash
# Add to watchlist
letterboxd watchlist add "Sinners"

# Remove from watchlist
letterboxd watchlist remove "Sinners"

# List watchlist
letterboxd watchlist list
letterboxd watchlist list --json
```

### `letterboxd diary`

View your diary entries.

```bash
# Recent entries
letterboxd diary

# Filter by month
letterboxd diary --month 2026-01

# JSON output
letterboxd diary --json
```

### `letterboxd stats`

View your profile stats.

```bash
letterboxd stats
letterboxd stats --json
```

## Output Formats

All commands support `--json` for structured JSON output, useful for scripting:

```bash
# Example: Get film slugs from search
letterboxd search "Dark Knight" --json | jq '.results[].slug'

# Example: Count watchlist items
letterboxd watchlist list --json | jq '.items | length'
```

## Configuration

Configuration is stored in `~/.letterboxd-cli/`:

- `config.json` — Credentials (username/password)
- `cookies/` — Browser session cookies (persistent login)

The config file is created with restricted permissions (chmod 600) to protect your credentials.

## How It Works

Since Letterboxd's API is not available for personal use, this CLI uses [Playwright](https://playwright.dev/) to automate browser interactions:

1. A headless Chromium browser is launched
2. Session cookies are persisted in `~/.letterboxd-cli/cookies/`
3. The CLI navigates to Letterboxd pages and interacts with the UI
4. Login happens automatically when needed

First run may be slower while Playwright downloads browser binaries.

## Technical Highlights

- **Secure credential storage** — Passwords stored in system keychain via [keytar](https://github.com/atom/node-keytar), never in plaintext config files
- **Resilient browser automation** — Playwright locators with `.or()` fallback chains handle HTML changes gracefully
- **Type-safe identifiers** — Branded TypeScript types (`FilmSlug`, `Rating`) prevent common bugs at compile time
- **Persistent sessions** — Cookies saved to disk for fast repeated use without re-authentication

## Ratings

Ratings use Letterboxd's 0.5–5.0 scale in 0.5 increments:

- `0.5`, `1`, `1.5`, `2`, `2.5`, `3`, `3.5`, `4`, `4.5`, `5`
- Star notation: `★★★★` (4 stars), `★★★★½` (4.5 stars)

## Film Slugs

Films are identified by their URL slug (lowercase, hyphenated):

- "The Dark Knight" → `the-dark-knight`
- "Dune: Part Two" → `dune-part-two`
- "Amélie" → `amelie`

When you search or specify a film by name, the CLI automatically finds the correct slug.

## Requirements

- Node.js 18+
- Playwright (installed automatically)

## License

MIT

## Credits

Built with:
- [Commander.js](https://github.com/tj/commander.js) — CLI framework
- [Playwright](https://playwright.dev/) — Browser automation
- [Chalk](https://github.com/chalk/chalk) — Terminal styling
- [Ora](https://github.com/sindresorhus/ora) — Spinner

---

**Note:** This is an unofficial tool. Use responsibly and respect Letterboxd's terms of service.
