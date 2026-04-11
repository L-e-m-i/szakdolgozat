import React, { useEffect, useState } from "react";
import type { Route } from "./+types/profile";
import ProfileLayout from "../components/ProfileLayout";
import api from "../services/api";
import type { components } from "../types";
type ApiRecipe = components["schemas"]["Recipe"];
import { useNavigate, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Profile" },
    { name: "description", content: "Your profile and saved recipes." },
  ];
}

export default function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Use centralized auth hook with auto-redirect to login
  const { user, loading: authLoading, isAuthenticated, updateUser } = useAuth({ requireAuth: true });
  
  const [savedRecipes, setSavedRecipes] = useState<ApiRecipe[] | undefined>(
    undefined,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch saved recipes after we established the current user (authenticated).
    if (!isAuthenticated || authLoading) {
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
        const mapped: ApiRecipe[] = (res || []).map((r: ApiRecipe, idx) => {
          const id = r.id;
          const title = r.title ?? r.title ?? `Recipe`;
          const steps = Array.isArray(r.steps) ? r.steps : [];
          const ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
          
          const item: ApiRecipe = {
            id,
            title,
            ingredients,
            steps,
          };
          return item;
        });
        setSavedRecipes(mapped);
      })
      .catch((err) => {
        console.error("Failed to fetch saved recipes", err);
        if (!mounted) return;
        setError("Error loading saved recipes.");
        setSavedRecipes([]);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, authLoading]);

  // Show nothing while auth check is in progress (will redirect if not authenticated)
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  // Show nothing if not authenticated (useAuth will redirect to login)
  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <ProfileLayout
      user={user}
      savedRecipes={savedRecipes}
      initialView="profile"
      onUpdateProfile={updateUser}
    />
  );
}
