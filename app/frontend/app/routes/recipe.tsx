import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import api from "../services/api";
import type { components } from "../types";
import type { Route } from "./+types/recipe";

type ApiRecipe = components["schemas"]["Recipe"];
type ApiIngredient = components["schemas"]["RecipeIngredient"];

type LegacyDualRecipeResponse = {
  scratch?: ApiRecipe;
  finetuned?: ApiRecipe;
};

const RECIPE_STORAGE_KEY = "recipe_current_view";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Recipe Generator" },
    {
      name: "description",
      content: "Generated recipe details and instructions",
    },
  ];
}

/**
 * Recipe view
 *
 * - Prefer recipe(s) passed via navigation state: navigate("/recipe", { state: { recipe } })
 * - Accepts backend shape for single recipe: { title, ingredients: [{ name, amount? }], steps }
 * - Accepts a list of recipes when multiple models are selected
 * - Accepts legacy dual response shape: { scratch: Recipe, finetuned: Recipe }
 * - If no recipe in navigation state, falls back to sessionStorage
 * - If no recipe anywhere, shows a helpful message and link back to generator.
 */

export default function RecipeView({}: Route.ComponentProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [recipes, setRecipes] = useState<ApiRecipe[]>([]);

  type LocationState = { recipe?: ApiRecipe | ApiRecipe[] | LegacyDualRecipeResponse } | undefined;
  const state = (location.state as LocationState) ?? undefined;
  const recipeData = state?.recipe;

  // Initialize recipes from navigation state or sessionStorage
  useEffect(() => {
    if (recipeData) {
      let parsed: ApiRecipe[] = [];

      if (Array.isArray(recipeData)) {
        parsed = recipeData;
      } else if (
        typeof recipeData === "object" &&
        ("scratch" in recipeData || "finetuned" in recipeData)
      ) {
        const legacy = recipeData as LegacyDualRecipeResponse;
        parsed = [legacy.scratch, legacy.finetuned].filter((item): item is ApiRecipe => Boolean(item));
      } else {
        parsed = [recipeData as ApiRecipe];
      }

      setRecipes(parsed);
      
      // Persist to sessionStorage for page refresh
      try {
        sessionStorage.setItem(RECIPE_STORAGE_KEY, JSON.stringify(parsed));
      } catch {
        // sessionStorage may fail in private browsing
      }
    } else {
      // Try to load from sessionStorage
      try {
        const stored = sessionStorage.getItem(RECIPE_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as ApiRecipe[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRecipes(parsed);
          }
        }
      } catch {
        // ignore parse errors
      }
    }
  }, [recipeData]);

  useEffect(() => {
    if (activeTabIndex > recipes.length - 1) {
      setActiveTabIndex(0);
    }
  }, [activeTabIndex, recipes.length]);

  const recipe = recipes[activeTabIndex] ?? null;
  // Helper accessors to normalize fields
  const title = recipe?.title ?? null;
  const ingredients: { name: string; amount?: string }[] =
    recipe?.ingredients?.map((ing: ApiIngredient) => ({
      name: ing.name,
      amount: ing.amount ?? undefined,
    })) ?? [];
  const steps: string[] = recipe?.steps ?? [];
  const cookTime = recipe?.time ?? null;
  const modelName = recipe?.model ?? null;

  const saveRecipe = async () => {
    if (!recipe) return;
    // Build the minimal recipe object the backend expects
    const toSave = {
      title: title ?? `Recipe (${new Date().toISOString()})`,
      ingredients,
      steps,
    };
    try {
      const result = await api.saveRecipe(toSave);
      // If the API indicated the recipe was saved locally
      if (
        result &&
        typeof result === "object" &&
        "savedLocally" in result &&
        (result as { savedLocally?: boolean }).savedLocally
      ) {
        // eslint-disable-next-line no-alert
        alert(
          "Recipe saved temporarily in your browser. Sign in or register to save it to your account.",
        );
        // eslint-disable-next-line no-restricted-globals
        if (
          // eslint-disable-next-line no-restricted-globals
          confirm("Would you like to log in now to upload this recipe?")
        ) {
          navigate("/login");
        }
        return result;
      }

      // Successful server save
      // eslint-disable-next-line no-alert
      alert("Recipe successfully saved to your account!");
      return result;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Save failed", err);
      // Fallback to local storage
      try {
        const pendingKey = "recipegen_pending_saves";
        const raw = localStorage.getItem(pendingKey);
        const arr = raw ? JSON.parse(raw) : [];
        arr.push({
          title: toSave.title,
          ingredients: toSave.ingredients,
          steps: toSave.steps,
        });
        localStorage.setItem(pendingKey, JSON.stringify(arr));
        // eslint-disable-next-line no-alert
        alert(
          "Recipe saved locally in your browser (backup). Sign in later to upload it.",
        );
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Failed to save locally", e);
        // eslint-disable-next-line no-alert
        alert(
          "An error occurred while saving and local backup also failed. Please check your network connection.",
        );
      }
      throw err;
    }
  };

  if (!recipe) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white border border-gray-200 rounded-lg shadow p-8 text-center">
          <h1 className="text-3xl font-bold mb-4">No Recipe to Display</h1>

          <p className="text-gray-600 mb-6">
            It seems no recipe was passed in the navigation state. Please
            generate a recipe first from the home page.
          </p>

          <div className="flex justify-center gap-4">
            <Link
              to="/"
              className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
            >
              Generate Recipe
            </Link>

            <Link
              to="/profile"
              className="px-6 py-3 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              My Profile
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="bg-white border border-gray-200 rounded-lg shadow p-8">
        {recipes.length > 1 && (
          <div className="mb-6 border-b pb-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">
              Select Model
            </h2>
            <div className="flex gap-4">
              {recipes.map((item, index) => {
                const label = item.model
                  ? `${item.model.charAt(0).toUpperCase()}${item.model.slice(1)} model`
                  : `Recipe ${index + 1}`;

                return (
                  <button
                    key={`${item.model ?? "model"}-${index}`}
                    onClick={() => setActiveTabIndex(index)}
                    className={`px-6 py-2 rounded-md font-semibold transition ${
                      activeTabIndex === index
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-800">
              {title ?? "Generated Recipe"}
            </h1>
            {modelName && (
              <p className="text-gray-500 mt-2 text-sm">
                Generated by: <span className="font-medium capitalize">{modelName}</span> model
              </p>
            )}
            {cookTime && (
              <p className="text-gray-500 mt-1 text-sm">
                Cooking time: <span className="font-medium">{cookTime}</span>
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">
              Ingredients
            </h2>

            {ingredients.length === 0 ? (
              <p className="text-gray-500">No ingredients listed.</p>
            ) : (
              <ul className="space-y-3">
                {ingredients.map((ing, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span className="text-blue-600 font-bold mt-0.5">•</span>
                    <div>
                      <span className="font-medium text-gray-800">
                        {ing.name}
                      </span>
                      {ing.amount && (
                        <span className="block text-gray-500 text-sm">
                          {ing.amount}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="md:col-span-2">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">
              Instructions
            </h2>

            {steps.length === 0 ? (
              <p className="text-gray-500">No instructions provided.</p>
            ) : (
              <ol className="space-y-4">
                {steps.map((step, idx) => (
                  <li key={idx} className="flex gap-4">
                    <span className="shrink-0 flex items-center justify-center w-8 h-8 bg-blue-600 text-white rounded-full font-semibold">
                      {idx + 1}
                    </span>
                    <span className="text-gray-700 pt-1">{step}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="mt-8 flex justify-between gap-4">
          <button
            onClick={saveRecipe}
            className="px-6 py-3 rounded-md bg-green-600 text-white hover:bg-green-700 font-semibold cursor-pointer transition"
          >
            Save Recipe
          </button>

          <Link
            to="/"
            className="px-6 py-3 rounded-md bg-blue-600 text-white hover:bg-blue-700 font-semibold transition"
          >
            Generate New Recipe
          </Link>
        </div>
      </div>
    </div>
  );
}
