import os
from pathlib import Path
from dotenv import load_dotenv

# Load root .env explicitly
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path)

class Settings:
    # Use the same default as database/connection.py or prefer 'MONGODB_URL'
    # Database Configuration - now driven by root .env
    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://admin:password123@localhost:27017")
    
    # Add other settings as needed
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    FLOWX_MODE: str = os.getenv("FLOWX_MODE", "dev")

settings = Settings()
