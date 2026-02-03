/**
 * Utility functions for letterboxd-cli
 */

/**
 * Convert a film title to a Letterboxd URL slug
 * "The Dark Knight" → "the-dark-knight"
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, '')           // Remove apostrophes
    .replace(/[^a-z0-9\s-]/g, '')   // Remove special chars
    .replace(/\s+/g, '-')           // Spaces to hyphens
    .replace(/-+/g, '-')            // Collapse multiple hyphens
    .replace(/^-|-$/g, '');         // Trim leading/trailing hyphens
}

/**
 * Parse a rating string to a number (0.5-5.0 in 0.5 increments)
 */
export function parseRating(input: string): number | null {
  // Handle star characters
  const starCount = (input.match(/★/g) || []).length;
  const halfStar = input.includes('½');
  if (starCount > 0) {
    return Math.min(5, starCount + (halfStar ? 0.5 : 0));
  }

  // Handle numeric input
  const num = parseFloat(input.replace(/[^\d.]/g, ''));
  if (isNaN(num)) return null;
  
  // Clamp and round to nearest 0.5
  const clamped = Math.min(5, Math.max(0.5, num));
  return Math.round(clamped * 2) / 2;
}

/**
 * Format a rating as stars
 */
export function formatRating(rating: number): string {
  const fullStars = Math.floor(rating);
  const halfStar = rating % 1 !== 0;
  return '★'.repeat(fullStars) + (halfStar ? '½' : '');
}

/**
 * Format a date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Parse a date string (various formats) to Date
 */
export function parseDate(input: string): Date | null {
  // Handle "today", "yesterday"
  const lower = input.toLowerCase();
  if (lower === 'today') return new Date();
  if (lower === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }

  // Try parsing as date
  const parsed = new Date(input);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Truncate a string to a max length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '…';
}
