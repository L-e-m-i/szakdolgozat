import React, { useState } from "react";
import { useNavigate } from "react-router";

import type { Route } from "./+types/_index";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Recipe Generator" },
    {
      name: "description",
      content: "Generate recipes based on ingredients you provide",
    },
  ];
}

import type { components } from "../types";

type ApiIngredient = components["schemas"]["RecipeIngredient"];
type ApiRecipe = components["schemas"]["Recipe"];

type ModelChoice = "scratch" | "finetuned" | "gemini" | "both";

export default function Index() {
  const [inputText, setInputText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [modelChoice, setModelChoice] = useState<ModelChoice>("finetuned");
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
      alert("Please add at least one ingredient!");
      return;
    }

    setIsLoading(true);

    try {
      const resp = await fetch("http://127.0.0.1:8000/recipes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: tags, model: modelChoice }),
      });

      if (!resp.ok) {
        // Try to read error message from backend
        const err = await resp.json().catch(() => null);
        const msg = err?.message ?? err?.detail ?? `Server error: ${resp.status}`;
        alert(msg);
        setIsLoading(false);
        return;
      }

      const data = await resp.json();
      setIsLoading(false);

      // Navigate to recipe view and pass recipe(s) via state
      navigate("/recipe", { state: { recipe: data } });
    } catch (e) {
      console.error(e);
      alert(
        "Network error. Make sure the backend is running (http://127.0.0.1:8000) and there are no firewall or CORS issues.",
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold">Recipe Generator</h1>
        <p className="text-gray-600 mt-2">
          Generate delicious recipes using AI models
        </p>
      </div>

      <div className="max-w-3xl mx-auto">
        <label className="block text-lg font-medium text-gray-700 mb-3">
          Select Ingredients
        </label>

        <div className="mb-6 p-3 border-2 border-gray-200 rounded-md">
          <div className="flex flex-wrap gap-3">
            {tags.length === 0 ? (
              <div className="text-gray-400">No ingredients added</div>
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
                    aria-label={`Remove: ${tag}`}
                    className="text-gray-500 hover:text-gray-700 focus:outline-none"
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        <div className="flex gap-4 items-center mb-8">
          <input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., tomato, chicken, garlic"
            className="flex-1 p-4 border border-gray-200 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label="Add ingredient"
            disabled={isLoading}
          />
          <button
            onClick={addTag}
            type="button"
            className="px-6 py-3 bg-green-500 text-white font-semibold rounded-md hover:bg-green-600 cursor-pointer transition"
            disabled={isLoading}
          >
            Add
          </button>
        </div>

        <div className="mb-8 p-4 bg-gray-50 border border-gray-200 rounded-md">
          <label className="block text-lg font-medium text-gray-700 mb-4">
            Choose AI Model
          </label>
          <div className="space-y-3">
            <div className="flex items-center">
              <input
                type="radio"
                id="model-finetuned"
                name="model"
                value="finetuned"
                checked={modelChoice === "finetuned"}
                onChange={(e) => setModelChoice(e.target.value as ModelChoice)}
                disabled={isLoading}
                className="w-4 h-4 text-blue-600 cursor-pointer"
              />
              <label
                htmlFor="model-finetuned"
                className="ml-3 cursor-pointer text-gray-700"
              >
                <span className="font-medium">Fine-tuned Model (Recommended)</span>
                <p className="text-sm text-gray-500">
                  Pre-trained T5 model, optimized for recipes
                </p>
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="radio"
                id="model-gemini"
                name="model"
                value="gemini"
                checked={modelChoice === "gemini"}
                onChange={(e) => setModelChoice(e.target.value as ModelChoice)}
                disabled={isLoading}
                className="w-4 h-4 text-blue-600 cursor-pointer"
              />
              <label
                htmlFor="model-gemini"
                className="ml-3 cursor-pointer text-gray-700"
              >
                <span className="font-medium">Gemini Model</span>
                <p className="text-sm text-gray-500">
                  Google Gemini for fast, general-purpose recipe generation
                </p>
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="radio"
                id="model-scratch"
                name="model"
                value="scratch"
                checked={modelChoice === "scratch"}
                onChange={(e) => setModelChoice(e.target.value as ModelChoice)}
                disabled={isLoading}
                className="w-4 h-4 text-blue-600 cursor-pointer"
              />
              <label
                htmlFor="model-scratch"
                className="ml-3 cursor-pointer text-gray-700"
              >
                <span className="font-medium">Custom Model</span>
                <p className="text-sm text-gray-500">
                  Custom TransformerV3 model
                </p>
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="radio"
                id="model-both"
                name="model"
                value="both"
                checked={modelChoice === "both"}
                onChange={(e) => setModelChoice(e.target.value as ModelChoice)}
                disabled={isLoading}
                className="w-4 h-4 text-blue-600 cursor-pointer"
              />
              <label
                htmlFor="model-both"
                className="ml-3 cursor-pointer text-gray-700"
              >
                <span className="font-medium">Both Models</span>
                <p className="text-sm text-gray-500">
                  Compare recipes from both models
                </p>
              </label>
            </div>
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={handleGenerateRecipe}
            disabled={isLoading || tags.length === 0}
            className="w-full md:w-3/4 lg:w-1/2 mx-auto px-8 py-4 text-white bg-blue-600 rounded-md font-semibold hover:bg-blue-700 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Generating..." : "Generate Recipe"}
          </button>
        </div>
      </div>
    </div>
  );
}
