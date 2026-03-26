"""Machine learning model loading and inference via Hugging Face Spaces (Microservices)."""

from __future__ import annotations

import os
import logging
import re
import json
import importlib
import time
from typing import Any, Optional
from gradio_client import Client
from google import genai
logger = logging.getLogger(__name__)

client = genai.Client()

# =====================================================================
# HUGGING FACE SPACES CONFIGURATION
# =====================================================================
T5_SPACE_ID = "l-e-m-i/finetuned_space"
SCRATCH_SPACE_ID = "l-e-m-i/scratch_space"
DEFAULT_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"

# Timeout for ML model API calls (seconds) - 2 minutes for slow models
ML_MODEL_TIMEOUT = int(os.getenv("ML_MODEL_TIMEOUT", "120"))
# Number of retry attempts for ML model calls
ML_MODEL_MAX_RETRIES = int(os.getenv("ML_MODEL_MAX_RETRIES", "2"))


class ModelManager:
    """Manages API connections to the external AI microservices."""

    def __init__(self):
        """Initialize the model manager with lazy-loaded API clients."""
        logger.info("Initializing Hugging Face Spaces API Manager...")
        self.t5_client = None
        self.scratch_client = None
        self.gemini_model = None
        self.gemini_model_name = ""

    def _get_t5_client(self) -> Client:
        """Lazy load the T5 Gradio Client."""
        if self.t5_client is None:
            logger.info(f"Connecting to T5 Space: {T5_SPACE_ID}")
            self.t5_client = Client(T5_SPACE_ID)
        return self.t5_client

    def _get_scratch_client(self) -> Client:
        """Lazy load the Scratch Gradio Client."""
        if self.scratch_client is None:
            logger.info(f"Connecting to Scratch Space: {SCRATCH_SPACE_ID}")
            self.scratch_client = Client(SCRATCH_SPACE_ID)
        return self.scratch_client

    def generate_recipe_with_finetuned(self, ingredients: list[str]) -> dict:
        """Request recipe from the fine-tuned T5 Hugging Face Space with retry logic."""
        ingredients_text = ", ".join(ingredients).lower()
        last_error = None

        for attempt in range(1, ML_MODEL_MAX_RETRIES + 1):
            try:
                logger.info(f"T5 model attempt {attempt}/{ML_MODEL_MAX_RETRIES}")
                t5_model_client = self._get_t5_client()

                # API call to the HF Space
                result = t5_model_client.predict(
                    ingredients_text=ingredients_text,
                    api_name="/generate_recipe"
                )
                logger.info(f"Received result from T5 Space: {result}")
                return self._process_api_result(result, ingredients, model_name="finetuned")

            except Exception as e:
                last_error = e
                logger.warning(f"T5 model attempt {attempt}/{ML_MODEL_MAX_RETRIES} failed: {e}")
                if attempt < ML_MODEL_MAX_RETRIES:
                    # Wait briefly before retry (exponential backoff)
                    time.sleep(min(2 ** (attempt - 1), 5))  # 1s, 2s, 4s, max 5s

        logger.error(f"T5 Space API failed after {ML_MODEL_MAX_RETRIES} attempts: {last_error}")
        raise RuntimeError("Failed to connect to the T5 AI service after multiple attempts.") from last_error

    def generate_recipe_with_scratch(self, ingredients: list[str]) -> dict:
        """Request recipe from the custom Scratch Hugging Face Space with retry logic."""
        ingredients_text = ", ".join(ingredients).lower()
        last_error = None

        for attempt in range(1, ML_MODEL_MAX_RETRIES + 1):
            try:
                logger.info(f"Scratch model attempt {attempt}/{ML_MODEL_MAX_RETRIES}")
                scratch_client = self._get_scratch_client()

                # API call to the Scratch HF Space (includes the forced_title param we added)
                result = scratch_client.predict(
                    ingredients_text=ingredients_text,
                    api_name="/generate_scratch_recipe"
                )
                return self._process_api_result(result, ingredients, model_name="scratch")

            except Exception as e:
                last_error = e
                logger.warning(f"Scratch model attempt {attempt}/{ML_MODEL_MAX_RETRIES} failed: {e}")
                if attempt < ML_MODEL_MAX_RETRIES:
                    # Wait briefly before retry (exponential backoff)
                    time.sleep(min(2 ** (attempt - 1), 5))  # 1s, 2s, 4s, max 5s

        logger.error(f"Scratch Space API failed after {ML_MODEL_MAX_RETRIES} attempts: {last_error}")
        raise RuntimeError("Failed to connect to the Scratch AI service after multiple attempts.") from last_error

    def _extract_json_object_from_text(self, text: str) -> Optional[dict[str, Any]]:
        """Extract a JSON object from model output text (with or without code fences)."""
        if not isinstance(text, str):
            return None

        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\\s*", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\\s*```$", "", cleaned)

        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if not match:
            return None

        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None

    def generate_recipe_with_gemini(self, ingredients: list[str]) -> dict:
        """Request recipe from Gemini with retry logic and timeout."""
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured.")


        model_name = os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL).strip() or DEFAULT_GEMINI_MODEL
        ingredients_text = ", ".join(ingredients).lower()

        prompt = (
            "Generate one practical home-cooking recipe from these ingredients: "
            f"{ingredients_text}. "
            "Return only valid JSON (no markdown, no extra text) with exactly these keys: "
            "title (string), time (string), ingredients (array of objects with name and optional amount), "
            "steps (array of strings). "
            "It is not necessary to use all provided ingredients, but include as many as reasonably possible. "
            "You may add common pantry items if needed (for example: water, oil, salt, pepper). "
            "Keep the instructions concise, clear, and easy for a home cook to follow. "
            "Do not include inedible or dangerous ingredients."
            "Do not include any apologies, disclaimers, or extraneous commentary. "
            "Do not include any formatting like markdown, bullet points, or numbering in the steps."
        )

        last_error = None
        for attempt in range(1, ML_MODEL_MAX_RETRIES + 1):
            try:
                logger.info(f"Gemini model attempt {attempt}/{ML_MODEL_MAX_RETRIES}")


                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    timeout=ML_MODEL_TIMEOUT
                )
                raw_text = str(getattr(response, "text", "") or "").strip()

                if not raw_text:
                    raise RuntimeError("Gemini returned an empty response.")

                parsed = self._extract_json_object_from_text(raw_text)
                if parsed is not None:
                    return self._process_api_result(parsed, ingredients, model_name="gemini")

                return self._process_api_result(raw_text, ingredients, model_name="gemini")

            except Exception as e:
                last_error = e
                logger.warning(f"Gemini model attempt {attempt}/{ML_MODEL_MAX_RETRIES} failed: {e}")
                if attempt < ML_MODEL_MAX_RETRIES:
                    # Wait briefly before retry (exponential backoff)
                    time.sleep(min(2 ** (attempt - 1), 5))  # 1s, 2s, 4s, max 5s

        logger.error(f"Gemini API failed after {ML_MODEL_MAX_RETRIES} attempts: {last_error}")
        raise RuntimeError("Failed to connect to the Gemini AI service after multiple attempts.") from last_error

    def _process_api_result(self, result: Any, original_ingredients: list[str], model_name: str) -> dict:
        """Parse the result from the HF Spaces into the expected backend dictionary format."""
        
        # 1. CHECK: Is it already a dictionary? (Gradio Client auto-parsed it)
        if isinstance(result, dict):
            logger.info(f"Result from {model_name} was auto-parsed by the client.")
            data = result
        else:
            # 2. ATTEMPT: Parse as JSON string if it's not a dict yet
            try:
                data = json.loads(result)
            except (json.JSONDecodeError, TypeError):
                # 3. FALLBACK: If it's pure raw text (Legacy support), use Regex
                logger.info(f"Result from {model_name} is raw text. Using regex parser.")
                return self._parse_recipe_regex(result, original_ingredients, model_name)
            
        # At this point 'data' is a dictionary. Now we just format it for the frontend:
        try:
            # Format steps from string to list if necessary
            steps_raw = data.get("steps", "")
            if isinstance(steps_raw, list):
                steps = steps_raw
            elif ";" in str(steps_raw):
                steps = [s.strip(" .") for s in steps_raw.split(";") if s.strip()]
            else:
                steps = [str(steps_raw)] if steps_raw else ["Enjoy your meal!"]
                
            # Format ingredients list
            ing_raw = data.get("ingredients", "")
            if isinstance(ing_raw, list):
                ing_list = []
                for item in ing_raw:
                    if isinstance(item, dict):
                        name = str(item.get("name", "")).strip()
                        if not name:
                            continue
                        amount = item.get("amount")
                        ingredient = {"name": name}
                        if amount is not None and str(amount).strip():
                            ingredient["amount"] = str(amount).strip()
                        ing_list.append(ingredient)
                    else:
                        item_name = str(item).strip()
                        if item_name:
                            ing_list.append({"name": item_name})
            else:
                ing_list = [{"name": ing.strip()} for ing in str(ing_raw).split(",") if ing.strip()]
            
            if not ing_list:
                ing_list = [{"name": ing} for ing in original_ingredients]

            return {
                "title": str(data.get("title", "Generated Recipe")).title(),
                "time": str(data.get("time", "30 mins")),
                "ingredients": ing_list,
                "steps": steps,
                "model": model_name
            }
        except Exception as e:
            logger.error(f"Error re-formatting dictionary data: {e}")
            # Final fallback to raw text if formatting the dict fails
            return {"title": "Error", "ingredients": [], "steps": [str(result)], "time": "", "model": model_name}

    def _parse_recipe_regex(self, text: str, ingredients: list[str], model_name: str) -> dict:
        """Fallback parser for raw text (Legacy support)."""
        text = text.strip()

        def _extract(section: str) -> Optional[str]:
            pattern = rf"{section}:\s*(.*?)(?=\btitle:|\btime:|\bingredients:|\bsteps:|$)"
            match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
            return match.group(1).strip() if match else None

        title = _extract("title") or f"Quick recipe: {', '.join(ingredients)}"
        time_str = _extract("time") or "30 mins"

        parsed_ingredients: list[str] = []
        ingredients_raw = _extract("ingredients")
        if ingredients_raw:
            normalized = ingredients_raw.replace("\n", ",")
            parsed_ingredients = [
                item.strip(" .")
                for item in normalized.split(",")
                if item.strip(" .")
            ]

        steps: list[str] = []
        steps_raw = _extract("steps")
        if steps_raw:
            if ";" in steps_raw:
                steps = [s.strip(" .") for s in steps_raw.split(";") if s.strip()]
            else:
                steps = [line.lstrip("0123456789.-) •").strip() for line in steps_raw.splitlines() if line.strip()]

        if not steps:
            steps = ["Prepare all ingredients.", f"Mix together: {', '.join(ingredients)}.", "Serve warm."]

        ingredient_source = parsed_ingredients or ingredients
        ingredient_list = [{"name": ing} for ing in ingredient_source]

        return {
            "title": title.title(),
            "ingredients": ingredient_list,
            "steps": steps,
            "time": time_str,
            "model": model_name,
        }

# Global model manager instance (singleton pattern)
_model_manager: Optional[ModelManager] = None

def get_model_manager() -> ModelManager:
    """Get or create the global API manager instance."""
    global _model_manager
    if _model_manager is None:
        _model_manager = ModelManager()
    return _model_manager