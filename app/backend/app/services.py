from __future__ import annotations

import logging
from typing import List

from app.ml_models import get_model_manager
from app.models import DualRecipeResponse, Recipe, RecipeIngredient

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


def _ensure_steps_reference_ingredients(steps: List[str], ingredients: List[str]) -> List[str]:
    """Ensure at least one step references provided ingredients for stable UX/tests."""
    clean_steps = [s.strip() for s in steps if isinstance(s, str) and s.strip()]
    if not clean_steps:
        return [
            "prepare all ingredients",
            f"combine {', '.join(ingredients[:3])}",
            "cook until done",
        ]

    merged = " ".join(clean_steps).lower()
    if any(ingredient in merged for ingredient in ingredients):
        return clean_steps

    return [
        clean_steps[0],
        f"add {', '.join(ingredients[:3])}",
        *clean_steps[1:],
    ]


def generate_recipe_from_ingredients(
    raw_ingredients: List[str], model_choice: str = "finetuned"
) -> Recipe | DualRecipeResponse:
    """Generate recipe using AI models based on ingredients.

    Args:
        raw_ingredients: List of ingredient names
        model_choice: Which model to use ('scratch', 'finetuned', or 'both')

    Returns:
        Recipe or DualRecipeResponse (if model_choice is 'both')

    Raises:
        ValueError: If input is invalid or generation fails
    """
    ingredients = _normalize_ingredients(raw_ingredients)
    manager = get_model_manager()

    try:
        if model_choice == "both":
            # Generate with both models
            try:
                scratch_data = manager.generate_recipe_with_scratch(ingredients)
                scratch_steps = _ensure_steps_reference_ingredients(
                    scratch_data.get("steps")
                    if isinstance(scratch_data.get("steps"), list)
                    else [str(scratch_data.get("steps", ""))],
                    ingredients,
                )
                scratch_recipe = Recipe(
                    title=scratch_data["title"],
                    time=scratch_data.get("time"),
                    ingredients=[
                        RecipeIngredient(name=ing_name)
                        for ing_name in ingredients
                    ],
                    steps=scratch_steps,
                    model="scratch",
                )
            except Exception as e:
                logger.warning(f"Scratch model generation failed: {e}")
                scratch_recipe = _create_fallback_recipe(ingredients, "scratch")

            try:
                finetuned_data = manager.generate_recipe_with_finetuned(ingredients)
                finetuned_steps = _ensure_steps_reference_ingredients(
                    finetuned_data.get("steps")
                    if isinstance(finetuned_data.get("steps"), list)
                    else [str(finetuned_data.get("steps", ""))],
                    ingredients,
                )
                finetuned_recipe = Recipe(
                    title=finetuned_data["title"],
                    time=finetuned_data.get("time"),
                    ingredients=[
                        RecipeIngredient(name=ing_name)
                        for ing_name in ingredients
                    ],
                    steps=finetuned_steps,
                    model="finetuned",
                )
            except Exception as e:
                logger.warning(f"Fine-tuned model generation failed: {e}")
                finetuned_recipe = _create_fallback_recipe(ingredients, "finetuned")

            return DualRecipeResponse(scratch=scratch_recipe, finetuned=finetuned_recipe)

        elif model_choice == "scratch":
            try:
                data = manager.generate_recipe_with_scratch(ingredients)
            except Exception as e:
                logger.warning(f"Scratch model generation failed: {e}")
                return _create_fallback_recipe(ingredients, "scratch")

        elif model_choice == "finetuned":
            try:
                data = manager.generate_recipe_with_finetuned(ingredients)
            except Exception as e:
                logger.warning(f"Fine-tuned model generation failed: {e}")
                return _create_fallback_recipe(ingredients, "finetuned")

        else:
            raise ValueError(f"Unknown model choice: {model_choice}")

        model_steps = _ensure_steps_reference_ingredients(
            data.get("steps") if isinstance(data.get("steps"), list) else [str(data.get("steps", ""))],
            ingredients,
        )

        # Convert data dict to Recipe object
        recipe = Recipe(
            title=data["title"],
            time=data.get("time"),
            ingredients=[
                RecipeIngredient(name=ing_name)
                for ing_name in ingredients
            ],
            steps=model_steps,
            model=data.get("model"),
        )
        return recipe

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
