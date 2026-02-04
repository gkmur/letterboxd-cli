import { describe, it, expect } from 'vitest';
import { parseRating, formatRating, parseDate, formatDate, slugify, truncate } from './utils.js';

describe('parseRating', () => {
  describe('numeric inputs', () => {
    it('parses integer ratings', () => {
      expect(parseRating('3')).toBe(3);
      expect(parseRating('5')).toBe(5);
      expect(parseRating('1')).toBe(1);
    });

    it('parses decimal ratings', () => {
      expect(parseRating('4.5')).toBe(4.5);
      expect(parseRating('2.5')).toBe(2.5);
      expect(parseRating('3.5')).toBe(3.5);
    });

    it('rounds to nearest 0.5', () => {
      expect(parseRating('4.3')).toBe(4.5);
      expect(parseRating('4.2')).toBe(4);
      expect(parseRating('4.7')).toBe(4.5);
      expect(parseRating('4.8')).toBe(5);
    });
  });

  describe('star notation', () => {
    it('parses full stars', () => {
      expect(parseRating('★')).toBe(1);
      expect(parseRating('★★')).toBe(2);
      expect(parseRating('★★★')).toBe(3);
      expect(parseRating('★★★★')).toBe(4);
      expect(parseRating('★★★★★')).toBe(5);
    });

    it('parses half-star notation with full stars', () => {
      // Note: ½ alone returns null (requires at least one ★)
      expect(parseRating('★½')).toBe(1.5);
      expect(parseRating('★★½')).toBe(2.5);
      expect(parseRating('★★★½')).toBe(3.5);
      expect(parseRating('★★★★½')).toBe(4.5);
    });

    it('returns null for half-star alone', () => {
      // The implementation requires at least one ★ for star parsing
      expect(parseRating('½')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('clamps values above 5', () => {
      expect(parseRating('10')).toBe(5);
      expect(parseRating('6')).toBe(5);
      expect(parseRating('100')).toBe(5);
    });

    it('clamps values below 0.5', () => {
      expect(parseRating('0')).toBe(0.5);
      expect(parseRating('0.1')).toBe(0.5);
      expect(parseRating('0.2')).toBe(0.5);
    });

    it('returns null for invalid input', () => {
      expect(parseRating('invalid')).toBeNull();
      expect(parseRating('abc')).toBeNull();
      expect(parseRating('not a number')).toBeNull();
    });

    it('handles strings with extra characters', () => {
      expect(parseRating('4 stars')).toBe(4);
      expect(parseRating('rating: 3.5')).toBe(3.5);
    });
  });
});

describe('formatRating', () => {
  it('formats whole numbers as stars', () => {
    expect(formatRating(1)).toBe('★');
    expect(formatRating(2)).toBe('★★');
    expect(formatRating(3)).toBe('★★★');
    expect(formatRating(4)).toBe('★★★★');
    expect(formatRating(5)).toBe('★★★★★');
  });

  it('formats half ratings', () => {
    expect(formatRating(0.5)).toBe('½');
    expect(formatRating(1.5)).toBe('★½');
    expect(formatRating(2.5)).toBe('★★½');
    expect(formatRating(3.5)).toBe('★★★½');
    expect(formatRating(4.5)).toBe('★★★★½');
  });
});

describe('parseDate', () => {
  it('parses ISO dates', () => {
    const result = parseDate('2026-01-15');
    expect(result).not.toBeNull();
    expect(result?.toISOString().slice(0, 10)).toBe('2026-01-15');
  });

  it('handles "today"', () => {
    const result = parseDate('today');
    const today = new Date().toISOString().slice(0, 10);
    expect(result?.toISOString().slice(0, 10)).toBe(today);
  });

  it('handles "TODAY" (case insensitive)', () => {
    const result = parseDate('TODAY');
    const today = new Date().toISOString().slice(0, 10);
    expect(result?.toISOString().slice(0, 10)).toBe(today);
  });

  it('handles "yesterday"', () => {
    const result = parseDate('yesterday');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(result?.toISOString().slice(0, 10)).toBe(yesterday.toISOString().slice(0, 10));
  });

  it('handles "YESTERDAY" (case insensitive)', () => {
    const result = parseDate('YESTERDAY');
    expect(result).not.toBeNull();
  });

  it('returns null for invalid dates', () => {
    expect(parseDate('not-a-date')).toBeNull();
    expect(parseDate('invalid')).toBeNull();
  });

  it('parses various date formats', () => {
    // Month name format
    const result = parseDate('January 15, 2026');
    expect(result).not.toBeNull();
  });
});

describe('formatDate', () => {
  it('formats dates as YYYY-MM-DD', () => {
    const date = new Date('2026-01-15T12:00:00Z');
    expect(formatDate(date)).toBe('2026-01-15');
  });

  it('handles single-digit months and days with padding', () => {
    const date = new Date('2026-03-05T12:00:00Z');
    expect(formatDate(date)).toBe('2026-03-05');
  });
});

describe('slugify', () => {
  it('converts titles to lowercase slugs', () => {
    expect(slugify('The Dark Knight')).toBe('the-dark-knight');
  });

  it('handles special characters', () => {
    expect(slugify('Dune: Part Two')).toBe('dune-part-two');
  });

  it('removes apostrophes', () => {
    expect(slugify("Ocean's Eleven")).toBe('oceans-eleven');
    expect(slugify("It's a Wonderful Life")).toBe('its-a-wonderful-life');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('A - B - C')).toBe('a-b-c');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  The Film  ')).toBe('the-film');
  });
});

describe('truncate', () => {
  it('returns string unchanged if under max length', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('truncates with ellipsis at max length', () => {
    expect(truncate('this is a long string', 10)).toBe('this is a…');
  });

  it('handles exact max length', () => {
    expect(truncate('exactly', 7)).toBe('exactly');
  });
});
