from pathlib import Path
from dotenv import load_dotenv

# Load .env located in the backend directory (app/backend/.env)
env_path = Path(__file__).resolve().parents[1] / ".env"
if env_path.exists():
    load_dotenv(env_path)