import { useState, useEffect } from "react";
import type { Route } from "./+types/signup";
import { Link, useNavigate, useLocation } from "react-router";
import api, { formatApiError } from "../services/api";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Sign Up" },
    { name: "description", content: "Create a new account." },
  ];
}

type ApiErrorShape = { message: string; code?: string; detail?: any } | null;
type FieldErrors = { username?: string | null; email?: string | null };

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine where to redirect after signup
  type LocationState = { from?: { pathname?: string } | string } | undefined;
  const locState = (location.state as LocationState) ?? undefined;
  const fromPath =
    locState && typeof locState.from === "object"
      ? (locState.from.pathname ?? "/profile")
      : (locState?.from ?? "/profile");

  // Form fields
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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

  // UI state
  const [error, setError] = useState<ApiErrorShape>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Username validation: alphanumeric + underscores, 3-30 chars
  const isUsernameValid = (u: string) => /^[A-Za-z0-9_]{3,30}$/.test(u);

  // Email validation
  const isEmailValid = (e: string) => /\S+@\S+\.\S+/.test(e);

  /**
   * Password validation according to security requirements (Option A):
   * - Minimum 8 characters
   * - At least 1 uppercase letter
   * - At least 1 lowercase letter
   * - At least 1 number
   */
  function validatePassword(pw: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (pw.length < 8) {
      errors.push("Password must be at least 8 characters long");
    }
    if (!/[A-Z]/.test(pw)) {
      errors.push("Password must contain at least one uppercase letter");
    }
    if (!/[a-z]/.test(pw)) {
      errors.push("Password must contain at least one lowercase letter");
    }
    if (!/\d/.test(pw)) {
      errors.push("Password must contain at least one number");
    }
    
    return { valid: errors.length === 0, errors };
  }

  // Simple password strength estimator (returns 0..5 for UI feedback)
  function passwordStrength(pw: string) {
    let score = 0;
    // Check password length
    if (pw.length >= 8) score += 1;
    if (pw.length >= 12) score += 1;
    // Contains lowercase
    if (/[a-z]/.test(pw)) score += 1;
    // Contains uppercase
    if (/[A-Z]/.test(pw)) score += 1;
    // Contains numbers
    if (/\d/.test(pw)) score += 1;
    // Contains special characters (bonus)
    if (/[^A-Za-z0-9]/.test(pw)) score += 1;

    return Math.min(score, 5);
  }

  const passwordValidation = validatePassword(password);
  const strength = passwordStrength(password);
  const strengthLabel =
    strength <= 1
      ? "Too Weak"
      : strength === 2
        ? "Fair"
        : strength === 3
          ? "Good"
          : strength >= 4
            ? "Strong"
            : "Very Strong";

  const canSubmit =
    username &&
    isUsernameValid(username) &&
    email &&
    isEmailValid(email) &&
    password &&
    passwordValidation.valid &&
    confirmPassword &&
    password === confirmPassword;

  const clearFieldErrors = () => setFieldErrors({});

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    clearFieldErrors();
    setSuccess(null);

    if (!username || !email || !password || !confirmPassword) {
      setError({ message: "Please fill in all fields." });
      return;
    }

    if (!isUsernameValid(username)) {
      setError({
        message:
          "Username must be 3-30 characters and can only contain letters, numbers, or underscores.",
      });
      return;
    }

    if (!isEmailValid(email)) {
      setError({ message: "Please enter a valid email address." });
      return;
    }

    if (password !== confirmPassword) {
      setError({ message: "Passwords do not match." });
      return;
    }

    // Validate password meets security requirements
    if (!passwordValidation.valid) {
      setError({
        message: passwordValidation.errors[0],
      });
      return;
    }

    setLoading(true);
    try {
      // Call backend signup endpoint
      await api.signup(username, email, password, fullName || undefined);

      // On success show inline message
      setSuccess("Account created. Logging in...");

      // Auto-login the user so we can flush pending saves and redirect back
      await api.login(username, password);

      // Try to flush pending saves (best-effort)
      try {
        await api.flushLocalSavedRecipes();
      } catch {
        // ignore flush errors; pending saves remain in localStorage
      }

      // Redirect back to original location (or profile)
      navigate(fromPath, { replace: true });
    } catch (err: any) {
      // Use shared error formatter so the UI consistently receives { message, code?, detail? }
      const normalized = formatApiError(err);

      // If the backend returned a field-level error code, show it inline
      if (normalized.code === "username_exists") {
        setFieldErrors({ username: normalized.message });
        setError(null);
      } else if (normalized.code === "email_exists") {
        setFieldErrors({ email: normalized.message });
        setError(null);
      } else {
        // Generic or unexpected error: show top-level error message and clear field errors
        setError({
          message: normalized.message,
          code: normalized.code,
          detail: normalized.detail,
        });
        setFieldErrors({});
      }

      console.error("Signup error:", err, normalized);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-center text-gray-900">
          Create Account
        </h1>

        <form onSubmit={handleSignUp} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="username"
              className="text-sm font-medium text-gray-700"
            >
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                // Clear username field error when user edits
                if (fieldErrors.username) {
                  setFieldErrors((prev) => ({ ...prev, username: undefined }));
                }
                if (error) setError(null);
              }}
              required
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              3-30 characters; letters, numbers, and underscores only.
            </p>
            {!isUsernameValid(username) && username.length > 0 && (
              <p className="text-xs text-red-600 mt-1">
                Username format is invalid.
              </p>
            )}
            {fieldErrors.username && (
              <p className="text-xs text-red-600 mt-1">
                {fieldErrors.username}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="fullName"
              className="text-sm font-medium text-gray-700"
            >
              Full Name (Optional)
            </label>
            <input
              type="text"
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

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
              onChange={(e) => {
                setEmail(e.target.value);
                // Clear email field error when user edits
                if (fieldErrors.email) {
                  setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }
                if (error) setError(null);
              }}
              required
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
            {fieldErrors.email && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>
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
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              required
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="mt-2">
              <div className="h-2 w-full bg-gray-200 rounded">
                <div
                  className={`h-2 rounded bg-linear-to-r ${
                    strength <= 1
                      ? "from-red-500 to-red-500"
                      : strength === 2
                        ? "from-yellow-400 to-yellow-400"
                        : strength === 3
                          ? "from-green-400 to-green-500"
                          : strength >= 4
                            ? "from-green-600 to-green-700"
                            : "from-green-700 to-green-800"
                  }`}
                  style={{ width: `${(strength / 5) * 100}%` }}
                />
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Strength: {strengthLabel}
              </p>
              {/* Password requirements checklist */}
              <ul className="mt-2 space-y-1">
                <li className={`text-xs ${password.length >= 8 ? 'text-green-600' : 'text-gray-500'}`}>
                  {password.length >= 8 ? '✓' : '○'} At least 8 characters
                </li>
                <li className={`text-xs ${/[A-Z]/.test(password) ? 'text-green-600' : 'text-gray-500'}`}>
                  {/[A-Z]/.test(password) ? '✓' : '○'} One uppercase letter
                </li>
                <li className={`text-xs ${/[a-z]/.test(password) ? 'text-green-600' : 'text-gray-500'}`}>
                  {/[a-z]/.test(password) ? '✓' : '○'} One lowercase letter
                </li>
                <li className={`text-xs ${/\d/.test(password) ? 'text-green-600' : 'text-gray-500'}`}>
                  {/\d/.test(password) ? '✓' : '○'} One number
                </li>
              </ul>
            </div>
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="text-sm font-medium text-gray-700"
            >
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (error) setError(null);
              }}
              required
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
            {password !== confirmPassword && confirmPassword.length > 0 && (
              <p className="text-xs text-red-600 mt-1">
                Passwords do not match.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error.message}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}

          <button
            type="submit"
            disabled={loading || !canSubmit}
            className={`w-full px-4 py-2 font-semibold text-white ${
              loading || !canSubmit
                ? "bg-gray-400"
                : "bg-green-600 hover:bg-green-700"
            } rounded-md focus:outline-none cursor-pointer focus:ring-2 focus:ring-offset-2 focus:ring-green-500`}
          >
            {loading ? "Signing up..." : "Sign Up"}
          </button>
        </form>

        <p className="text-sm text-center text-gray-600">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-blue-600 hover:underline cursor-pointer"
          >
            Log In
          </Link>
        </p>
      </div>
    </div>
  );
}
