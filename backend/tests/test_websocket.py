import asyncio
import websockets
import sys

async def test_websocket():
    uri = "ws://localhost:8000/ws"
    try:
        async with websockets.connect(uri) as websocket:
            print("Successfully connected to WebSocket")
            await websocket.send("Hello")
            # We expect the server to keep the connection open.
            # If we can send and it doesn't close immediately, it's good.
            print("Message sent")
            await asyncio.sleep(1)
            print("Connection maintained")
    except Exception as e:
        print(f"Failed to connect: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(test_websocket())
