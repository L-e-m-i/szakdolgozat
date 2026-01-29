from __future__ import annotations

from typing import List

from app.models import Recipe, RecipeIngredient


def _normalize_ingredients(raw_ingredients: List[str]) -> List[str]:
    """Tisztítja és ellenőrzi a hozzávalókat.

    - Üres, csak whitespace vagy duplikált elemek kidobása
    - Legalább 1 érvényes hozzávaló kötelező (US-02 AC2)
    """

    cleaned = [item.strip() for item in raw_ingredients if item and item.strip()]
    # Távolítsuk el a duplikátumokat, de tartsuk a sorrendet
    seen = set()
    unique: List[str] = []
    for item in cleaned:
        lower = item.lower()
        if lower not in seen:
            seen.add(lower)
            unique.append(item)

    if not unique:
        raise ValueError("At least one ingredient is required.")

    return unique


def generate_recipe_from_ingredients(raw_ingredients: List[str]) -> Recipe:
    """Egyszerű recept-generáló függvény a user storyk alapján.

    US-02 & US-03:
    - Bemenet: hozzávalók listája
    - Kimenet: strukturált Recipe (cím, hozzávalók, lépések)

    Hibakezelés (US-04):
    - Üres / csak whitespace input esetén ValueError-t dobunk.
    """

    ingredients = _normalize_ingredients(raw_ingredients)

    # Magyarított cím: "Gyors recept: <hozzávalók>"
    title = f"Gyors recept: {', '.join(ingredients)}"

    # Magyarított mennyiségjelölés ("ízlés szerint")
    ingredient_models = [
        RecipeIngredient(name=name, amount="ízlés szerint") for name in ingredients
    ]

    # Magyarított lépések
    steps = [
        "Készítsd elő az összetevőket.",
        f"Keverd össze a {', '.join(ingredients)} egy megfelelő serpenyőben vagy tálban.",
        "Ízlés szerint sózd, borsozd, majd főzd készre.",
        "Tálald azonnal, melegen.",
    ]

    return Recipe(title=title, ingredients=ingredient_models, steps=steps)


def get_empty_recipes() -> list[Recipe]:
    """Visszaad egy üres lista-t az "empty state" támogatására (US-01).

    A frontenden ez alapján lehet eldönteni, hogy üres állapotot mutasson-e.
    """

    return []


def get_saved_recipes() -> list[Recipe]:
    """Visszaad egy listát a mentett receptekről (US-05).

    Saved recipes are persisted in the database and retrieved by the API layer.
    Do not fabricate or synthesize demo saved recipes here — return an empty
    list when there are no saved recipes available.
    """
    # The service layer does not create demo items; the API / DB access layer
    # is responsible for returning saved recipes. Return an empty list by default.
    return []
