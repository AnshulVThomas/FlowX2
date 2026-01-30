from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import os

MONGO_URL = os.getenv("MONGO_URL", "mongodb://admin:password123@localhost:27017")

async def clear_db():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client.flowx2
    await db.workflows.delete_many({})
    print("Cleared workflows collection")
    client.close()

if __name__ == "__main__":
    asyncio.run(clear_db())
