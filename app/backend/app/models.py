from __future__ import annotations

from enum import Enum
from typing import Annotated, List, Optional

from pydantic import BaseModel, Field, StringConstraints

IngredientInput = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
]


class ModelChoice(str, Enum):
    """Which AI model to use for recipe generation."""

    scratch = "scratch"
    finetuned = "finetuned"
    gemini = "gemini"
    both = "both"


class RecipeIngredient(BaseModel):
    """One ingredient in a recipe.

    US-03: structured display - name + quantity/label.
    """

    name: str = Field(
        ...,
        min_length=1,
        max_length=150,
        description="Ingredient name, e.g. 'tomato'",
    )
    amount: Optional[str] = Field(
        None,
        max_length=50,
        description="Human readable quantity, e.g. '2 pcs' or 'to taste'",
    )


class Recipe(BaseModel):
    """Structure of a generated recipe.

    - id: optional saved identifier (if the recipe was saved)
    - title: recipe title
    - time: estimated cooking time (optional)
    - ingredients: list of ingredients
    - steps: numbered steps (US-03)
    - model: which model generated it (optional)
    """

    id: Optional[str] = None
    title: str
    time: Optional[str] = Field(None, description="Estimated cooking time, e.g. '30 mins'")
    ingredients: List[RecipeIngredient]
    steps: List[str]
    model: Optional[str] = Field(None, description="Which model generated this recipe")


class RecipeRequest(BaseModel):
    """Input for generation.

    US-02: user enters ingredients and requests generation.
    """

    ingredients: List[IngredientInput] = Field(
        ...,
        min_length=1,
        max_length=30,
        description="List of ingredient names",
    )
    model: ModelChoice = Field(
        ModelChoice.finetuned,
        description=(
            "Which model to use: 'scratch' (RecipeTransformerV4), "
            "'finetuned' (Flan-T5), 'gemini' (Google Gemini), or "
            "'both' (returns scratch + finetuned recipes)."
        ),
    )


class DualRecipeResponse(BaseModel):
    """Response when model='both': contains one recipe from each model."""

    scratch: Recipe
    finetuned: Recipe


class ErrorResponse(BaseModel):
    """Error message for API responses (US-04)."""

    detail: str
