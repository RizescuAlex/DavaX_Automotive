import sys
import subprocess
import platform
import os

def run_cmd(cmd_list):
    """Run a command and exit if it fails."""
    result = subprocess.run(cmd_list)
    if result.returncode != 0:
        sys.exit(result.returncode)

def main():
    # Detect operating system
    is_windows = platform.system() == "Windows"
    
    # Determine if sudo is needed
    use_sudo = False
    if not is_windows and hasattr(os, "geteuid"):
        if os.geteuid() != 0:
            use_sudo = True

    prefix = ["sudo"] if use_sudo else []

    # Configurate cu valorile tale reale ca fallback
    postgres_user = os.environ.get("POSTGRES_USER", "davax")
    postgres_db = os.environ.get("POSTGRES_DB", "davax_automotive")

    print(f"🔍 Fetching users from database '{postgres_db}' as user '{postgres_user}'...")

    # Rulăm comanda psql direct folosind valorile corecte
    docker_cmd = prefix + [
        "docker", "exec", "-it", "davax-postgres",
        "psql", 
        "-U", postgres_user, 
        "-d", postgres_db, 
        "-P", "expanded=on", 
        "-c", "SELECT * FROM users;"
    ]

    run_cmd(docker_cmd)

if __name__ == "__main__":
    main()
