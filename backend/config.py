import os

class Settings:
    # Use the same default as database/connection.py or prefer 'MONGODB_URL'
    MONGODB_URL: str = os.getenv("MONGODB_URL", os.getenv("MONGO_URL", "mongodb://admin:password123@localhost:27017"))
    
    # Add other settings as needed
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    FLOWX_MODE: str = os.getenv("FLOWX_MODE", "dev")

settings = Settings()
