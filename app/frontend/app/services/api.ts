/**
 * app/frontend/app/services/api.ts
 */

import type { components } from "../types";

export type Ingredient = components["schemas"]["RecipeIngredient"];
export type Recipe = components["schemas"]["Recipe"];
export type User = components["schemas"]["User"];

export class ApiError extends Error {
  status?: number;
  detail?: any;

  constructor(message: string, status?: number, detail?: any) {
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
    if (envBase) return envBase;
  } catch {
    /* ignore */
  }

  const win = typeof window !== "undefined" ? (window as any) : undefined;
  if (win && win.__API_BASE__) return win.__API_BASE__;
  return "http://127.0.0.1:8000";
};

const API_BASE = getBaseUrl().replace(/\/+$/, "");

/* ---------------------------
   Low-level request helpers
   --------------------------- */

async function handleResponse<T>(res: Response): Promise<T> {
  // 1. SPECIFIKUS: Ha 204 No Content, azonnal térjünk vissza üres objektummal.
  if (res.status === 204) {
    return {} as T;
  }

  // 2. BIZTONSÁGOS OLVASÁS: Először szövegként olvassuk ki a body-t.
  // Ez a kulcs a hiba elkerüléséhez! Ha res.json()-t hívsz üres body-n, az dobja a hibát.
  const text = await res.text();

  // 3. HA ÜRES A BODY (akár 200 OK, akár más):
  // Ne próbáljuk meg parszolni, mert az okozza a SyntaxError-t.
  if (!text || text.trim() === "") {
    return {} as T;
  }

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  // 4. SIKERES VÁLASZ (2xx)
  if (res.ok) {
    if (isJson) {
      try {
        return JSON.parse(text) as T;
      } catch (e) {
        console.warn("Server sent JSON header but invalid body:", text);
        return {} as T; // Vagy visszaadhatod a text-et is
      }
    }
    return text as unknown as T;
  }

  // 5. HIBA VÁLASZ (4xx, 5xx)
  let detail: any = text;
  if (isJson) {
    try {
      detail = JSON.parse(text);
    } catch {
      // ignore JSON error on error response
    }
  }

  const msg =
    (detail && (detail.detail || detail.message || JSON.stringify(detail))) ||
    `HTTP ${res.status}`;

  throw new ApiError(String(msg), res.status, detail);
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const merged: RequestInit = {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(opts && (opts.headers as Record<string, string>)),
    },
    ...opts,
  };

  const res = await fetch(url, merged);
  return handleResponse<T>(res);
}

/* ---------------------------
   Error normalizer
   --------------------------- */

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

/* ---------------------------
   Cookie helpers (tokens only)
   --------------------------- */

const COOKIE_ACCESS = "recipe_access_token";
const COOKIE_REFRESH = "recipe_refresh_token";
const COOKIE_EXPIRES_AT = "recipe_access_expires_at";
const PENDING_SAVES_KEY = "recipegen_pending_saves";

type AuthTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};

function setCookie(name: string, value: string, days?: number) {
  try {
    let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/`;
    if (days) {
      const date = new Date();
      date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
      cookie += `; expires=${date.toUTCString()}`;
    }
    document.cookie = cookie;
  } catch {
    // ignore
  }
}

function readCookie(name: string): string | null {
  try {
    if (!document || typeof document.cookie !== "string") return null;
    const cookieString = document.cookie;
    if (!cookieString) return null;

    const parts = cookieString.split(";");
    for (let part of parts) {
      const idx = part.indexOf("=");
      if (idx === -1) continue;
      const rawName = part.slice(0, idx).trim();
      const rawValue = part.slice(idx + 1).trim();
      try {
        if (decodeURIComponent(rawName) === name) {
          return decodeURIComponent(rawValue);
        }
      } catch {
        if (rawName === name) return rawValue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function deleteCookie(name: string) {
  try {
    document.cookie = `${encodeURIComponent(name)}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  } catch {
    // ignore
  }
}

function loadAuth(): AuthTokens | null {
  try {
    const access = readCookie(COOKIE_ACCESS);
    if (!access) return null;
    const refresh = readCookie(COOKIE_REFRESH) ?? undefined;
    const expRaw = readCookie(COOKIE_EXPIRES_AT);
    const expiresAt = expRaw ? Number(expRaw) : undefined;
    return { accessToken: access, refreshToken: refresh, expiresAt };
  } catch {
    return null;
  }
}

function saveAuth(tokens: AuthTokens | null) {
  try {
    if (!tokens) {
      deleteCookie(COOKIE_ACCESS);
      deleteCookie(COOKIE_REFRESH);
      deleteCookie(COOKIE_EXPIRES_AT);
      return;
    }
    setCookie(COOKIE_ACCESS, tokens.accessToken, 7);
    if (tokens.refreshToken) setCookie(COOKIE_REFRESH, tokens.refreshToken, 30);
    if (tokens.expiresAt)
      setCookie(COOKIE_EXPIRES_AT, String(tokens.expiresAt), 7);
  } catch {
    // ignore
  }
}

function clearAuth() {
  try {
    deleteCookie(COOKIE_ACCESS);
    deleteCookie(COOKIE_REFRESH);
    deleteCookie(COOKIE_EXPIRES_AT);
  } catch {
    // ignore
  }
}

/* ---------------------------
   Auth API
   --------------------------- */

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

  const res = await fetch(`${API_BASE}/auth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form.toString(),
    credentials: "same-origin",
  });

  const data = await handleResponse<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>(res);
  const now = Date.now();
  const expiresAt = data.expires_in ? now + data.expires_in * 1000 : undefined;
  const tokens: AuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  };
  saveAuth(tokens);

  try {
    window.dispatchEvent(
      new CustomEvent("auth-changed", { detail: { loggedIn: true } }),
    );
  } catch {
    /* ignore */
  }

  flushLocalSavedRecipes().catch(() => {
    /* ignore */
  });

  return tokens;
}

export async function logout(): Promise<void> {
  const tokens = loadAuth();
  if (tokens?.refreshToken) {
    try {
      await request("/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: tokens.refreshToken }),
      });
    } catch {
      // ignore server errors
    }
  }
  clearAuth();
  try {
    window.dispatchEvent(
      new CustomEvent("auth-changed", { detail: { loggedIn: false } }),
    );
  } catch {
    /* ignore */
  }
}

export async function refreshAccessToken(): Promise<AuthTokens> {
  const tokens = loadAuth();
  if (!tokens?.refreshToken) {
    throw new ApiError("No refresh token available", 401);
  }

  const data = await request<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: tokens.refreshToken }),
  });

  const now = Date.now();
  const expiresAt = data.expires_in ? now + data.expires_in * 1000 : undefined;
  const newTokens: AuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? tokens.refreshToken,
    expiresAt,
  };
  saveAuth(newTokens);
  return newTokens;
}

/* ---------------------------
   Helpers for pending saves
   --------------------------- */

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

  let tokens = loadAuth();
  if (!tokens?.accessToken && tokens?.refreshToken) {
    try {
      tokens = await refreshAccessToken();
    } catch {
      return;
    }
  }

  if (!tokens?.accessToken) return;

  for (const r of pending) {
    try {
      await request("/user/saved-recipes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokens.accessToken}`,
        },
        body: JSON.stringify(r),
      });
    } catch {
      return;
    }
  }

  localStorage.removeItem(PENDING_SAVES_KEY);
}

/* ---------------------------
   Recipe operations
   --------------------------- */

export async function generateRecipe(ingredients: string[]): Promise<Recipe> {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    throw new ApiError("At least one ingredient is required");
  }
  const body = JSON.stringify({ ingredients });
  return request<Recipe>("/recipes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
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

  const doAuthorizedSave = async (accessToken: string) => {
    return request<{ id?: string; savedAt?: string }>("/user/saved-recipes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(toSave),
    });
  };

  let tokens = loadAuth();

  if (tokens?.accessToken) {
    try {
      return await doAuthorizedSave(tokens.accessToken);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 401 &&
        tokens?.refreshToken
      ) {
        try {
          const newTokens = await refreshAccessToken();
          return await doAuthorizedSave(newTokens.accessToken);
        } catch {
          // fallthrough to local save
        }
      }
    }
  }

  savePendingRecipeLocally(toSave as Recipe);
  return { savedLocally: true };
}

export async function getSavedRecipes(): Promise<Recipe[]> {
  const tokens = loadAuth();
  const headers: Record<string, string> = {};
  if (tokens?.accessToken)
    headers.Authorization = `Bearer ${tokens.accessToken}`;
  return request<Recipe[]>("/user/saved-recipes", { method: "GET", headers });
}

export async function getSavedRecipe(id: string): Promise<Recipe> {
  console.log("Fetching saved recipe:", id);
  const tokens = loadAuth();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (tokens?.accessToken)
    headers.Authorization = `Bearer ${tokens.accessToken}`;

  return request<Recipe>(`/user/saved-recipes/${encodeURIComponent(id)}`, {
    method: "GET",
    headers,
  });
}

// ITT VOLT A HIBA: Visszaállítva request használatára
export async function deleteSavedRecipe(id: string): Promise<void> {
  const tokens = loadAuth();
  const headers: Record<string, string> = {};
  if (tokens?.accessToken) {
    headers.Authorization = `Bearer ${tokens.accessToken}`;
  }

  const res = await fetch(
    `${API_BASE}/user/saved-recipes/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers,
    },
  );

  // 2. HA SIKERES (200, 201, 204)
  // Itt a trükk: Nem hívunk se .json()-t, se .text()-et.
  // Egyszerűen nem érdekel minket a válasz tartalma, ha a művelet sikeres volt.
  if (res.ok) {
    return;
  }

  await handleResponse(res);
}

/* ---------------------------
   Misc helpers / user
   --------------------------- */

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
    const tokens = loadAuth();

    const callMe = async (accessToken?: string) => {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      // Közvetlen fetch, mert speciális auth fallback logikája van,
      // de használjuk a biztonságos handleResponse-t
      const res = await fetch(`${API_BASE}/auth/users/me/`, {
        method: "GET",
        headers,
        credentials: "same-origin",
      });
      return handleResponse<{
        username: string;
        email?: string;
        full_name?: string;
      }>(res);
    };

    try {
      if (tokens?.accessToken) {
        try {
          return await callMe(tokens.accessToken);
        } catch (err: any) {
          if (
            err instanceof ApiError &&
            err.status === 401 &&
            tokens?.refreshToken
          ) {
            try {
              const newTokens = await refreshAccessToken();
              return await callMe(newTokens.accessToken);
            } catch {
              // continue
            }
          }
        }
      }

      try {
        const user = await callMe();
        clearAuth();
        try {
          window.dispatchEvent(
            new CustomEvent("auth-changed", { detail: { loggedIn: true } }),
          );
        } catch {
          /* ignore */
        }
        return user;
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  },
};
