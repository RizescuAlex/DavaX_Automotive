#!/bin/bash
echo "🛑 Stopping containers..."

# -v removes anonymous volumes (like /app/node_modules) created by this specific project
sudo docker compose down -v

echo "🧼 Purging dangling images and build cache..."
# Removes unused containers, networks, and dangling build images safely
sudo docker system prune -f

echo "✨ System cleaned! Zero residual junk left behind."
