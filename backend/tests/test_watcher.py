import asyncio
import os
import time
from threading import Thread
import sys
from pathlib import Path

# Add current dir to path to find engine
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine.watcher import file_watch_manager

async def main():
    test_dir = "/tmp/flowx_watch"
    os.makedirs(test_dir, exist_ok=True)
    
    print(f"Setting up watch on {test_dir}...")
    
    loop = asyncio.get_running_loop()
    future = loop.create_future()
    
    mask = ["created"]
    
    file_watch_manager.register_watch(
        path=test_dir,
        loop=loop,
        future=future,
        event_mask=mask,
        recursive=False
    )
    
    print("Watch registered. Simulating background IO in 2 seconds...")
    
    # Simulate an external process dropping a file
    def drop_file():
        time.sleep(2)
        print("Thread: Dropping file now...")
        test_file = os.path.join(test_dir, f"test_{int(time.time())}.txt")
        with open(test_file, 'w') as f:
            f.write("test")
            
    t = Thread(target=drop_file)
    t.start()
    
    print("Main loop: Awaiting future...")
    try:
        # 5 second timeout
        result = await asyncio.wait_for(future, timeout=5.0)
        print(f"SUCCESS! Future resolved with: {result}")
    except asyncio.TimeoutError:
        print("FAILED: Future timed out.")
    finally:
        print("Cleaning up...")
        file_watch_manager.unregister_watch(test_dir, future)
        file_watch_manager.shutdown()

if __name__ == "__main__":
    asyncio.run(main())
