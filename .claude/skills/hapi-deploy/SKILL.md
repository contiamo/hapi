---
name: hapi-deploy
description: Reinstall hapi from source and check server status. Use when deploying changes, checking if server is running latest code, or verifying installation.
---

# Hapi Deploy

Provides workflows for reinstalling hapi and checking deployment status.

## Reinstalling Hapi

To rebuild and reinstall hapi from source:

```bash
./deploy/linux/install.sh --build --name hapi -y
```

After installation completes, verify the deployment:

```bash
curl -s http://localhost:3006/api/version | jq .
git log --oneline -1
```

## Checking Server Status

Check if the server is running the latest code:

```bash
# Current git HEAD
git log --oneline -1

# Server version endpoint
curl -s http://localhost:3006/api/version | jq .

# Version file on disk
cat server/dist/version.json

# Service status
systemctl --user status hapi-server.service hapi-runner.service --no-pager
```

## Restarting Services

To restart services without rebuilding:

```bash
systemctl --user restart hapi-server.service hapi-runner.service
```

Wait a moment, then verify:

```bash
systemctl --user status hapi-server.service hapi-runner.service --no-pager
curl -s http://localhost:3006/api/version | jq .
```
