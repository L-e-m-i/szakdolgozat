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
              <h2 className="text-lg font-semibold text-gray-700 mb-3">Fiók</h2>

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
                  Profilom
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
                  Mentett receptek
                </button>
              </nav>
            </div>

            <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
              <h3 className="text-sm text-gray-500">Műveletek</h3>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  to="/"
                  className="inline-block text-sm px-3 py-2 rounded bg-green-500 text-white text-center hover:bg-green-600"
                >
                  Recept generálása
                </Link>
              </div>
            </div>
          </div>
        </aside>

        {/* Content area */}
        <main className="md:w-3/4">
          {activeView === "profile" ? (
            <ProfileDetails user={user} />
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
 * Simple component that renders user information.
 * Kept separate so pages can import it individually if desired.
 */
export function ProfileDetails({ user }: { user: ApiUser }) {
  return (
    <section aria-labelledby="profile-heading">
      <h1
        id="profile-heading"
        className="text-3xl md:text-4xl font-bold text-gray-800 mb-6"
      >
        Profilom
      </h1>

      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">
          Profil adatai
        </h2>

        <div className="grid grid-cols-1 gap-3 text-gray-600">
          <div>
            <p className="text-sm text-gray-500">Felhasználónév</p>
            <p className="font-medium text-gray-800">
              {user.username}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Név</p>
            {user.full_name ?
              <p className="font-medium text-gray-800">
                {user.full_name }
              </p>
            : <p className="font-medium text-gray-800 italic">
                Nem adott meg nevet
              </p>
            }
          </div>

          <div>
            <p className="text-sm text-gray-500">Email-cím</p>
            <p className="font-medium text-gray-800">{user.email}</p>
          </div>
        </div>

        <div className="mt-6">
          <button className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">
            Profil szerkesztése
          </button>
        </div>
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
        alert("A recept törlése nem sikerült. Próbáld újra később.");
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
        Mentett receptek
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
                      Megnyitás
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleDelete(idStr)}
                      className="px-3 py-1 text-sm rounded bg-red-500 text-white hover:bg-red-600 cursor-pointer"
                    >
                      Törlés
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="p-8 bg-white border border-gray-200 rounded-lg shadow-sm text-center">
          <p className="text-gray-500">Nincs mentett recepted.</p>
          <Link
            to="/"
            className="mt-4 inline-block px-4 py-2 rounded bg-green-500 text-white hover:bg-green-600"
          >
            Recept generálása
          </Link>
        </div>
      )}
    </section>
  );
}
