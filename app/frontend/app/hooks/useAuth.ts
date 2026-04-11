import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router";
import api from "../services/api";

export interface User {
  username: string;
  email: string | null;
  full_name: string | null;
  disabled: boolean | null;
}

export interface UseAuthOptions {
  /** If true, automatically redirect to login when user is not authenticated */
  requireAuth?: boolean;
  /** Optional redirect path after login (defaults to /profile) */
  redirectTo?: string;
}

export interface UseAuthReturn {
  /** Current authenticated user, or null if not logged in */
  user: User | null;
  /** True while loading user state from backend */
  loading: boolean;
  /** True if user is authenticated */
  isAuthenticated: boolean;
  /** Manually refresh user data from backend */
  refreshUser: () => Promise<void>;
  /** Logout user and clear state */
  logout: () => Promise<void>;
  /** Update the user's profile fields and refresh local state */
  updateUser: (data: { full_name?: string; email?: string; password?: string }) => Promise<void>;
}

/**
 * Normalize user from API to ensure consistent shape
 */
function normalizeUser(u: any): User {
  return {
    username: u.username,
    email: u.email ?? null,
    full_name: u.full_name ?? null,
    disabled: u.disabled ?? null,  // Ensure disabled is boolean | null, not undefined
  };
}

/**
 * useAuth hook - centralized authentication state management
 * 
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const { user, loading, isAuthenticated, logout } = useAuth();
 *   
 *   if (loading) return <div>Loading...</div>;
 *   if (!isAuthenticated) return <div>Please log in</div>;
 *   
 *   return <div>Welcome, {user?.username}!</div>;
 * }
 * ```
 * 
 * With auto-redirect:
 * ```tsx
 * function ProtectedPage() {
 *   const { user, loading } = useAuth({ requireAuth: true, redirectTo: '/profile' });
 *   // Will redirect to /profile if not authenticated
 *   ...
 * }
 * ```
 */
export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const { requireAuth = false, redirectTo = "/profile" } = options;
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoggedOut, setHasLoggedOut] = useState(false);
  const navigate = useNavigate();
  const locationRef = useRef(useLocation());
  const navigateRef = useRef(navigate);
  const requireAuthRef = useRef(requireAuth);

  // Keep refs up-to-date
  locationRef.current = useLocation();
  navigateRef.current = navigate;
  requireAuthRef.current = requireAuth;

  const loadUser = useCallback(async () => {
    try {
      const u = await api.getCurrentUser();
      if (u && u.username) {
        const normalizedUser = normalizeUser(u);
        setUser(normalizedUser);
        setLoading(false);
      } else {
        setUser(null);
        setLoading(false);
        if (requireAuthRef.current) {
          navigateRef.current("/login", {
            state: { from: locationRef.current.pathname },
          });
        }
      }
    } catch {
      setUser(null);
      setLoading(false);
      if (requireAuthRef.current) {
        navigateRef.current("/login", {
          state: { from: locationRef.current.pathname },
        });
      }
    }
  }, []);

  useEffect(() => {
    // Skip loading if user has explicitly logged out
    if (hasLoggedOut) {
      return;
    }

    loadUser();

    // Listen for auth change events (from login/logout actions)
    const onAuthChanged = () => {
      // Always re-fetch user state from backend on auth change.
      // This ensures the Header and all other useAuth instances
      // reliably reflect the current auth status.
      loadUser();
    };

    window.addEventListener("auth-changed", onAuthChanged);
    return () => {
      window.removeEventListener("auth-changed", onAuthChanged);
    };
  }, [loadUser, hasLoggedOut]);

  const refreshUser = useCallback(async () => {
    if (hasLoggedOut) return;
    await loadUser();
  }, [loadUser, hasLoggedOut]);

  const logout = useCallback(async () => {
    setHasLoggedOut(true);
    setUser(null);
    try {
      await api.logout();
    } catch (err) {
      console.error("Logout failed", err);
    } finally {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  const updateUser = useCallback(
    async (data: { full_name?: string; email?: string; password?: string }) => {
      const updated = await api.updateUser(data);
      if (updated && updated.username) {
        setUser(normalizeUser(updated));
      }
    },
    [],
  );

  return {
    user,
    loading,
    isAuthenticated: !!user,
    refreshUser,
    logout,
    updateUser,
  };
}

export default useAuth;
