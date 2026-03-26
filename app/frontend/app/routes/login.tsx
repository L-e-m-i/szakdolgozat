import { useState, useEffect } from "react";
import type { Route } from "./+types/login";
import { Link, useNavigate, useLocation } from "react-router";
import api, { formatApiError } from "../services/api";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Log In" },
    { name: "description", content: "Log in to your account." },
  ];
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine where to redirect after successful login
  type LoginLocationState = { from?: { pathname?: string } | string };
  const state = (location.state as LoginLocationState | undefined) ?? undefined;
  const fromPath =
    state && typeof state.from === "object"
      ? (state.from.pathname ?? "/profile")
      : (state?.from ?? "/profile");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  type ApiErrorShape = { message: string; code?: string; detail?: any } | null;
  const [error, setError] = useState<ApiErrorShape>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Check if already logged in (client-side only to avoid SSR mismatch)
  useEffect(() => {
    (async () => {
      try {
        const user = await api.getCurrentUser();
        if (user) {
          navigate(fromPath, { replace: true });
        }
      } catch {
        // ignore
      }
    })();
  }, [fromPath, navigate]);

  function isEmailValid(e: string) {
    return /\S+@\S+\.\S+/.test(e);
  }

  const canSubmit =
    email.length > 0 && password.length > 0 && isEmailValid(email);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password) {
      setError({ message: "Please fill in all fields." });
      return;
    }
    if (!isEmailValid(email)) {
      setError({ message: "Invalid email address." });
      return;
    }

    setLoading(true);

    try {
      await api.login(email, password);

      // After successful login, flush any pending local saves (best-effort)
      try {
        await api.flushLocalSavedRecipes();
      } catch (flushErr) {
        console.warn("Failed to flush local saved recipes:", flushErr);
      }

      setSuccess("Successfully logged in. Redirecting...");
      setTimeout(() => {
        navigate(fromPath, { replace: true });
      }, 600);
    } catch (err: any) {
      const normalized = formatApiError(err);
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
          Log In
        </h1>
        <form onSubmit={handleLogin} className="space-y-6" noValidate>
          <div>
            <label
              htmlFor="email"
              className="text-sm font-medium text-gray-700"
            >
              Email Address
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
                Invalid email address.
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="password"
              className="text-sm font-medium text-gray-700"
            >
              Password
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
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>
        <p className="text-sm text-center text-gray-600">
          Don't have an account?{" "}
          <Link
            to="/signup"
            className="font-medium text-blue-600 hover:underline cursor-pointer"
          >
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
