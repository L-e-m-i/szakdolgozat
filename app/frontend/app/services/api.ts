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

type AuthTokens = {
  accessToken?: string;
  expiresAt?: number;
};

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
): Promise<AuthTokens> {
  const form = new URLSearchParams();
  form.set("username", username);
  form.set("password", password);

  const data = await request<{
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

  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
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

export async function refreshAccessToken(): Promise<AuthTokens> {
  const data = await request<{
    access_token?: string;
    expires_in?: number;
  }>("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

function savePendingRecipeLocally(recipe: Recipe) {
  try {
    const raw = localStorage.getItem(PENDING_SAVES_KEY);
    const arr: Recipe[] = raw ? JSON.parse(raw) : [];
    arr.push(recipe);
    localStorage.setItem(PENDING_SAVES_KEY, JSON.stringify(arr));
  } catch {
    // best-effort
  }
}

export async function flushLocalSavedRecipes(): Promise<void> {
  const pendingRaw = localStorage.getItem(PENDING_SAVES_KEY);
  if (!pendingRaw) return;

  let pending: Recipe[] = [];
  try {
    pending = JSON.parse(pendingRaw);
  } catch {
    localStorage.removeItem(PENDING_SAVES_KEY);
    return;
  }

  if (!Array.isArray(pending) || pending.length === 0) {
    localStorage.removeItem(PENDING_SAVES_KEY);
    return;
  }

  for (const recipe of pending) {
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

export async function generateRecipe(ingredients: string[]): Promise<Recipe> {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    throw new ApiError("At least one ingredient is required");
  }

  return request<Recipe>("/recipes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ingredients }),
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
