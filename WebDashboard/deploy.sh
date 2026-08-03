#!/bin/bash

set -e

SERVER="root@192.168.1.252"
DEST_DIR="/opt/ai-widget-dashboard"

echo "Deploying to $SERVER..."

# Rsync the files, excluding node_modules and dist
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'dist' ./ "$SERVER:$DEST_DIR"

# SSH in and restart the docker container
ssh "$SERVER" "cd $DEST_DIR && \
  docker build -t ai-widget-dashboard . && \
  docker stop ai-widget-dashboard || true && \
  docker rm ai-widget-dashboard || true && \
  docker run -d --name ai-widget-dashboard --restart unless-stopped -p 9000:9000 -v ai-widget-data:/app/data --env-file .env ai-widget-dashboard"

echo "Deployment complete! Dashboard should be running on http://192.168.1.252:9000"
