import sys
import subprocess
import platform
import os

def run_cmd(cmd_list):
    """Rulează o comandă și oprește execuția dacă aceasta eșuează."""
    result = subprocess.run(cmd_list)
    if result.returncode != 0:
        sys.exit(result.returncode)

def main():
    # Detectare sistem de operare
    is_windows = platform.system() == "Windows"
    
    # Determinare dacă sudo este necesar (doar pe Linux/macOS când nu ești root)
    use_sudo = False
    if not is_windows and hasattr(os, "geteuid"):
        if os.geteuid() != 0:
            use_sudo = True

    prefix = ["sudo"] if use_sudo else []

    print("📋 Se listează tabelele din baza de date 'davax_automotive'...")

    # Construirea comenzii ca listă separată de argumente
    # Python trimite "\dt" direct către psql, fără ca shell-ul să interpreteze greșit backslash-ul
    docker_cmd = prefix + [
        "docker", "compose", "exec", "postgres",
        "psql", 
        "-U", "davax", 
        "-d", "davax_automotive", 
        "-c", "\\dt"
    ]

    run_cmd(docker_cmd)

if __name__ == "__main__":
    main()
