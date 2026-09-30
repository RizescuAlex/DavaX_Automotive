import sys
import subprocess
import platform
import os

def run_cmd(cmd_list):
    """Run a command and exit if it fails (similar to set -e)."""
    print(f"Running: {' '.join(cmd_list)}")
    result = subprocess.run(cmd_list)
    if result.returncode != 0:
        sys.exit(result.returncode)

def main():
    # Detect operating system
    is_windows = platform.system() == "Windows"
    
    # Determine if sudo is needed (only on Unix-like systems when not running as root)
    use_sudo = False
    if not is_windows and hasattr(os, "geteuid"):
        if os.geteuid() != 0:
            use_sudo = True

    def get_prefix():
        return ["sudo"] if use_sudo else []

    print("🛑 Stopping containers...")
    # -v removes anonymous volumes created by this specific project
    run_cmd(get_prefix() + ["docker", "compose", "down", "-v"])

    print("🧼 Purging dangling images and build cache...")
    # Removes unused containers, networks, and dangling build images safely
    run_cmd(get_prefix() + ["docker", "system", "prune", "-f"])

    print("✨ System cleaned! Zero residual junk left behind.")

if __name__ == "__main__":
    main()
