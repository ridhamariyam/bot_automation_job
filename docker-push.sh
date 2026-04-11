#!/usr/bin/env bash
# Build and push both Docker images to Docker Hub.
# Usage:  ./docker-push.sh
# First time: run  docker login  before this script.

set -euo pipefail

DOCKER_USER="ridhamaryam"
BACKEND_IMAGE="$DOCKER_USER/jobrocket-backend:latest"
WORKER_IMAGE="$DOCKER_USER/jobrocket-worker:latest"

echo "▶ Building backend image..."
docker build --platform linux/amd64 -t "$BACKEND_IMAGE" -f Dockerfile .

echo "▶ Building worker image (includes Playwright/Chromium — takes ~3 min first time)..."
docker build --platform linux/amd64 -t "$WORKER_IMAGE" -f Dockerfile.worker .

echo "▶ Pushing images to Docker Hub..."
docker push "$BACKEND_IMAGE"
docker push "$WORKER_IMAGE"

echo ""
echo "✅ Done. Images pushed:"
echo "   $BACKEND_IMAGE"
echo "   $WORKER_IMAGE"
echo ""
echo "Now trigger Render deploys:"
echo "  • Dashboard → jobrocket-backend  → Manual Deploy"
echo "  • Dashboard → jobrocket-bot-worker → Manual Deploy"
echo ""
echo "Or paste your deploy hook URLs below and run:"
echo "  curl -X POST <RENDER_DEPLOY_HOOK_URL>"
