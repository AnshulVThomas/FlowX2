import asyncio
import logging
import threading
from typing import Dict, List, Any
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileSystemEvent

logger = logging.getLogger(__name__)

class _FlowXEventHandler(FileSystemEventHandler):
    """
    Routes watchdog background thread events back to the correct asyncio loops.
    """
    def __init__(self, manager: 'FileWatchManager'):
        self.manager = manager
        super().__init__()

    def _handle_event(self, event: FileSystemEvent, event_type: str):
        if event.is_directory:
            return
        
        # Determine the watched path this event belongs to.
        # For moved events, we care about the destination path if it exists
        if event_type == 'moved' and hasattr(event, 'dest_path'):
            event_path = Path(event.dest_path).resolve()
            logger.debug(f"[Watchdog] Intercepted move to {event_path}")
        else:
            event_path = Path(event.src_path).resolve()
            logger.debug(f"[Watchdog] Caught {event_type} on {event_path}")
        
        with self.manager._lock:
            for watched_path_str, data in self.manager.active_watches.items():
                try:
                    # Check if event occurred inside the watched directory
                    if event_path.is_relative_to(Path(watched_path_str)):
                        
                        futures_to_resolve = []
                        
                        # Find futures that care about this event type
                        for future_data in list(data["futures"]):
                            event_mask = future_data["event_mask"]
                            target_filter = future_data.get("target_filter")
                            
                            # Check target object filter
                            if target_filter is not None:
                                if str(event_path) != target_filter:
                                    # logger.debug(f"[Watchdog] Ignoring event on {event_path} (Target filter is {target_filter})")
                                    continue
                            
                            # Only resolve if the future requested this event type
                            if event_type in event_mask:
                                logger.info(f"[Watchdog] Dispatching '{event_type}' event for target: {event_path}")
                                futures_to_resolve.append(future_data)
                        
                        # Dispatch to the respective event loops
                        for future_data in futures_to_resolve:
                            loop = future_data["loop"]
                            future = future_data["future"]
                            
                            # Safely check if loop is closed before dispatching
                            if not loop.is_closed():
                                payload = {
                                    "path": str(event_path),
                                    "event": event_type
                                }
                                
                                def safe_set_result(fut, res):
                                    if not fut.done():
                                        fut.set_result(res)
                                        
                                # The critical bridge: push from watchdog thread to asyncio loop
                                loop.call_soon_threadsafe(safe_set_result, future, payload)
                except ValueError:
                    # is_relative_to raises ValueError on Python 3.8 if paths are on different drives
                    # or not relative. Safe to ignore.
                    pass

    def on_created(self, event):
        self._handle_event(event, 'created')

    def on_modified(self, event):
        self._handle_event(event, 'modified')

    def on_deleted(self, event):
        self._handle_event(event, 'deleted')
        
    def on_moved(self, event):
        # We treat moved as 'modified' since atomic writes use move
        self._handle_event(event, 'modified')


class FileWatchManager:
    """
    Singleton manager bridging watchdog's OS threads with FastAPI's asyncio event loops.
    """
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(FileWatchManager, cls).__new__(cls)
            cls._instance._init()
        return cls._instance
        
    def _init(self):
        self.observer = Observer()
        # active_watches maps path -> { "watch_object": ObservedWatch, "futures": [...] }
        self.active_watches: Dict[str, Dict[str, Any]] = {}
        self.event_handler = _FlowXEventHandler(self)
        self._lock = threading.Lock()
        
    def start(self):
        """Starts the background observer thread."""
        if not self.observer.is_alive():
            self.observer.start()
            logger.info("FileWatchManager started background observer.")

    def stop(self):
        """Stops the observer thread."""
        if self.observer.is_alive():
            self.observer.stop()
            self.observer.join()
            logger.info("FileWatchManager stopped background observer.")

    def register_watch(self, path: str, loop: asyncio.AbstractEventLoop, future: asyncio.Future, event_mask: List[str], recursive: bool = False):
        """
        Registers an asyncio future to be resolved when an event occurs in the given path.
        """
        path_obj = Path(path).resolve()
        path_str = str(path_obj)
        
        # Determine the physical directory we need the watchdog to monitor
        if path_obj.exists() and path_obj.is_dir():
            watch_dir = path_obj
            target_filter = None
            logger.info(f"FileWatchManager queuing directory watch for '{path_str}'")
        else:
            watch_dir = path_obj.parent
            target_filter = path_str
            logger.info(f"FileWatchManager queuing precise file watch for '{path_str}' (via parent dir '{watch_dir}')")
            
        if not watch_dir.exists() or not watch_dir.is_dir():
            raise ValueError(f"Watch path must be inside an existing directory: {watch_dir}")

        watch_dir_str = str(watch_dir)

        with self._lock:
            if watch_dir_str not in self.active_watches:
                # First time watching this directory
                watch = self.observer.schedule(self.event_handler, watch_dir_str, recursive=recursive)
                self.active_watches[watch_dir_str] = {
                    "watch_object": watch,
                    "futures": []
                }
                logger.info(f"Registered new watchdog observer for {watch_dir_str} (recursive={recursive})")
                
            # Append the future and its controlling loop
            self.active_watches[watch_dir_str]["futures"].append({
                "future": future,
                "loop": loop,
                "event_mask": event_mask,
                "target_filter": target_filter
            })

    def unregister_watch(self, path: str, future: asyncio.Future):
        """
        Removes a future from the watch registry. If the directory has no more futures,
        unschedules the underlying OS-level watch to prevent memory leaks.
        """
        watch_object_to_remove = None
        
        with self._lock:
            for watch_dir_str, data in list(self.active_watches.items()):
                original_len = len(data["futures"])
                # Remove the specific future
                data["futures"] = [f for f in data["futures"] if f["future"] != future]
                
                if len(data["futures"]) < original_len:
                    # If no one is listening anymore, prepare to kill the background watch
                    if not data["futures"]:
                        watch_object_to_remove = data["watch_object"]
                        del self.active_watches[watch_dir_str]
                    break
                    
        # Call unschedule OUTSIDE the lock to prevent deadlock with watchdog's internal locks
        if watch_object_to_remove:
            self.observer.unschedule(watch_object_to_remove)
            logger.info(f"Unscheduled empty watchdog observer from directory pool.")

    def cancel_all_futures(self):
        """Cancels all pending asyncio futures so awaiting nodes unblock immediately."""
        with self._lock:
            for watch_dir_str, data in self.active_watches.items():
                for future_data in data["futures"]:
                    loop = future_data["loop"]
                    future = future_data["future"]
                    if not loop.is_closed() and not future.done():
                        loop.call_soon_threadsafe(future.cancel)
                        logger.info(f"[Watchdog] Cancelled pending future for watch in {watch_dir_str}")

    def shutdown(self):
        """Cleans up the observer thread on server shutdown."""
        self.cancel_all_futures()
        self.stop()
        with self._lock:
            self.active_watches.clear()

# Global singleton instance
file_watch_manager = FileWatchManager()
