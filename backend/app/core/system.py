import platform
import distro
import shutil
import os
import psutil # You might need to install this: pip install psutil

def get_system_fingerprint() -> dict:
    """
    Scans the host for deep system context including package managers,
    desktop environments, and hardware specs.
    """
    
    # 1. Desktop Environment Detection
    # Checks standard environment variables used by Linux GUIs
    de_env = os.environ.get('XDG_CURRENT_DESKTOP') or os.environ.get('DESKTOP_SESSION') or "Headless"
    
    # 2. Package Manager Deep Scan
    # We map the binary name (key) to its display name (value) if found
    pm_checks = {
        "pacman": "pacman",
        "yay": "yay (AUR)",
        "paru": "paru (AUR)",       # User requested
        "dnf": "dnf (Fedora/RHEL)",
        "zypper": "zypper (OpenSUSE)", # User requested (Tumbleweed)
        "apt": "apt (Debian/Ubuntu)",
        "apk": "apk (Alpine)",
        "nix": "nix",
        "flatpak": "flatpak",
        "snap": "snap",
        "emerge": "emerge (Gentoo)",
        "xbps-install": "xbps (Void)"
    }
    
    found_pms = {}
    for binary, name in pm_checks.items():
        if shutil.which(binary):
            found_pms[binary] = True

    return {
        # --- OS Identity ---
        "os_distro": distro.id(),              # e.g., 'arch', 'opensuse-tumbleweed'
        "os_name": distro.name(pretty=True),   # e.g., 'Arch Linux', 'openSUSE Tumbleweed'
        "os_version": distro.version(),        # e.g., '20260101'
        "architecture": platform.machine(),    # e.g., 'x86_64'
        
        # --- Kernel & Shell ---
        "kernel": platform.release(),
        "shell": "bash",                       # Hardcoded as per request
        "is_root": os.geteuid() == 0,
        
        # --- GUI Context ---
        "desktop_env": de_env.lower(),         # e.g., 'kde', 'gnome', 'niri'
        
        # --- Tools ---
        "package_managers": found_pms,
        
        # --- Hardware Context (Optional but helpful for 'build' commands) ---
        "cpu_cores": os.cpu_count(),
        "ram_gb": round(psutil.virtual_memory().total / (1024**3), 1)
    }

if __name__ == "__main__":
    import json
    # Run this to test what the AI will see
    print(json.dumps(get_system_fingerprint(), indent=4))