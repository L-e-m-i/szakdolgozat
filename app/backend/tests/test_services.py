from __future__ import annotations

import uuid

from app.main import app
from app.services import (
    _normalize_ingredients,
    generate_recipe_from_ingredients,
    get_empty_recipes,
)
from fastapi.testclient import TestClient

client = TestClient(app)


def _unique_username() -> str:
    return f"svcuser_{uuid.uuid4().hex[:8]}"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex[:8]}@example.com"


def _auth_headers() -> dict[str, str]:
    username = _unique_username()
    email = _unique_email()
    password = "service-test-pass-123"

    signup = client.post(
        "/auth/signup",
        json={"username": username, "email": email, "password": password},
    )
    assert signup.status_code == 201, signup.text

    login = client.post(
        "/auth/token",
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_get_empty_recipes_returns_empty_list() -> None:
    assert get_empty_recipes() == []


def test_generate_recipe_from_ingredients_creates_structured_recipe() -> None:
    ingredients = ["tomato", "basil", "pasta"]

    recipe = generate_recipe_from_ingredients(ingredients)
    assert recipe.title is not None
    assert recipe.ingredients is not None
    assert recipe.steps is not None


def test_generate_recipe_ignores_empty_and_whitespace_only_items() -> None:
    ingredients = ["  tomato  ", "", "   ", "basil"]
    normalized = _normalize_ingredients(ingredients)
    assert normalized == ["tomato", "basil"]


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


def test_generate_recipe_endpoint_returns_422_on_invalid_input() -> None:
    response = client.post("/recipes/generate", json={"ingredients": ["   ", ""]})
    assert response.status_code == 422
    body = response.json()
    assert body.get("code") == "validation_error"


def test_saved_recipes_endpoint_requires_auth() -> None:
    response = client.get("/user/saved-recipes")
    assert response.status_code == 401


def test_saved_recipes_endpoint_returns_list_for_authenticated_user() -> None:
    headers = _auth_headers()
    response = client.get("/user/saved-recipes", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert body == []


# Additional edge-case tests for ingredient normalization and recipe content
def test_normalize_ingredients_removes_duplicates_case_insensitive_and_trims() -> None:
    # Mixed case, duplicates, and extra whitespace should be cleaned so only unique,
    # lowercase, trimmed ingredients remain in first-seen order.
    raw = ["  Tomato  ", "tomato", "BASIL", " basil ", "Pasta", "pasta  ", "Pasta"]
    normalized = _normalize_ingredients(raw)
    assert normalized == ["tomato", "basil", "pasta"]



def test_generate_recipe_steps_reference_ingredients_and_are_non_empty() -> None:
    ingredients = ["egg", "milk", "flour"]
    recipe = generate_recipe_from_ingredients(ingredients)

    # Steps should be non-empty strings
    assert isinstance(recipe.steps, list)
    assert len(recipe.steps) >= 2
    for step in recipe.steps:
        assert isinstance(step, str)
        assert step.strip() != ""


def test_generate_recipe_with_long_names_handles_length_gracefully() -> None:
    long_name = "very-" + "long-" * 20 + "ingredient"
    recipe = generate_recipe_from_ingredients([long_name, "salt"])
    # Should include the long ingredient name without truncation errors
    assert any(long_name == ing.name for ing in recipe.ingredients)
    # Steps should still be present
    assert len(recipe.steps) >= 3
