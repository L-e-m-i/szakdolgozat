/**
 * app/frontend/app/services/api.ts
 */

import type { components } from "../types";

export type Ingredient = components["schemas"]["RecipeIngredient"];
export type Recipe = components["schemas"]["Recipe"];
export type User = components["schemas"]["User"];

export class ApiError extends Error {
  status?: number;
  detail?: unknown;

  constructor(message: string, status?: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

const getBaseUrl = (): string => {
  try {
    // @ts-ignore
    const envBase = (import.meta as any)?.env?.VITE_API_BASE_URL;
    if (envBase) {
      // In browser context, normalize known local-dev mismatches that break cookies.
      if (typeof window !== "undefined") {
        try {
          const parsed = new URL(envBase);
          // Docker service hostnames are not reachable from the browser.
          if (parsed.hostname === "backend") {
            parsed.hostname = window.location.hostname || "localhost";
          }
          // Keep same-site host for cookie transport in localhost dev.
          if (window.location.hostname === "localhost" && parsed.hostname === "127.0.0.1") {
            parsed.hostname = "localhost";
          }
          return parsed.toString().replace(/\/+$/, "");
        } catch {
          // fall through to raw env value
        }
      }
      return envBase;
    }
  } catch {
    // ignore
  }

  const win = typeof window !== "undefined" ? (window as any) : undefined;
  if (win && win.__API_BASE__) return win.__API_BASE__;
  return "http://localhost:8000";
};

const API_BASE = getBaseUrl().replace(/\/+$/, "");
const PENDING_SAVES_KEY = "recipegen_pending_saves";
// Pending saves expire after 24 hours for security
const PENDING_SAVES_TTL_MS = 24 * 60 * 60 * 1000;

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return {} as T;
  }

  const text = await res.text();
  if (!text || text.trim() === "") {
    return {} as T;
  }

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (res.ok) {
    if (isJson) {
      try {
        return JSON.parse(text) as T;
      } catch {
        return {} as T;
      }
    }
    return text as unknown as T;
  }

  let detail: unknown = text;
  if (isJson) {
    try {
      detail = JSON.parse(text);
    } catch {
      // ignore parse error for error body
    }
  }

  const msg =
    (detail &&
      typeof detail === "object" &&
      (((detail as any).detail as string) ||
        ((detail as any).message as string) ||
        JSON.stringify(detail))) ||
    `HTTP ${res.status}`;

  throw new ApiError(String(msg), res.status, detail);
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const merged: RequestInit = {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(opts?.headers as Record<string, string> | undefined),
    },
    ...opts,
  };

  const res = await fetch(url, merged);
  return handleResponse<T>(res);
}

export function formatApiError(err: any): {
  message: string;
  code?: string;
  detail?: any;
} {
  if (!err) return { message: "An unexpected error occurred." };

  if (err instanceof ApiError) {
    if (err.detail && typeof err.detail === "object") {
      const d = err.detail as any;
      const message =
        d.message || d.detail || d.error || err.message || "An error occurred";
      const code = d.code as string | undefined;
      return { message: String(message), code, detail: d };
    }
    if (err.detail && typeof err.detail === "string") {
      return { message: err.detail, detail: err.detail };
    }
    return { message: err.message || "An error occurred", detail: err.detail };
  }

  if (typeof err === "object") {
    const explicit = err.message || err.error || err.detail || err.msg;
    const message =
      explicit !== undefined && explicit !== null
        ? String(explicit)
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return String(err);
            }
          })();
    return { message, detail: err, code: err.code };
  }

  if (typeof err === "string") return { message: err };
  try {
    return { message: String(err) };
  } catch {
    return { message: "An error occurred" };
  }
}

export async function signup(
  username: string,
  email: string,
  password: string,
  fullName?: string,
) {
  const body = JSON.stringify({
    username,
    email,
    password,
    full_name: fullName,
  });
  return request("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

export async function login(
  username: string,
  password: string,
): Promise<void> {
  const form = new URLSearchParams();
  form.set("username", username);
  form.set("password", password);

  await request<{
    access_token?: string;
    expires_in?: number;
  }>("/auth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  try {
    window.dispatchEvent(
      new CustomEvent("auth-changed", { detail: { loggedIn: true } }),
    );
  } catch {
    // ignore
  }

  flushLocalSavedRecipes().catch(() => {
    // ignore
  });

}

export async function logout(): Promise<void> {
  try {
    await request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {
    // ignore server errors on logout
  }

  try {
    window.dispatchEvent(
      new CustomEvent("auth-changed", { detail: { loggedIn: false } }),
    );
  } catch {
    // ignore
  }
}

export async function refreshAccessToken(): Promise<void> {
  await request<{
    access_token?: string;
    expires_in?: number;
  }>("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

}

function savePendingRecipeLocally(recipe: Recipe) {
  try {
    const raw = localStorage.getItem(PENDING_SAVES_KEY);
    let pending: { recipe: Recipe; expiresAt: number }[] = [];
    
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Migrate old format (array of recipes) to new format with TTL
          pending = parsed
            .filter((r) => r && typeof r === "object")
            .map((r) => ({
              recipe: r as Recipe,
              expiresAt: Date.now() + PENDING_SAVES_TTL_MS,
            }));
        } else if (parsed && Array.isArray(parsed.recipes)) {
          pending = parsed.recipes;
        }
      } catch {
        // Invalid JSON, start fresh
        pending = [];
      }
    }
    
    pending.push({
      recipe,
      expiresAt: Date.now() + PENDING_SAVES_TTL_MS,
    });
    
    localStorage.setItem(PENDING_SAVES_KEY, JSON.stringify({ recipes: pending }));
  } catch {
    // best-effort
  }
}

export async function flushLocalSavedRecipes(): Promise<void> {
  const pendingRaw = localStorage.getItem(PENDING_SAVES_KEY);
  if (!pendingRaw) return;

  let pending: { recipe: Recipe; expiresAt: number }[] = [];
  try {
    const parsed = JSON.parse(pendingRaw);
    if (parsed && Array.isArray(parsed.recipes)) {
      // New format with TTL
      const now = Date.now();
      pending = parsed.recipes.filter((item: { recipe: Recipe; expiresAt: number }) => {
        if (item.expiresAt < now) {
          // Expired - don't include
          return false;
        }
        return true;
      });
      
      // Remove expired items from storage
      if (pending.length !== parsed.recipes.length) {
        localStorage.setItem(PENDING_SAVES_KEY, JSON.stringify({ recipes: pending }));
      }
    } else if (Array.isArray(parsed)) {
      // Migrate old format
      pending = parsed
        .filter((r) => r && typeof r === "object")
        .map((r: Recipe) => ({
          recipe: r,
          expiresAt: Date.now() + PENDING_SAVES_TTL_MS,
        }));
    }
  } catch {
    localStorage.removeItem(PENDING_SAVES_KEY);
    return;
  }

  if (!Array.isArray(pending) || pending.length === 0) {
    localStorage.removeItem(PENDING_SAVES_KEY);
    return;
  }

  for (const { recipe } of pending) {
    try {
      await request("/user/saved-recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        try {
          await refreshAccessToken();
          await request("/user/saved-recipes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(recipe),
          });
        } catch {
          return;
        }
      } else {
        return;
      }
    }
  }

  localStorage.removeItem(PENDING_SAVES_KEY);
}

/**
 * Clean up expired pending recipes without attempting to save them.
 * Call this on app initialization to remove stale data.
 */
export function cleanupExpiredPendingRecipes(): void {
  const pendingRaw = localStorage.getItem(PENDING_SAVES_KEY);
  if (!pendingRaw) return;

  try {
    const parsed = JSON.parse(pendingRaw);
    if (parsed && Array.isArray(parsed.recipes)) {
      const now = Date.now();
      const nonExpired = parsed.recipes.filter(
        (item: { recipe: Recipe; expiresAt: number }) => item.expiresAt >= now
      );
      
      if (nonExpired.length !== parsed.recipes.length) {
        if (nonExpired.length === 0) {
          localStorage.removeItem(PENDING_SAVES_KEY);
        } else {
          localStorage.setItem(PENDING_SAVES_KEY, JSON.stringify({ recipes: nonExpired }));
        }
      }
    }
  } catch {
    // Invalid data, just clear it
    localStorage.removeItem(PENDING_SAVES_KEY);
  }
}

// Auto-cleanup on module load (app initialization)
if (typeof window !== "undefined") {
  cleanupExpiredPendingRecipes();
}

type RecipeModelChoice = "scratch" | "finetuned" | "gemini";

export async function generateRecipe(
  ingredients: string[],
  models: RecipeModelChoice[] = ["finetuned"],
): Promise<Recipe[]> {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    throw new ApiError("At least one ingredient is required");
  }

  if (!Array.isArray(models) || models.length < 1 || models.length > 3) {
    throw new ApiError("Select between 1 and 3 models");
  }

  return request<Recipe[]>("/recipes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ingredients, models }),
  });
}

export async function saveRecipe(
  recipe: Recipe,
): Promise<{ id?: string; savedAt?: string } | { savedLocally: true }> {
  const toSave = {
    title: recipe.title ?? `Recipe (${new Date().toISOString()})`,
    ingredients: recipe.ingredients ?? [],
    steps: recipe.steps ?? [],
  };

  try {
    return await request<{ id?: string; savedAt?: string }>("/user/saved-recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toSave),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      try {
        await refreshAccessToken();
        return await request<{ id?: string; savedAt?: string }>("/user/saved-recipes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toSave),
        });
      } catch {
        savePendingRecipeLocally(toSave as Recipe);
        return { savedLocally: true };
      }
    }

    savePendingRecipeLocally(toSave as Recipe);
    return { savedLocally: true };
  }
}

export async function getSavedRecipes(): Promise<Recipe[]> {
  return request<Recipe[]>("/user/saved-recipes", { method: "GET" });
}

export async function getSavedRecipe(id: string): Promise<Recipe> {
  return request<Recipe>(`/user/saved-recipes/${encodeURIComponent(id)}`, {
    method: "GET",
  });
}

export async function deleteSavedRecipe(id: string): Promise<void> {
  await request(`/user/saved-recipes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export default {
  generateRecipe,
  saveRecipe,
  getSavedRecipes,
  getSavedRecipe,
  deleteSavedRecipe,
  createDatabase: async () =>
    request<{ detail: string }>("/admin/db/create", { method: "POST" }),
  tryGenerate: async (ings: string[]) => {
    try {
      const recipe = await generateRecipe(ings);
      return { ok: true, recipe };
    } catch (err) {
      if (err instanceof ApiError)
        return { ok: false, error: err.detail ?? err.message };
      return { ok: false, error: (err as Error).message ?? String(err) };
    }
  },
  signup,
  login,
  logout,
  refreshAccessToken,
  flushLocalSavedRecipes,
  formatApiError,
  getCurrentUser: async function (): Promise<{
    username: string;
    email?: string;
    full_name?: string;
  } | null> {
    const callMe = async () => {
      return request<{
        username: string;
        email?: string;
        full_name?: string;
      }>("/auth/users/me/", {
        method: "GET",
      });
    };

    try {
      try {
        return await callMe();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await refreshAccessToken();
          return await callMe();
        }
        return null;
      }
    } catch {
      return null;
    }
  },
};
