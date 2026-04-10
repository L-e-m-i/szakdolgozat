import { useState, useEffect, useCallback } from "react";
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
  const location = useLocation(); // Get location for redirect state

  const loadUser = useCallback(async () => {
    try {
      const u = await api.getCurrentUser();
      if (u && u.username) {
        const normalizedUser = normalizeUser(u);
        setUser(normalizedUser);
        setLoading(false);  // Always set loading to false when user is found
      } else {
        setUser(null);
        setLoading(false);  // Set loading to false before redirect
        if (requireAuth) {
          navigate("/login", { state: { from: location.pathname } });
        }
      }
    } catch {
      setUser(null);
      setLoading(false);  // Set loading to false before redirect
      if (requireAuth) {
        navigate("/login", { state: { from: location.pathname } });
      }
    }
  }, [requireAuth, navigate, location]);

  useEffect(() => {
    // Skip loading if user has explicitly logged out
    if (hasLoggedOut) {
      return;
    }

    loadUser();

    // Listen for auth change events (from login/logout actions)
    const onAuthChanged = (event: Event) => {
      const detail = (event as CustomEvent).detail as { loggedIn: boolean } | undefined;
      // If the event indicates logout, skip re-loading user
      if (detail && !detail.loggedIn) {
        return;
      }
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

  return {
    user,
    loading,
    isAuthenticated: !!user,
    refreshUser,
    logout,
  };
}

export default useAuth;
