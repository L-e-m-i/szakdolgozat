/**
 * app/frontend/app/types/index.ts
 *
 * Shared TypeScript types for frontend <-> backend models.
 *
 * NOTE:
 * - These types are intended to be the single source of truth on the frontend.
 * - When you generate types from the backend OpenAPI schema, overwrite or
 *   augment this file (or place generated types in a `generated/` file and
 *   re-export them from here).
 *
 * Keep these types minimal and aligned to the backend Pydantic/OpenAPI models:
 * - `User` matches the backend auth user shape (username, email, full_name, disabled)
 * - `Recipe` and `Ingredient` represent the canonical recipe payload used by the API
 *   (title, ingredients, steps). Additional optional metadata used by the UI
 *   (id, imageUrl, description, savedAt) are present as optional fields.
 */

// Re-export generated OpenAPI types so other modules can import from "./types".
// This makes imports cleaner (e.g. `import type { components } from "../types"`)
// and keeps the generated file as an implementation detail.
export type { components } from "./generated-api";
export * from "./generated-api";

/* Ingredient: canonical shape returned/accepted by backend endpoints */
export type Ingredient = {
  name: string;
  // Backend primary field for amount
  amount?: string;
  // Some legacy shapes or frontend code historically used `quantity`.
  // Keep this for backwards compatibility while normalising at call sites.
  quantity?: string;
};

/* Recipe: canonical recipe shape used by the API */
export type Recipe = {
  // Primary user-visible title (backend uses `title`)
  title?: string;

  // Legacy frontend compatibility: `name` may appear in older records
  name?: string;

  // Optional thumbnail URL (not always present)
  imageUrl?: string;

  // Ingredients list (backend returns an array of Ingredient)
  ingredients: Ingredient[];

  // Preparation steps as an ordered array
  steps: string[];

  // Optional metadata that the backend may attach when saved
  id?: number;
  savedAt?: string;

  // Optional short description — not always produced by the backend generator,
  // but useful in the UI. Prefer generating from `steps` when absent.
  description?: string;
};

/* SavedRecipe: UI convenience type. Use Recipe directly for API calls. */
export type SavedRecipe = Recipe;

/* User: shape returned by auth endpoints (FastAPI / Pydantic models) */
export type User = {
  username: string;
  email?: string;
  full_name?: string;
  // Backend sometimes maps `is_active` -> `disabled` on Pydantic models; keep optional.
  disabled?: boolean;

  // UI friendliness: some parts of the frontend used `name`. Include optionally.
  name?: string;
};

/* Authentication tokens and expiry metadata */
export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  // RFC3339 timestamp when access token expires (optional)
  expiresAt?: string;
};

/* Standardized API error shape used across the frontend */
export type ApiErrorShape = {
  message: string;
  code?: string;
  detail?: any;
};

/**
 * Utility: Normalize an incoming "raw" recipe-like object into our canonical
 * `Recipe` shape before using it in typed contexts. The implementation of a
 * runtime normalizer belongs in a utils module (not in this types file).
 *
 * Example (pseudo):
 *   const normalized = normalizeRecipe(raw);
 *   // normalized is now a `Recipe`
 *
 * The goal of generating types from OpenAPI is to remove duplicate definitions
 * and ensure frontend types always match the backend. After adding OpenAPI
 * generation, replace this file (or re-export generated types here).
 */
