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

    print("🚀 Starting containers...")

    # Check if the user passed --build
    is_build = "--build" in sys.argv

    if is_build:
        print("🛠️  Building images and starting services...")
        run_cmd(get_prefix() + ["docker", "compose", "up", "-d", "--build"])
        
        print("🧹 Cleaning up intermediate build artifacts immediately...")
        run_cmd(get_prefix() + ["docker", "builder", "prune", "-f"])
    else:
        print("⚡ Starting services (using existing cache)...")
        run_cmd(get_prefix() + ["docker", "compose", "up", "-d"])

    # Run database migrations
    run_cmd(get_prefix() + ["docker", "compose", "exec", "backend", "alembic", "upgrade", "head"])
    print("✅ App is up and running!")

if __name__ == "__main__":
    main()
