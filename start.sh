#!/bin/bash
# Exit immediately if a command exits with a non-zero status
set -e

echo "🚀 Starting containers..."

# Check if the user wants a fresh build
if [[ "$1" == "--build" ]]; then
    echo "🛠️  Building images and starting services..."
    sudo docker compose up -d --build
    
    echo "🧹 Cleaning up intermediate build artifacts immediately..."
    # --force skips confirmation; removes build cache layers not actively tied to a running container
    sudo docker builder prune -f
else
    echo "⚡ Starting services (using existing cache)..."
    sudo docker compose up -d
fi

echo "✅ App is up and running!"
