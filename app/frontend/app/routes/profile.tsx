import React, { useEffect, useState } from "react";
import type { Route } from "./+types/profile";
import ProfileLayout from "../components/ProfileLayout";

import api from "../services/api";
import type { components } from "../types";
type ApiRecipe = components["schemas"]["Recipe"];
import { useNavigate, useLocation } from "react-router";
type User = components["schemas"]["User"];

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Profil" },
    { name: "description", content: "A profilod és a mentett recepteked." },
  ];
}

/* currentUser state and effect moved inside the component to avoid using hooks at module scope */

// Helper: normalize raw user object to the generated `User` type.
// Centralizing this ensures we always produce an object that matches
// `components["schemas"]["User"]` (username, email, full_name, disabled).
// Also serves as a single place to adjust defaults if the backend shape changes.
function normalizeUser(u: any): User {
  return {
    username: u.username,
    email: (u.email as string) ?? null,
    full_name: (u.full_name as string) ?? null,
    // generated type expects `disabled: boolean | null` - default to false when missing
    disabled: (u as any).disabled ?? false,
  };
}

export default function Profile() {
  const navigate = useNavigate();
  const [savedRecipes, setSavedRecipes] = useState<ApiRecipe[] | undefined>(
    undefined,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Current authenticated user state (moved inside component)
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const location = useLocation();

  
  useEffect(() => {
    let mounted = true;
    let foundUser: {
      username?: string;
      email?: string;
      full_name?: string;
    } | null = null;

    // Attempt to load current user from backend; if unauthorized or network error, treat as anonymous.
    api
      .getCurrentUser()
      .then((u) => {
        // eslint-disable-next-line no-console
        console.log("user", u);
        if (!u) {
          navigate("/login");
        }
        if (!mounted) return;
        if (u && u.username && u.email) {
          // Ensure the object we store matches the generated `User` type which includes `disabled`.
          // Populate `disabled` from the server value when present, otherwise default to false.
          const normalizedUser: User = {
            username: u.username,
            email: u.email ?? undefined,
            full_name: (u as any).full_name ?? undefined,
            disabled: (u as any).disabled ?? false,
          };
          setCurrentUser(normalizedUser);
          foundUser = u;
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setCurrentUser(null);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
        // If no user was found, redirect to login and include return location
        if (!foundUser) {
          try {
            navigate("/login", { state: { from: location } });
          } catch {
            // ignore navigation errors
          }
        }
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Only fetch saved recipes after we established the current user (authenticated).
    if (!currentUser) {
      return;
    }

    let mounted = true;
    setLoading(true);
    setError(null);

    api
      .getSavedRecipes()
      .then((res) => {
        if (!mounted) return;
        // Map backend recipe shape to the ProfileLayout expected SavedRecipe shape.
        // Ensure we provide `ingredients` and `steps` so the type `Recipe` is satisfied.
        const mapped: ApiRecipe[] = (res || []).map((r: ApiRecipe, idx) => {
          const id = r.id;
          const title = r.title ?? r.title ?? `Recept`;
          // const imageUrl = r.imageUrl ?? undefined;
          const steps = Array.isArray(r.steps) ? r.steps : [];
          const ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
          // `description` is not part of the canonical Recipe type but some backend responses
          // or UI mappings include it. Prefer an explicit description, otherwise build an excerpt
          // from the first two steps when available.
          /*
            const description =
              // check if the runtime object has a description property (string)
              (typeof (r as unknown as { description?: unknown })
                .description === "string"
                ? (r as unknown as { description?: string }).description
                : undefined) ??
              (steps.length > 0 ? steps.slice(0, 2).join(" ") : undefined);
            */
          const item: ApiRecipe = {
            id,
            title,
            // name: r.title ?? undefined,
            // imageUrl,
            ingredients,
            steps,
          };
          return item;
        });
        setSavedRecipes(mapped);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("Failed to fetch saved recipes", err);
        if (!mounted) return;
        setError("Hiba a mentett receptek betöltése során.");
        setSavedRecipes([]);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [currentUser]);

  // Optionally show a small loading / error state while fetching.
  // ProfileLayout will show an empty state if there are no saved recipes.
  return (
    <>
      {currentUser && (
        <ProfileLayout
          user={currentUser}
          savedRecipes={savedRecipes}
          initialView="profile"
        />
      )}
    </>
  );
}
