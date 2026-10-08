/**
 * Shared API contracts — the single source of truth for frontend/backend shapes.
 *
 * These types mirror the PHP API responses. When the backend changes a field,
 * update it here first, then fix the compile errors. That's the whole point:
 * the `photoAccess` vs `photosVisibility` bug becomes a build failure, not a
 * production incident.
 *
 * Migration path: rename .js → .ts file by file. Start with lib/api/*,
 * then components, then pages. `allowJs: true` means mixed codebases compile.
 */

// ─── Auth ────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  role: 'member' | 'guardian' | 'matchmaker' | 'admin';
}

export interface AuthResponse {
  user: User;
  /** @deprecated Prefer the HttpOnly cookie; this is for backward compat. */
  token: string;
}

// ─── Profiles ────────────────────────────────────────────────────────────────
export type PhotoVisibility = 'public' | 'members' | 'request' | 'match' | 'private';
export type ProfileVisibility = 'public' | 'members' | 'private';

export interface Profile {
  id: string;
  displayName: string;
  age: number | null;
  gender: string | null;
  city: string | null;
  country: string | null;
  sect: string | null;
  profession: string | null;
  bio: string | null;
  /** Canonical field. NEVER use `photoAccess` — it doesn't exist on the API. */
  photosVisibility: PhotoVisibility;
  photosLocked: boolean;
  /** Gated photo URL, or null when locked/hidden. */
  photo: string | null;
  is_verified: boolean;
  // Filterable fields
  religiosity: string | null;
  educationLevel: string | null;
  marja: string | null;
  prayer: string | null;
  languages: string | null;
}

export interface ProfileListResponse {
  profiles: Profile[];
  total: number;
}

// ─── Compatibility ───────────────────────────────────────────────────────────
export interface CompatibilityScore {
  overall: number;
  breakdown: {
    values: number;
    lifestyle: number;
    faith: number;
    timeline: number;
  };
  reasons: string[];
  topReason: string;
}

export interface CompatibilityResponse {
  score: CompatibilityScore | null;
  reason?: string;
}

// ─── Blog ────────────────────────────────────────────────────────────────────
export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  image_url: string | null;
  category: string;
  read_time: string;
  published_at: string | null;
}

// ─── API errors ──────────────────────────────────────────────────────────────
export interface ApiError {
  error: string;
}
