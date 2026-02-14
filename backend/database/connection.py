from motor.motor_asyncio import AsyncIOMotorClient
import os
from config import settings

MONGO_URL = settings.MONGODB_URL

class Database:
    client: AsyncIOMotorClient = None

    def connect(self):
        self.client = AsyncIOMotorClient(MONGO_URL)
        print("Connected to MongoDB")

    def close(self):
        if self.client:
            self.client.close()
            print("Disconnected from MongoDB")

    def get_db(self):
        return self.client.flowx2

db = Database()
