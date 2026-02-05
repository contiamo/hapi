---
name: hapi-deploy
description: Reinstall hapi from source and check server status
---

# Hapi Deploy Skill

## Reinstalling Hapi

To rebuild and reinstall hapi from source:

1. Run the installation script:
   ```bash
   ./deploy/linux/install.sh --build --name hapi -y
   ```

2. Check the version endpoint to verify:
   ```bash
   curl -s http://localhost:3006/api/version | jq .
   ```

3. Compare with current git HEAD:
   ```bash
   git log --oneline -1
   ```

## Checking Status

To check the current status of hapi services:

1. Check git HEAD:
   ```bash
   git log --oneline -1
   ```

2. Check version endpoint:
   ```bash
   curl -s http://localhost:3006/api/version | jq .
   ```

3. Check version.json file:
   ```bash
   cat server/dist/version.json
   ```

4. Check service status:
   ```bash
   systemctl --user status hapi-server.service hapi-runner.service --no-pager
   ```

## Restarting Services

To restart hapi services:

1. Restart both services:
   ```bash
   systemctl --user restart hapi-server.service hapi-runner.service
   ```

2. Wait a moment, then check status:
   ```bash
   systemctl --user status hapi-server.service hapi-runner.service --no-pager
   ```

3. Verify version endpoint:
   ```bash
   curl -s http://localhost:3006/api/version | jq .
   ```
