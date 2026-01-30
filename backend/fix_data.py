from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import os

MONGO_URL = os.getenv("MONGO_URL", "mongodb://admin:password123@localhost:27017")

async def fix_ids():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client.flowx2
    collection = db.workflows
    
    count = 0
    async for doc in collection.find({}):
        if "id" not in doc or doc["id"] is None:
            new_id = str(doc["_id"])
            await collection.update_one(
                {"_id": doc["_id"]},
                {"$set": {"id": new_id}}
            )
            count += 1
            
    print(f"Fixed {count} documents with missing IDs")
    client.close()

if __name__ == "__main__":
    asyncio.run(fix_ids())
