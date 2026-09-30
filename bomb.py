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

    print("🚨 Atenție: Se șterg TOATE containerele oprite, imaginile neutilizate, cache-ul de build și volumele neatașate...")
    
    # Construirea comenzii Docker pentru prune total
    # --force (-f) poate fi adăugat dacă vrei să eviți promptul de confirmare [y/N]
    docker_cmd = prefix + ["docker", "system", "prune", "-a", "--volumes"]

    run_cmd(docker_cmd)
    print("✨ Curățare completă realizată cu succes!")

if __name__ == "__main__":
    main()
