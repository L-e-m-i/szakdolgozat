import React, { useState } from "react";
import { useNavigate } from "react-router";

import type { Route } from "./+types/_index";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Recept generálása" },
    {
      name: "description",
      content: "Generálj receptet a megadott hozzávalók alapján",
    },
  ];
}

import type { components } from "../types";

type ApiIngredient = components["schemas"]["RecipeIngredient"];
type ApiRecipe = components["schemas"]["Recipe"];

export default function Index() {
  const [inputText, setInputText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const addTag = () => {
    const val = inputText.trim();
    if (!val) return;
    if (tags.includes(val)) {
      setInputText("");
      return;
    }
    setTags((prev) => [...prev, val]);
    setInputText("");
  };

  const removeTag = (index: number) => {
    setTags((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !inputText && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  const handleGenerateRecipe = async () => {
    if (tags.length === 0) {
      alert("Kérlek adj meg legalább egy hozzávalót!");
      return;
    }

    setIsLoading(true);

    try {
      const resp = await fetch("http://127.0.0.1:8000/recipes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: tags }),
      });

      if (!resp.ok) {
        // Try to read error message from backend
        const err = await resp.json().catch(() => null);
        const msg = err?.detail ?? `Hiba a szerverről: ${resp.status}`;
        alert(msg);
        setIsLoading(false);
        return;
      }

      const recipe: ApiRecipe = await resp.json();
      setIsLoading(false);

      // Navigate to recipe view and pass recipe via state
      navigate("/recipe", { state: { recipe } });
    } catch (e) {
      console.error(e);
      alert(
        "Hálózati hiba. Ellenőrizd, hogy a backend fut-e (http://127.0.0.1:8000) és nincs-e tűzfal vagy CORS probléma.",
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold">Recept generálása</h1>
      </div>

      <div className="max-w-3xl mx-auto">
        <label className="block text-lg font-medium text-gray-700 mb-3">
          Válassz hozzávalókat
        </label>

        <div className="mb-6 p-3 border-2 border-gray-200 rounded-md">
          <div className="flex flex-wrap gap-3">
            {tags.length === 0 ? (
              <div className="text-gray-400">
                Nincsenek hozzávalók hozzáadva
              </div>
            ) : (
              tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="flex items-center gap-3 bg-gray-100 px-4 py-2 rounded-full text-gray-800"
                >
                  <span>{tag}</span>
                  <button
                    type="button"
                    onClick={() => removeTag(idx)}
                    aria-label={`Távolítsd el: ${tag}`}
                    className="text-gray-500 hover:text-gray-700 focus:outline-none"
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        <div className="flex gap-4 items-center mb-12">
          <input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paradicsom"
            className="flex-1 p-4 border border-gray-200 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label="Hozzávaló hozzáadása"
            disabled={isLoading}
          />
          <button
            onClick={addTag}
            type="button"
            className="px-6 py-3 bg-green-500 text-white font-semibold rounded-md hover:bg-green-600 cursor-pointer transition"
            disabled={isLoading}
          >
            Hozzáadás
          </button>
        </div>

        <div className="text-center">
          <button
            onClick={handleGenerateRecipe}
            disabled={isLoading}
            className="w-full md:w-3/4 lg:w-1/2 mx-auto px-8 py-4 text-white bg-green-500 rounded-md font-semibold hover:bg-green-600 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Generálás..." : "Recept Generálása"}
          </button>
        </div>
      </div>
    </div>
  );
}
