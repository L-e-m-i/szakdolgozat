import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import api from "../services/api";

/**
 * Header component
 *
 * - Detects basic auth state using localStorage key used by the API module.
 * - Handles logout by calling the API logout helper and clearing local state.
 * - Listens for cross-tab storage events to keep UI in sync.
 */

export default function Header() {
  // Track the authenticated user (loaded from backend) or null for anonymous.
  const [user, setUser] = useState<{
    username?: string;
    email?: string;
  } | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const navigate = useNavigate();

  // Load current user from backend; fall back to token presence if backend call fails.
  const loadCurrentUser = async () => {
    setLoadingUser(true);
    try {
      const u = await api.getCurrentUser();
      // API returns null or user object; normalize to our shape
      setUser(u ? { username: u.username, email: u.email } : null);
    } catch {
      // If the authenticated endpoint fails (401 or network), try a token-based fallback.
      try {
        const raw = localStorage.getItem("recipegen_auth");
        if (raw) {
          // We don't have username from token in this implementation; show a generic logged-in state.
          setUser({ username: undefined });
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      }
    } finally {
      setLoadingUser(false);
    }
  };

  useEffect(() => {
    loadCurrentUser();
    // Keep header in sync across tabs (when tokens are added/removed) and listen for custom auth events.
    const onStorage = (e: StorageEvent) => {
      if (e.key === "recipegen_auth") {
        loadCurrentUser();
      }
    };
    const onAuthChanged: EventListener = () => {
      loadCurrentUser();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("auth-changed", onAuthChanged);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("auth-changed", onAuthChanged);
    };
  }, []);

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await api.logout();
    } catch (err) {
      console.error("Logout failed", err);
    } finally {
      localStorage.removeItem("recipegen_auth");
      setUser(null);
      navigate("/", { replace: true });
    }
  };

  return (
    <header className="flex items-center justify-between px-8 py-4 bg-white shadow-md">
      <Link to="/" className="text-2xl font-bold text-gray-800">
        RecipeMaker
      </Link>
      <nav>
        <ul className="flex items-center space-x-6">
          <li>
            <Link
              to="/"
              className="text-gray-600 hover:text-blue-600 transition-colors"
            >
              Recept Generálás
            </Link>
          </li>
          {user ? (
            <>
              <li className="flex items-center space-x-3">
                <span className="text-gray-700">
                  {user.username ? `Szia, ${user.username}` : "Bejelentkezve"}
                </span>
              </li>
              <li>
                <Link
                  to="/profile"
                  className="text-gray-600 hover:text-blue-600 transition-colors"
                >
                  Profil
                </Link>
              </li>
              <li>
                <button
                  onClick={handleLogout}
                  className="text-gray-600 hover:text-blue-600 transition-colors bg-transparent border-0 p-0"
                >
                  Kijelentkezés
                </button>
              </li>
            </>
          ) : (
            <>
              <li>
                <Link
                  to="/login"
                  className="text-gray-600 hover:text-blue-600 transition-colors"
                >
                  Bejelentkezés
                </Link>
              </li>
              <li>
                <Link
                  to="/signup"
                  className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  Regisztráció
                </Link>
              </li>
            </>
          )}
        </ul>
      </nav>
    </header>
  );
}
