import React from "react";
import {
  Link,
  redirect,
  useLoaderData,
  useNavigate,
  useNavigation,
  type ClientActionFunctionArgs,
} from "react-router";
import api from "../services/api";
import type { components } from "../types/index";
import { Form } from "react-router";
type ApiRecipe = components["schemas"]["Recipe"];
type ApiIngredient = components["schemas"]["RecipeIngredient"];

/**
 * Route loader for /recipe/:id
 * - Loads the recipe from the backend using the saved id param.
 * - Returns { recipe } where recipe may be undefined if not found.
 */
export async function clientLoader({ params }: { params: { id?: string } }) {
  console.log("Loading recipe", params);
  const id = params?.id;
  if (!id) {
    throw new Response("Missing recipe id", { status: 400 });
  }

  try {
    const recipe = await api.getSavedRecipe(id);
    return { recipe };
  } catch (err: any) {
    // Normalize common not-found behavior into a 404 response so the router
    // can render any error UI or fall back to this route's UI.
    const msg =
      (err && (err.detail || err.message || String(err))) || "Not found";
    throw new Response(msg, { status: 404 });
  }
}

export const clientAction = async ({ params }: ClientActionFunctionArgs) => {
  if (!params.id) return null;

  try {
    await api.deleteSavedRecipe(params.id);
    // After successful deletion, we immediately throw a redirect
    throw redirect("/profile");
  } catch (error) {
    // If the error itself is the redirect (Response), re-throw it!
    if (error instanceof Response) {
      throw error;
    }
    console.error("Deletion error:", error);
    return { error: "Failed to delete the recipe." };
  }
};

export function shouldRevalidate({ formMethod, defaultShouldRevalidate }: any) {
  // If POST (or DELETE) method is used,
  // we know the data was deleted/changed, and redirect is coming.
  // In this case, do NOT re-load the current page loader!
  if (formMethod === "POST" || formMethod === "DELETE") {
    return false;
  }
  return defaultShouldRevalidate;
}


export default function RecipeView() {
  const navigation = useNavigation();
  const isDeleting = navigation.state === "submitting";
  const navigate = useNavigate();
  const loaderData = useLoaderData() as { recipe?: ApiRecipe } | undefined;
  const recipe = loaderData?.recipe;

  // Helper accessors to normalize fields across shapes
  const title = recipe?.title ?? null;
  const ingredients: { name: string; amount?: string }[] =
    recipe?.ingredients?.map((ing: ApiIngredient) => ({
      name: ing.name,
      amount: ing.amount ?? undefined,
    })) ?? [];

  const steps: string[] = recipe?.steps ?? [];

  if (!recipe) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white border border-gray-200 rounded-lg shadow p-8 text-center">
          <h1 className="text-3xl font-bold mb-4">
            No Recipe to Display
          </h1>
          <p className="text-gray-600 mb-6">
            It seems the specified recipe was not found or failed to load. Check the URL or generate a recipe on the home page.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              to="/"
              className="px-6 py-3 bg-green-500 text-white rounded-md hover:bg-green-600 cursor-pointer"
            >
              Generate Recipe
            </Link>
            <Link
              to="/profile"
              className="px-6 py-3 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              Profile
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="bg-white border border-gray-200 rounded-lg shadow p-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          {title ?? "Generated Recipe"}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            <h2 className="text-2xl font-semibold text-gray-700 mb-3">
              Ingredients
            </h2>
            {ingredients.length === 0 ? (
              <p className="text-gray-500">No ingredients.</p>
            ) : (
              <ul className="list-disc list-inside space-y-2 text-gray-600">
                {ingredients.map((ing, idx) => (
                  <li key={idx}>
                    <span className="font-medium mr-2">
                      {ing.amount ? ing.amount : "—"}
                    </span>
                    {ing.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="md:col-span-2">
            <h2 className="text-2xl font-semibold text-gray-700 mb-3">
              Instructions
            </h2>
            {steps.length === 0 ? (
              <p className="text-gray-500">No preparation steps.</p>
            ) : (
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                {steps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* Footer / Buttons */}
        <div className="mt-12 flex items-center justify-between border-t border-gray-100 pt-6">
          <Link
            to="/profile"
            className="text-gray-500 hover:text-gray-800 font-medium transition-colors"
          >
            ← Back to Profile
          </Link>

          <div className="flex gap-4">
            {/* Delete button via Action */}
            <Form
              method="post"
              onSubmit={async (e) => {
                if (!confirm("Are you sure you want to delete this recipe?")) {
                  e.preventDefault();
                }
              }}
            >
              <button
                type="submit"
                disabled={isDeleting}
                className="px-6 py-2 rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Delete Recipe
              </button>
            </Form>

            <Link
              to="/"
              className="px-6 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 shadow-sm transition-colors"
            >
              Generate New Recipe
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
