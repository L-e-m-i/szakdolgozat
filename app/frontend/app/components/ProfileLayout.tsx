import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import api from "../services/api";
import type { components } from "../types";
type ApiUser = components["schemas"]["User"];
type ApiRecipe = components["schemas"]["Recipe"];

/**
 * SavedRecipe extends the backend Recipe type with an optional
 * `description` property that some UI mappings add.
 */
// export type SavedRecipe = ApiRecipe & { description?: string };

/**
 * Props for the layout component.
 * - `user` and `savedRecipes` are passed through to the subcomponents.
 * - `initialView` lets the page choose which tab is active by default.
 */
export interface ProfileLayoutProps {
  user: ApiUser;
  savedRecipes?: ApiRecipe[];
  initialView?: "profile" | "recipes";
  onUpdateProfile?: (
    data: {
      current_password: string;
      full_name?: string;
      email?: string;
      new_password?: string;
    },
  ) => Promise<void>;
}

/**
 * ProfileLayout
 *
 * Provides a two-column layout with a sidebar on the left and a content area on the right.
 * The layout manages which view is active ("profile" or "recipes") and renders the
 * appropriate subcomponent.
 */
export default function ProfileLayout({
  user,
  savedRecipes = [],
  initialView = "profile",
  onUpdateProfile,
}: ProfileLayoutProps) {
  const [activeView, setActiveView] = useState<"profile" | "recipes">(
    initialView,
  );

  return ( 
    <div className="max-w-7xl mx-auto p-4 sm:p-6 md:p-8">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <aside className="md:w-1/4">
          <div className="sticky top-6 space-y-4">
            <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">Account</h2>

              <nav
                className="flex flex-col space-y-2"
                aria-label="Profile menu"
              >
                <button
                  type="button"
                  onClick={() => setActiveView("profile")}
                  className={`w-full text-left px-4 py-2 rounded-lg transition ${
                    activeView === "profile"
                      ? "bg-blue-600 text-white"
                      : "hover:bg-gray-100 text-gray-800 cursor-pointer"
                  }`}
                  aria-current={activeView === "profile" ? "page" : undefined}
                >
                  My Profile
                </button>

                <button
                  type="button"
                  onClick={() => setActiveView("recipes")}
                  className={`w-full text-left px-4 py-2 rounded-lg transition ${
                    activeView === "recipes"
                      ? "bg-blue-600 text-white"
                      : "hover:bg-gray-100 text-gray-800 cursor-pointer"
                  }`}
                  aria-current={activeView === "recipes" ? "page" : undefined}
                >
                  Saved Recipes
                </button>
              </nav>
            </div>

            <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
              <h3 className="text-sm text-gray-500">Actions</h3>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  to="/"
                  className="inline-block text-sm px-3 py-2 rounded bg-green-500 text-white text-center hover:bg-green-600"
                >
                  Generate Recipe
                </Link>
              </div>
            </div>
          </div>
        </aside>

        {/* Content area */}
        <main className="md:w-3/4">
          {activeView === "profile" ? (
            <ProfileDetails
              user={user}
              onUpdate={onUpdateProfile ?? (() => Promise.resolve())}
            />
          ) : (
            <SavedRecipesList recipes={savedRecipes} />
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * ProfileDetails
 *
 * Displays user information with an inline edit form to update
 * full name, email, and optionally password.
 * Requires current password for any change.
 */
export function ProfileDetails({
  user,
  onUpdate,
}: {
  user: ApiUser;
  onUpdate: (data: {
    current_password: string;
    full_name?: string;
    email?: string;
    new_password?: string;
  }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync local state when user prop changes
  useEffect(() => {
    setFullName(user.full_name ?? "");
    setEmail(user.email ?? "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setSuccess(null);
    setError(null);
    setEditing(false);
  }, [user]);

  const hasChanges = () => {
    return (
      fullName.trim() !== (user.full_name ?? "") ||
      email.trim() !== (user.email ?? "") ||
      newPassword.length > 0
    );
  };

  const passwordsMatch = newPassword.length === 0 || newPassword === confirmPassword;
  const currentPasswordValid = currentPassword.length > 0;
  const newPasswordValid = newPassword.length === 0 || newPassword.length >= 8;
  const canSubmit =
    currentPasswordValid &&
    passwordsMatch &&
    newPasswordValid &&
    hasChanges();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const payload: {
      current_password: string;
      full_name?: string;
      email?: string;
      new_password?: string;
    } = {
      current_password: currentPassword,
    };

    if (fullName.trim() !== (user.full_name ?? "")) {
      payload.full_name = fullName.trim() || undefined;
    }
    if (email.trim() !== (user.email ?? "")) {
      payload.email = email.trim();
    }
    if (newPassword.length > 0) {
      payload.new_password = newPassword;
    }

    if (!hasChanges()) {
      setSuccess("No changes to save.");
      return;
    }

    if (newPassword.length > 0 && newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      await onUpdate(payload);
      setSuccess("Profile updated successfully.");
      setEditing(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      const msg =
        err?.detail?.message || err?.message || "Failed to update profile.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setFullName(user.full_name ?? "");
    setEmail(user.email ?? "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setSuccess(null);
    setError(null);
  };

  // Small inline toggle button for password visibility
  const ToggleBtn = ({
    visible,
    onToggle,
    label,
  }: {
    visible: boolean;
    onToggle: () => void;
    label: string;
  }) => (
    <button
      type="button"
      onClick={onToggle}
      className="px-3 py-2 text-sm rounded border border-gray-300 hover:bg-gray-50 cursor-pointer shrink-0"
      aria-label={visible ? `Hide ${label}` : `Show ${label}`}
    >
      {visible ? "Hide" : "Show"}
    </button>
  );

  return (
    <section aria-labelledby="profile-heading">
      <h1
        id="profile-heading"
        className="text-3xl md:text-4xl font-bold text-gray-800 mb-6"
      >
        My Profile
      </h1>

      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">Profile Details</h2>

        {success && (
          <p className="mb-4 px-4 py-2 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
            {success}
          </p>
        )}
        {error && (
          <p className="mb-4 px-4 py-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </p>
        )}

        {!editing ? (
          <>
            <div className="grid grid-cols-1 gap-3 text-gray-600">
              <div>
                <p className="text-sm text-gray-500">Username</p>
                <p className="font-medium text-gray-800">{user.username}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Name</p>
                {user.full_name ? (
                  <p className="font-medium text-gray-800">{user.full_name}</p>
                ) : (
                  <p className="font-medium text-gray-800 italic">No name provided</p>
                )}
              </div>
              <div>
                <p className="text-sm text-gray-500">Email Address</p>
                <p className="font-medium text-gray-800">{user.email}</p>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
              >
                Edit Profile
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Current password — required */}
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <label
                htmlFor="edit-current-password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Current Password <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="edit-current-password"
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your current password"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
                <ToggleBtn
                  visible={showCurrent}
                  onToggle={() => setShowCurrent((p) => !p)}
                  label="current password"
                />
              </div>
            </div>

            {/* Read-only username */}
            <div>
              <label htmlFor="edit-username" className="block text-sm text-gray-500 mb-1">
                Username
              </label>
              <p className="font-medium text-gray-800">{user.username}</p>
            </div>

            {/* Full name */}
            <div>
              <label htmlFor="edit-fullname" className="block text-sm text-gray-500 mb-1">
                Name
              </label>
              <input
                id="edit-fullname"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="edit-email" className="block text-sm text-gray-500 mb-1">
                Email Address
              </label>
              <input
                id="edit-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* New password */}
            <div className="pt-2 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Change Password{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </h3>

              <div className="space-y-3">
                <div>
                  <label htmlFor="edit-new-password" className="block text-sm text-gray-500 mb-1">
                    New Password
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="edit-new-password"
                      type={showNew ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      minLength={8}
                      placeholder="Min. 8 characters"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                    <ToggleBtn
                      visible={showNew}
                      onToggle={() => setShowNew((p) => !p)}
                      label="new password"
                    />
                  </div>
                  {newPassword && newPassword.length < 8 && (
                    <p className="text-xs text-red-600 mt-1">Must be at least 8 characters</p>
                  )}
                </div>

                <div>
                  <label htmlFor="edit-confirm-password" className="block text-sm text-gray-500 mb-1">
                    Confirm New Password
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="edit-confirm-password"
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                    <ToggleBtn
                      visible={showConfirm}
                      onToggle={() => setShowConfirm((p) => !p)}
                      label="confirm password"
                    />
                  </div>
                  {confirmPassword && !passwordsMatch && (
                    <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
                  )}
                  {confirmPassword && passwordsMatch && confirmPassword.length > 0 && (
                    <p className="text-xs text-green-600 mt-1">Passwords match</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving || !canSubmit}
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

/**
 * SavedRecipesList
 *
 * Renders a responsive grid of saved recipes. Each card includes a thumbnail,
 * name and quick actions. This is exported so it can be used outside the layout too.
 */
export function SavedRecipesList({ recipes }: { recipes?: ApiRecipe[] }) {
  // Local copy of recipes so we can optimistically remove on delete without
  // forcing the parent to immediately refresh.
  const [items, setItems] = useState<ApiRecipe[]>(recipes ?? []);

  // Keep local items in sync if parent updates the prop
  useEffect(() => {
    setItems(recipes ?? []);
  }, [recipes]);

  // Delete handler: call backend and remove from local list on success.
  // Accept null/undefined ids (some saved items may have `id: null`) and treat 0 correctly.
  const handleDelete = useCallback(
    async (id?: string | undefined) => {
      if (!id) {
        return;
      }
      const sid = String(id);
      try {
        // Call API helper to delete on server
        await api.deleteSavedRecipe(sid);
        // Remove locally to give immediate feedback
        setItems((prev) => prev.filter((it) => String(it.id) !== sid));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to delete saved recipe", err);
        // Friendly feedback to user
        // eslint-disable-next-line no-alert
        alert("Failed to delete recipe. Please try again later.");
      }
    },
    [setItems],
  );

  return (
    <section aria-labelledby="saved-recipes-heading">
      <h1
        id="saved-recipes-heading"
        className="text-3xl md:text-4xl font-bold text-gray-800 mb-6"
      >
        Saved Recipes
      </h1>

      {items && items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {items.map((r, idx) => {
            const idStr = r.id ? String(r.id) : `local-${idx}`;
            return (
              <article
                key={idStr}
                className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden"
              >
                {/* Image placeholder handling preserved from previous implementation */}
                {/*{r.imageUrl ? (
                  <Link to={`/recipe/${idStr}`} state={{ recipe: r }}>
                    <img
                      src={r.imageUrl}
                      alt={`Image of ${r.name}`}
                      className="w-full h-40 object-cover"
                    />
                  </Link>
                ) : (
                  <div className="w-full h-40 bg-gray-100 flex items-center justify-center text-gray-400">
                    No image
                  </div>
                )}*/}

                <div className="p-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    {r.title ?? r.title ?? "Untitled Recipe"}
                  </h3>

                  {Array.isArray(r.ingredients) &&
                  Array.isArray(r.steps) &&
                  r.steps.length > 0 ? (
                    <p className="text-sm text-gray-600 mt-2">
                      {r.steps.slice(0, 2).join(" ")}
                    </p>
                  ) : Array.isArray(r.steps) && r.steps.length > 0 ? (
                    <p className="text-sm text-gray-600 mt-2">
                      {r.steps.slice(0, 2).join(" ")}
                    </p>
                  ) : null}

                  <div className="mt-4 flex justify-end gap-2">
                    <Link
                      to={`/saved-recipe/${encodeURIComponent(idStr)}`}
                      state={{ recipe: r }}
                      className="px-3 py-1 text-sm rounded bg-green-500 text-white hover:bg-green-600"
                    >
                      Open
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleDelete(idStr)}
                      className="px-3 py-1 text-sm rounded bg-red-500 text-white hover:bg-red-600 cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="p-8 bg-white border border-gray-200 rounded-lg shadow-sm text-center">
          <p className="text-gray-500">You have no saved recipes yet.</p>
          <Link
            to="/"
            className="mt-4 inline-block px-4 py-2 rounded bg-green-500 text-white hover:bg-green-600"
          >
            Generate Recipe
          </Link>
        </div>
      )}
    </section>
  );
}
