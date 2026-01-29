import React from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import api from "../services/api";
import type { components, Recipe } from "../types";
import type { Route } from "./+types/recipe";
type ApiRecipe = components["schemas"]["Recipe"];
type ApiIngredient = components["schemas"]["RecipeIngredient"];

/**
 * Recipe view
 *
 * - Prefer recipe passed via navigation state: navigate("/recipe", { state: { recipe } })
 * - Accepts backend shape: { title, ingredients: [{ name, amount? }], steps }
 * - Falls back to legacy frontend shape: { name, ingredients: [{ name, quantity }], steps }
 * - If no recipe in navigation state, shows a helpful message and link back to generator.
 */

 
export default function RecipeView({ actionData }: Route.ComponentProps) {
  const location = useLocation();
  const navigate = useNavigate();
  // The navigator sets state: { recipe }
  console.log(actionData)
  type LocationState = { recipe?: ApiRecipe } | undefined;
  const state = (location.state as LocationState) ?? undefined;
  const recipe = state?.recipe;
  // Helper accessors to normalize fields across shapes
  const title = recipe?.title ?? null;
  const ingredients: { name: string; amount?: string }[] =
    recipe?.ingredients?.map((ing: ApiIngredient) => ({
      name: ing.name,
      amount: ing.amount ?? undefined,
    })) ?? [];
  const steps: string[] = recipe?.steps ?? [];
  const saveRecipe = async () => {
    if (!recipe) return;
    // Build the minimal recipe object the backend expects
    const toSave = {
      title: title ?? `Recipe (${new Date().toISOString()})`,
      ingredients,
      steps,
    };
    try {
      // Try to save via API. The API wrapper will return either a server result
      // or { savedLocally: true } if the recipe was stored locally because the
      // user wasn't authenticated or the save couldn't be performed.
      const result = await api.saveRecipe(toSave);
      // If the API indicated the recipe was saved locally (not on server),
      // let the user know and offer to navigate to login/signup.
      if (
        result &&
        typeof result === "object" &&
        "savedLocally" in result &&
        (result as { savedLocally?: boolean }).savedLocally
      ) {
        // eslint-disable-next-line no-alert
        alert(
          "A recept ideiglenesen elmentve a böngészőbe. Jelentkezz be vagy regisztrálj, hogy elmenthessük a fiókodba.",
        );
        // Offer quick navigation to login/signup so user can flush local saves after authentication
        // eslint-disable-next-line no-restricted-globals
        if (
          // eslint-disable-next-line no-restricted-globals
          confirm("Szeretnél bejelentkezni most a recept feltöltéséhez?")
        ) {
          // Use react-router's navigate to change routes instead of assigning to window.location
          navigate("/login");
        }
        return result;
      }

      // Successful server save
      // eslint-disable-next-line no-alert
      alert("Recept sikeresen elmentve a szerverre.");
      return result;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Save failed", err);
      // If something went wrong (network, unexpected error), fall back to saving locally
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
          "A recept elmentve helyileg a böngészőben (biztonsági mentés). Jelentkezz be később a feltöltéshez.",
        );
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Failed to save locally", e);
        // eslint-disable-next-line no-alert
        alert(
          "Hiba történt a mentés során és a helyi mentés sem sikerült. Ellenőrizd a hálózati kapcsolatot.",
        );
      }
      throw err;
    }
  };

  if (!recipe) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white border border-gray-200 rounded-lg shadow p-8 text-center">
          <h1 className="text-3xl font-bold mb-4">
            Nincs megjeleníthető recept
          </h1>

          <p className="text-gray-600 mb-6">
            Úgy tűnik, nem érkezett recept a navigáció állapotában. Először
            generálj egy receptet a főoldalon.
          </p>

          <div className="flex justify-center gap-4">
            <Link
              to="/"
              className="px-6 py-3 bg-green-500 text-white rounded-md hover:bg-green-600 cursor-pointer"
            >
              Recept generálása
            </Link>

            <Link
              to="/profile"
              className="px-6 py-3 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              Profil
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
          {title ?? "Generált recept"}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            <h2 className="text-2xl font-semibold text-gray-700 mb-3">
              Hozzávalók
            </h2>

            {ingredients.length === 0 ? (
              <p className="text-gray-500">Nincsenek hozzávalók.</p>
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
              Elkészítés
            </h2>

            {steps.length === 0 ? (
              <p className="text-gray-500">Nincsenek előkészített lépések.</p>
            ) : (
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                {steps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-4">
          <button
            onClick={saveRecipe}
            className="px-6 py-2 rounded bg-green-500 text-white hover:bg-green-600 cursor-pointer"
          >
            Recept mentése
          </button>

          <Link
            to="/"
            className="px-6 py-2 rounded bg-gray-500 text-white hover:bg-gray-600"
          >
            Új recept generálása
          </Link>
        </div>
      </div>
    </div>
  );
}
