import React from "react";
import { Link } from "react-router";
import { useAuth } from "../hooks/useAuth";

/**
 * Header component
 *
 * - Uses the useAuth hook for centralized auth state management
 * - Displays user info when logged in, login/signup links when not
 */

export default function Header() {
  const { user, logout } = useAuth();

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
              Generate Recipes
            </Link>
          </li>
          {user ? (
            <>
              <li className="flex items-center space-x-3">
                <span className="text-gray-700">
                  {user.username ? `Hi, ${user.username}` : "Logged In"}
                </span>
              </li>
              <li>
                <Link
                  to="/profile"
                  className="text-gray-600 hover:text-blue-600 transition-colors"
                >
                  Profile
                </Link>
              </li>
              <li>
                <button
                  onClick={logout}
                  className="text-gray-600 hover:text-blue-600 transition-colors bg-transparent border-0 p-0"
                >
                  Log Out
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
                  Log In
                </Link>
              </li>
              <li>
                <Link
                  to="/signup"
                  className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  Sign Up
                </Link>
              </li>
            </>
          )}
        </ul>
      </nav>
    </header>
  );
}
