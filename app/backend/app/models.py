from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class RecipeIngredient(BaseModel):
    """Egy recept hozzávalója.

    US-03: strukturált megjelenítés - név + mennyiség/megjelölés.
    """

    name: str = Field(..., description="Ingredient name, e.g. 'tomato'")
    amount: Optional[str] = Field(
        None,
        description="Human readable quantity, e.g. '2 pcs' or 'to taste'",
    )


class Recipe(BaseModel):
    """Generált recept szerkezete.

    - id: opcionális mentett azonosító (ha a recept mentve lett)
    - title: recept címe
    - ingredients: hozzávalók listája
    - steps: számozott lépések (US-03)
    """

    id: Optional[str] = None
    title: str
    ingredients: List[RecipeIngredient]
    steps: List[str]


class RecipeRequest(BaseModel):
    """Bemenet a generáláshoz.

    US-02: felhasználó beír hozzávalókat és kér generálást.
    """

    ingredients: List[str] = Field(..., description="List of ingredient names")


class ErrorResponse(BaseModel):
    """Hibaüzenet API válaszhoz (US-04)."""

    detail: str
