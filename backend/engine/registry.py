from typing import Dict, Type, List
from .protocol import FlowXNode
import sys
import importlib
import json
from pathlib import Path
import logging
from fastapi import APIRouter

logger = logging.getLogger(__name__)

# Resolve paths
BACKEND_DIR = Path(__file__).parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
PLUGINS_DIR = PROJECT_ROOT / "plugins"

class NodeRegistry:
    _instance = None
    _nodes: Dict[str, Type[FlowXNode]] = {}
    _routers: List[APIRouter] = []

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(NodeRegistry, cls).__new__(cls)
        return cls._instance

    @classmethod
    def load_plugins(cls):
        if not PLUGINS_DIR.exists():
            logger.error(f"Plugins directory not found at {PLUGINS_DIR}")
            return

        # Ensure Python can import from the root "plugins" module
        if str(PROJECT_ROOT) not in sys.path:
            sys.path.insert(0, str(PROJECT_ROOT))

        logger.info(f"🔌 Scanning plugins at {PLUGINS_DIR}")
        for plugin_path in PLUGINS_DIR.iterdir():
            if not plugin_path.is_dir() or plugin_path.name.startswith("__"):
                continue
                
            manifest_path = plugin_path / "manifest.json"
            if not manifest_path.exists():
                continue

            try:
                # 1. Parse Manifest
                with open(manifest_path, 'r') as f:
                    manifest = json.load(f)
                
                node_id = manifest.get("id")
                backend_class_name = manifest.get("backend_class")

                if not node_id or not backend_class_name:
                    logger.warn(f"⚠️ Invalid manifest in {plugin_path.name}: Missing id or backend_class")
                    continue

                # 2. Import Module (e.g., plugins.CommandNode.backend.node)
                module_path = f"plugins.{plugin_path.name}.backend.node"
                module = importlib.import_module(module_path)
                
                # 3. Get Class & Register
                node_class = getattr(module, backend_class_name)
                cls._nodes[node_id] = node_class
                
                logger.info(f"✅ Backend Plugin Loaded: {manifest.get('name')} ({node_id})")
                
                # 4. Load Router (Optional)
                try:
                    router_module_path = f"plugins.{plugin_path.name}.backend.router"
                    router_module = importlib.import_module(router_module_path)
                    if hasattr(router_module, "router"):
                        cls._routers.append(router_module.router)
                        logger.info(f"   └── API Router Loaded")
                except ImportError:
                    pass # Router is optional
                except Exception as e:
                    logger.warn(f"   ⚠️ Failed to load router for {plugin_path.name}: {e}")

            except Exception as e:
                logger.error(f"❌ Failed to load plugin {plugin_path.name}: {e}")

    @classmethod
    def register(cls, node_type: str, node_class: Type[FlowXNode]):
        """
        Register a new node type strategy.
        """
        # print(f"DEBUG: Registering node type '{node_type}' with class {node_class.__name__}")
        cls._nodes[node_type] = node_class

    @classmethod
    def get_node(cls, node_type: str) -> Type[FlowXNode]:
        """
        Retrieve the strategy class for a node type.
        """
        node_class = cls._nodes.get(node_type)
        if not node_class:
            raise ValueError(f"Unknown node type: {node_type}")
        return node_class

    @classmethod
    def list_nodes(cls):
        return list(cls._nodes.keys())
        
    @classmethod
    def get_routers(cls) -> List[APIRouter]:
        return cls._routers

# Initialize on import
NodeRegistry.load_plugins()
