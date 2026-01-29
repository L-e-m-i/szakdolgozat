import { useState, useEffect } from "react";
import type { Route } from "./+types/login";
import { Link, useNavigate, useLocation } from "react-router";
import api, { ApiError, formatApiError } from "../services/api";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Bejelentkezés" },
    { name: "description", content: "Bejelentkezés a fiókjába." },
  ];
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  // If a caller provided a `from` location (when redirecting to login),
  // return the user there after successful login. Fallback to /profile.
  type LoginLocationState = { from?: { pathname?: string } | string };
  const state = (location.state as LoginLocationState | undefined) ?? undefined;
  const fromPath =
    state && typeof state.from === "object"
      ? (state.from.pathname ?? "/profile")
      : (state?.from ?? "/profile");

  useEffect(() => {
    (async () => {
      try {
        const user = await api.getCurrentUser();
        console.log("user", user);
        if (user) {
          navigate("/profile");
        }
      } catch {}
    })();
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  type ApiErrorShape = { message: string; code?: string; detail?: any } | null;
  const [error, setError] = useState<ApiErrorShape>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already logged in (tokens present), redirect away from login page.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("recipegen_auth");
      if (raw) {
        navigate(fromPath, { replace: true });
      }
    } catch {
      // ignore localStorage errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function isEmailValid(e: string) {
    // simple email check
    return /\S+@\S+\.\S+/.test(e);
  }

  const canSubmit =
    email.length > 0 && password.length > 0 && isEmailValid(email);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validate inputs client-side before making network requests.
    if (!email || !password) {
      setError({ message: "Töltse ki az összes mezőt." });
      return;
    }
    if (!isEmailValid(email)) {
      setError({ message: "Érvénytelen e-mail cím." });
      return;
    }

    setLoading(true);

    try {
      // Call backend login - the API wrapper stores tokens in localStorage
      const tokens = await api.login(email, password);
      console.log("LOGIN TOKENS:", tokens);

      // Attempt to fetch the current user for debugging / immediate UI needs.
      // Failure here should not block the login flow (treat as non-fatal).
      try {
        const me = await api.getCurrentUser();
        console.log("/auth/users/me/ response:", me);
      } catch (meErr) {
        console.warn("/auth/users/me/ error (non-fatal):", meErr);
      }

      // After successful login, flush any pending local saves (best-effort)
      try {
        await api.flushLocalSavedRecipes();
      } catch (flushErr) {
        // keep as non-fatal; recipes will remain pending
        console.warn("Failed to flush local saved recipes:", flushErr);
      }

      setSuccess("Sikeres bejelentkezés. Átirányítás...");
      // Short delay so user sees the success message
      setTimeout(() => {
        navigate(fromPath, { replace: true });
      }, 600);
    } catch (err: any) {
      console.log(err);
      const normalized = formatApiError(err);
      console.log(normalized);
      // Always store the normalized object so UI can inspect `code`/`detail`
      setError({
        message: normalized.message,
        code: normalized.code,
        detail: normalized.detail,
      });
      console.error("Login error:", err, normalized);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-center text-gray-900">
          Bejelentkezés
        </h1>
        <form onSubmit={handleLogin} className="space-y-6" noValidate>
          <div>
            <label
              htmlFor="email"
              className="text-sm font-medium text-gray-700"
            >
              Email-cím
            </label>
            <input
              type="email"
              id="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
            {!isEmailValid(email) && email.length > 0 && (
              <p className="text-xs text-red-600 mt-1">
                Érvénytelen e-mail cím.
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="password"
              className="text-sm font-medium text-gray-700"
            >
              Jelszó
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error.message}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}

          <button
            type="submit"
            disabled={loading || !canSubmit}
            className={`w-full px-4 py-2 font-semibold text-white ${
              loading || !canSubmit
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            } rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
          >
            {loading ? "Bejelentkezés..." : "Bejelentkezés"}
          </button>
        </form>
        <p className="text-sm text-center text-gray-600">
          Nincs fiókod?{" "}
          <Link
            to="/signup"
            className="font-medium text-blue-600 hover:underline cursor-pointer"
          >
            Regisztrálj
          </Link>
        </p>
      </div>
    </div>
  );
}
