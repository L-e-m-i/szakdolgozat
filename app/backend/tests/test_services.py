from __future__ import annotations

from app.main import app
from app.services import generate_recipe_from_ingredients, get_empty_recipes
from fastapi.testclient import TestClient

client = TestClient(app)


def test_get_empty_recipes_returns_empty_list() -> None:
    assert get_empty_recipes() == []


def test_generate_recipe_from_ingredients_creates_structured_recipe() -> None:
    ingredients = ["tomato", "basil", "pasta"]

    recipe = generate_recipe_from_ingredients(ingredients)

    assert recipe.title.startswith("Gyors recept: ")
    assert len(recipe.ingredients) == 3
    assert len(recipe.steps) >= 3
    # Ingredients preserve order
    assert [i.name for i in recipe.ingredients] == ingredients


def test_generate_recipe_ignores_empty_and_whitespace_only_items() -> None:
    ingredients = ["  tomato  ", "", "   ", "basil"]

    recipe = generate_recipe_from_ingredients(ingredients)

    assert [i.name for i in recipe.ingredients] == ["tomato", "basil"]


def test_generate_recipe_raises_on_no_valid_ingredients() -> None:
    ingredients: list[str] = ["   ", ""]

    try:
        generate_recipe_from_ingredients(ingredients)
    except ValueError as exc:
        assert "At least one ingredient is required" in str(exc)
    else:
        raise AssertionError("Expected ValueError for empty ingredients")


def test_root_health_returns_200() -> None:
    response = client.get("/")
    assert response.status_code == 200


def test_list_recipes_endpoint_returns_empty_list() -> None:
    response = client.get("/recipes")
    assert response.status_code == 200
    assert response.json() == []


def test_generate_recipe_endpoint_returns_400_on_invalid_input() -> None:
    response = client.post("/recipes/generate", json={"ingredients": ["   ", ""]})
    assert response.status_code == 400
    body = response.json()
    # Backend returns a structured error object with 'message' and 'code'
    assert "At least one ingredient is required" in body.get("message", "")
    assert body.get("code") == "invalid_input"


def test_saved_recipes_endpoint_returns_recipe() -> None:
    response = client.get("/user/saved-recipes")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    # There should be no default saved recipe by default
    assert body == []


# Additional edge-case tests for ingredient normalization and recipe content
def test_normalize_ingredients_removes_duplicates_case_insensitive_and_trims() -> None:
    # Mixed case, duplicates, and extra whitespace should be cleaned so only unique,
    # trimmed, case-preserving first occurrences remain.
    raw = ["  Tomato  ", "tomato", "BASIL", " basil ", "Pasta", "pasta  ", "Pasta"]
    recipe = generate_recipe_from_ingredients(raw)
    names = [ing.name for ing in recipe.ingredients]
    # Expect unique names in the order of first normalized appearance: "Tomato", "BASIL", "Pasta"
    assert names == ["Tomato", "BASIL", "Pasta"]

    # Check that amounts are present and use the expected development label
    assert all(
        getattr(ing, "amount", None) == "ízlés szerint" for ing in recipe.ingredients
    )


def test_generate_recipe_steps_reference_ingredients_and_are_non_empty() -> None:
    ingredients = ["egg", "milk", "flour"]
    recipe = generate_recipe_from_ingredients(ingredients)

    # Steps should reference one or more ingredient names and be non-empty strings
    assert isinstance(recipe.steps, list)
    assert len(recipe.steps) >= 3
    for step in recipe.steps:
        assert isinstance(step, str)
        assert step.strip() != ""

    # At least one step should mention at least one of the provided ingredient names
    lowered = " ".join(recipe.steps).lower()
    assert any(i in lowered for i in ingredients)


def test_generate_recipe_with_long_names_handles_length_gracefully() -> None:
    long_name = "very-" + "long-" * 20 + "ingredient"
    recipe = generate_recipe_from_ingredients([long_name, "salt"])
    # Should include the long ingredient name without truncation errors
    assert any(long_name == ing.name for ing in recipe.ingredients)
    # Steps should still be present
    assert len(recipe.steps) >= 3
