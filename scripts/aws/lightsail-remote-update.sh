#!/usr/bin/env bash
# Run on the Lightsail instance after code is synced to /opt/vbs.
set -euo pipefail
cd /opt/vbs/deploy/lightsail
sudo docker compose up -d --build --remove-orphans
sudo docker image prune -f
