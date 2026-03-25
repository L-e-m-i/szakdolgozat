import React, { useState } from "react";
import { useNavigate } from "react-router";
import api, { formatApiError } from "../services/api";

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

type ModelChoice = "scratch" | "finetuned" | "gemini";

export default function Index() {
  const [inputText, setInputText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModels, setSelectedModels] = useState<ModelChoice[]>(["finetuned"]);
  const navigate = useNavigate();

  const toggleModel = (model: ModelChoice) => {
    setSelectedModels((prev) => {
      if (prev.includes(model)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== model);
      }

      if (prev.length >= 3) {
        return prev;
      }

      return [...prev, model];
    });
  };

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

    if (selectedModels.length < 1 || selectedModels.length > 3) {
      alert("Please select between 1 and 3 models.");
      return;
    }

    setIsLoading(true);

    try {
      const data = await api.generateRecipe(tags, selectedModels);

      // Navigate to recipe view and pass recipe(s) via state
      navigate("/recipe", { state: { recipe: data } });
    } catch (err) {
      const normalized = formatApiError(err);
      alert(normalized.message || "Failed to generate recipe.");
    } finally {
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
            Choose AI Models (1-3)
          </label>
          <div className="space-y-3">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="model-finetuned"
                name="model"
                value="finetuned"
                checked={selectedModels.includes("finetuned")}
                onChange={() => toggleModel("finetuned")}
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
                type="checkbox"
                id="model-gemini"
                name="model"
                value="gemini"
                checked={selectedModels.includes("gemini")}
                onChange={() => toggleModel("gemini")}
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
                type="checkbox"
                id="model-scratch"
                name="model"
                value="scratch"
                checked={selectedModels.includes("scratch")}
                onChange={() => toggleModel("scratch")}
                disabled={isLoading}
                className="w-4 h-4 text-blue-600 cursor-pointer"
              />
              <label
                htmlFor="model-scratch"
                className="ml-3 cursor-pointer text-gray-700"
              >
                <span className="font-medium">Custom Model</span>
                <p className="text-sm text-gray-500">
                  Custom TransformerV4 model
                </p>
              </label>
            </div>

          </div>
          <p className="text-xs text-gray-500 mt-3">
            Select at least 1 model and up to 3 models.
          </p>
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
