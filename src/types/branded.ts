/**
 * Branded types for type-safe identifiers
 */

/** Film slug - URL-safe identifier like "the-dark-knight" */
declare const FilmSlugBrand: unique symbol;
export type FilmSlug = string & { readonly [FilmSlugBrand]: typeof FilmSlugBrand };

export function toFilmSlug(s: string): FilmSlug {
  const slug = s.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  return slug as FilmSlug;
}

/** Rating: 0.5-5.0 in 0.5 increments */
declare const RatingBrand: unique symbol;
export type Rating = number & { readonly [RatingBrand]: typeof RatingBrand };

export function toRating(n: number): Rating {
  if (n < 0.5 || n > 5 || (n * 2) % 1 !== 0) {
    throw new Error(`Invalid rating: ${n}. Must be 0.5-5.0 in 0.5 increments`);
  }
  return n as Rating;
}

/** Letterboxd username */
declare const UsernameBrand: unique symbol;
export type LetterboxdUsername = string & { readonly [UsernameBrand]: typeof UsernameBrand };

export function toUsername(s: string): LetterboxdUsername {
  return s as LetterboxdUsername;
}
