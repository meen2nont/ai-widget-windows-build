#!/bin/bash

set -e

SERVER="root@192.168.1.252"
DEST_DIR="/opt/ai-widget-dashboard"

echo "Deploying to $SERVER..."

# Rsync the files, excluding node_modules and dist
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'dist' ./ "$SERVER:$DEST_DIR"

# SSH in and restart the docker container
ssh "$SERVER" "cd $DEST_DIR && \
  docker stop ai-widget-dashboard || true && \
  docker rm ai-widget-dashboard || true && \
  docker compose down || true && \
  docker compose up -d --build"

echo "Deployment complete! Dashboard should be running on http://192.168.1.252:9000"
