from __future__ import annotations

import logging
from typing import List

from app.ml_models import get_model_manager
from app.models import Recipe, RecipeIngredient

logger = logging.getLogger(__name__)


def _normalize_ingredients(raw_ingredients: List[str]) -> List[str]:
    """Normalize and validate ingredients.

    - Remove empty, whitespace-only, or duplicate items
    - At least 1 valid ingredient is required
    """
    cleaned = [item.strip().lower() for item in raw_ingredients if item and item.strip()]
    # Remove duplicates while preserving order
    seen = set()
    unique: List[str] = []
    for item in cleaned:
        if item not in seen:
            seen.add(item)
            unique.append(item)

    if not unique:
        raise ValueError("At least one ingredient is required.")

    return unique


def _normalize_steps(steps: List[str]) -> List[str]:
    """Normalize steps to a non-empty list without injecting extra ingredients."""
    clean_steps = [s.strip() for s in steps if isinstance(s, str) and s.strip()]
    if not clean_steps:
        clean_steps = [
            "prepare ingredients",
            "cook until done",
        ]

    if len(clean_steps) < 3:
        clean_steps.append("serve and enjoy")

    return clean_steps


def _extract_ingredient_names(model_ingredients: object, fallback: List[str]) -> List[str]:
    """Extract a flat list of ingredient names from model output."""
    names: List[str] = []
    if isinstance(model_ingredients, list):
        for item in model_ingredients:
            if isinstance(item, dict):
                name = item.get("name")
            else:
                name = item
            if name:
                names.append(str(name).strip())
    elif isinstance(model_ingredients, str):
        names = [part.strip() for part in model_ingredients.split(",") if part.strip()]

    return names if names else fallback


def generate_recipe_from_ingredients(
    raw_ingredients: List[str], model_choices: List[str] | None = None
) -> list[Recipe]:
    """Generate recipe using AI models based on ingredients.

    Args:
        raw_ingredients: List of ingredient names
        model_choices: Which models to use (1-3): 'scratch', 'finetuned', 'gemini'

    Returns:
        A list of generated recipes, one per selected model

    Raises:
        ValueError: If input is invalid or generation fails
    """
    ingredients = _normalize_ingredients(raw_ingredients)
    selected_models = model_choices or ["finetuned"]

    if len(selected_models) < 1 or len(selected_models) > 3:
        raise ValueError("Select between 1 and 3 models.")

    if len(set(selected_models)) != len(selected_models):
        raise ValueError("Duplicate models are not allowed.")

    manager = get_model_manager()
    recipes: list[Recipe] = []

    try:
        for model_choice in selected_models:
            if model_choice == "scratch":
                try:
                    data = manager.generate_recipe_with_scratch(ingredients)
                except Exception as e:
                    logger.warning(f"Scratch model generation failed: {e}")
                    recipes.append(_create_fallback_recipe(ingredients, "scratch"))
                    continue

            elif model_choice == "finetuned":
                try:
                    data = manager.generate_recipe_with_finetuned(ingredients)
                except Exception as e:
                    logger.warning(f"Fine-tuned model generation failed: {e}")
                    recipes.append(_create_fallback_recipe(ingredients, "finetuned"))
                    continue

            elif model_choice == "gemini":
                try:
                    data = manager.generate_recipe_with_gemini(ingredients)
                except Exception as e:
                    logger.warning(f"Gemini model generation failed: {e}")
                    recipes.append(_create_fallback_recipe(ingredients, "gemini"))
                    continue

            else:
                raise ValueError(f"Unknown model choice: {model_choice}")

            model_steps = _normalize_steps(
                data.get("steps") if isinstance(data.get("steps"), list) else [str(data.get("steps", ""))],
            )
            model_ingredient_names = _extract_ingredient_names(
                data.get("ingredients"),
                ingredients,
            )

            recipes.append(
                Recipe(
                    title=str(data.get("title", "Generated Recipe")),
                    time=data.get("time"),
                    ingredients=[
                        RecipeIngredient(name=ing_name)
                        for ing_name in model_ingredient_names
                    ],
                    steps=model_steps,
                    model=str(data.get("model") or model_choice),
                )
            )

        return recipes

    except Exception as e:
        logger.error(f"Recipe generation error: {e}")
        raise


def _create_fallback_recipe(ingredients: List[str], model_name: str) -> Recipe:
    """Create a fallback recipe when model generation fails."""
    ingredient_models = [
        RecipeIngredient(name=name) for name in ingredients
    ]

    steps = [
        "Prepare all ingredients",
        f"Mix {', '.join(ingredients[:3])} together",
        "Cook over medium heat",
        "Season to taste",
        "Serve hot",
    ]

    return Recipe(
        title=f"Simple Recipe with {', '.join(ingredients)}",
        time="30 mins",
        ingredients=ingredient_models,
        steps=steps,
        model=model_name,
    )


def get_empty_recipes() -> list[Recipe]:
    """Return an empty list for empty state support.

    Used by frontend to determine if empty state should be shown.
    """
    return []


def get_saved_recipes() -> list[Recipe]:
    """Return a list of saved recipes.

    Saved recipes are persisted in the database and retrieved by the API layer.
    Do not fabricate demo recipes here — return an empty list when there are no saved recipes.
    """
    return []
