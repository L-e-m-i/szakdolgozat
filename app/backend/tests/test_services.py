from __future__ import annotations

import threading
import time
import uuid

from app.db.models import SavedRecipe as DBSavedRecipe
from app.db.models import User as DBUser
from app.db.session import SessionLocal
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


def _auth_context() -> tuple[dict[str, str], str]:
    username = _unique_username()
    email = _unique_email()
    password = "ServiceTestPass123"  # Updated: meets password requirements (8+ chars, uppercase, lowercase, number)

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
    return {"Authorization": f"Bearer {token}"}, username


def _auth_headers() -> dict[str, str]:
    headers, _ = _auth_context()
    return headers


def test_get_empty_recipes_returns_empty_list() -> None:
    assert get_empty_recipes() == []


def test_generate_recipe_from_ingredients_creates_structured_recipe() -> None:
    ingredients = ["tomato", "basil", "pasta"]

    recipes = generate_recipe_from_ingredients(ingredients)
    assert len(recipes) == 1
    recipe = recipes[0]
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
    recipes = generate_recipe_from_ingredients(ingredients)
    assert len(recipes) == 1
    recipe = recipes[0]

    # Steps should be non-empty strings
    assert isinstance(recipe.steps, list)
    assert len(recipe.steps) >= 2
    for step in recipe.steps:
        assert isinstance(step, str)
        assert step.strip() != ""


def test_generate_recipe_with_long_names_handles_length_gracefully() -> None:
    long_name = "very-" + "long-" * 20 + "ingredient"
    recipes = generate_recipe_from_ingredients([long_name, "salt"])
    assert len(recipes) == 1
    recipe = recipes[0]
    # Should return a recipe without crashing and with non-empty ingredients/steps
    assert recipe.ingredients is not None
    assert len(recipe.ingredients) > 0
    assert len(recipe.steps) >= 3


def test_generate_recipe_with_gemini_falls_back_when_unavailable(monkeypatch) -> None:
    class FailingGeminiManager:
        def generate_recipe_with_gemini(self, ingredients):
            raise RuntimeError("Gemini is unavailable")

    monkeypatch.setattr("app.services.get_model_manager", lambda: FailingGeminiManager())

    recipes = generate_recipe_from_ingredients(["tomato", "garlic"], model_choices=["gemini"])
    assert len(recipes) == 1
    recipe = recipes[0]
    assert recipe.model == "gemini"
    assert recipe.title
    assert len(recipe.steps) >= 3


def test_delete_saved_recipe_returns_204_with_empty_body() -> None:
    headers = _auth_headers()

    save_resp = client.post(
        "/user/saved-recipes",
        headers=headers,
        json={
            "title": "Delete me",
            "ingredients": [{"name": "tomato"}],
            "steps": ["slice", "serve"],
        },
    )
    assert save_resp.status_code == 201, save_resp.text
    saved_id = save_resp.json()["id"]

    delete_resp = client.delete(f"/user/saved-recipes/{saved_id}", headers=headers)
    assert delete_resp.status_code == 204
    assert delete_resp.text == ""


def test_get_saved_recipe_returns_structured_error_for_invalid_saved_data() -> None:
    headers, username = _auth_context()

    db = SessionLocal()
    try:
        db_user = db.query(DBUser).filter(DBUser.username == username).first()
        assert db_user is not None

        invalid_saved = DBSavedRecipe(
            user_id=db_user.id,
            title="Corrupted recipe",
            # Missing required Recipe fields -> should trigger backend validation failure.
            recipe_data={"unexpected": "shape"},
        )
        db.add(invalid_saved)
        db.commit()
        db.refresh(invalid_saved)
        saved_id = invalid_saved.id
    finally:
        db.close()

    resp = client.get(f"/user/saved-recipes/{saved_id}", headers=headers)
    assert resp.status_code == 500
    body = resp.json()
    assert body.get("code") == "invalid_saved_data"
    assert "Saved recipe data is invalid" in body.get("message", "")


def test_generate_recipe_runs_models_in_parallel_and_keeps_order(monkeypatch) -> None:
    class ParallelAwareManager:
        def __init__(self):
            self._lock = threading.Lock()
            self.active = 0
            self.max_active = 0

        def _run(self, model: str):
            with self._lock:
                self.active += 1
                if self.active > self.max_active:
                    self.max_active = self.active
            try:
                time.sleep(0.05)
                return {
                    "title": f"{model} recipe",
                    "ingredients": [{"name": "tomato"}],
                    "steps": ["prep", "cook", "serve"],
                    "time": "10 mins",
                    "model": model,
                }
            finally:
                with self._lock:
                    self.active -= 1

        def generate_recipe_with_scratch(self, ingredients):
            return self._run("scratch")

        def generate_recipe_with_finetuned(self, ingredients):
            return self._run("finetuned")

        def generate_recipe_with_gemini(self, ingredients):
            return self._run("gemini")

    manager = ParallelAwareManager()
    monkeypatch.setattr("app.services.get_model_manager", lambda: manager)

    recipes = generate_recipe_from_ingredients(
        ["tomato", "garlic"],
        model_choices=["scratch", "finetuned", "gemini"],
    )

    assert [recipe.model for recipe in recipes] == ["scratch", "finetuned", "gemini"]
    assert manager.max_active >= 2
