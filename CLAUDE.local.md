# HAPI Project - Local Development Instructions

## Rebuilding and Deploying

### ⚠️ IMPORTANT: Always Use the Install Script

When making changes to the codebase that need to be deployed, **ALWAYS** use the deployment install script instead of manual builds and restarts.

### Correct Deployment Process

```bash
bash deploy/linux/install.sh --build --yes
```

**Flags:**
- `--build` - Builds from source (web + server + executable)
- `--yes` - Skips confirmation prompts for automated deployment

### What This Does

1. ✅ Installs dependencies (`pnpm install`)
2. ✅ Builds the web app (`web/dist`)
3. ✅ Generates embedded web assets
4. ✅ Builds the single executable (`cli/dist-exe/bun-linux-x64/hapi`)
5. ✅ Installs binary to `~/.local/bin/hapi`
6. ✅ Backs up previous version to `~/.local/bin/hapi.prev`
7. ✅ Automatically restarts systemd services:
   - `hapi-server.service`
   - `hapi-runner.service`
8. ✅ Triggers hot-reload detection (runner auto-reloads within 60 seconds)

### Why Not Manual Rebuilds?

❌ **Don't do this:**
```bash
# This is incomplete and won't update the running server
bun run build:web
systemctl --user restart hapi-server.service
```

**Problems:**
- Web assets might not be embedded in the executable
- Version info not regenerated
- Binary not updated
- No backup created
- Systemd service files not updated if needed

✅ **Do this instead:**
```bash
bash deploy/linux/install.sh --build --yes
```

### Monitoring Deployment

Check the deployment was successful:
```bash
# View server logs
journalctl --user -u hapi-server.service -f

# View runner logs
journalctl --user -u hapi-runner.service -f

# Check service status
systemctl --user status hapi-server.service
systemctl --user status hapi-runner.service
```

### Rollback if Needed

If the new version has issues:
```bash
# The install script backs up to ~/.local/bin/hapi.prev
cp ~/.local/bin/hapi.prev ~/.local/bin/hapi
touch ~/.local/bin/hapi  # Update mtime to trigger runner reload
```

### Development Workflow

1. Make code changes
2. Run: `bash deploy/linux/install.sh --build --yes`
3. Wait for "Installation complete!"
4. Hard refresh browser (Ctrl+Shift+R) to clear cached assets
5. Test changes

### Restarting Services Manually

If you need to restart services without a full rebuild:

```bash
# Restart both services
systemctl --user restart hapi-server.service hapi-runner.service

# Verify services are running
systemctl --user status hapi-server.service hapi-runner.service
```

**Note:** Only restart manually if you know the binary is already up-to-date. Otherwise, use the full install script.

### Verifying Deployment

After deploying, verify the running version matches the build:

```bash
# Check running version (via API)
curl -s http://localhost:3006/api/version | jq .

# Check build version (from source)
cat server/dist/version.json | jq .

# Compare both side-by-side
echo "=== Running Version ===" && \
curl -s http://localhost:3006/api/version | jq . && \
echo -e "\n=== Build Version ===" && \
cat server/dist/version.json | jq .
```

**What to check:**
- `shortSha` should match between running and build
- `buildTime` should be recent (within last few minutes)
- `isDirty: true` means you have uncommitted changes

**If versions don't match:**
1. Browser might be serving cached version - hard refresh (`Ctrl+Shift+R`)
2. Services might not have restarted - check logs
3. Build might have failed - review install script output

### Quick Reference

```bash
# Full rebuild and deploy (use this!)
bash deploy/linux/install.sh --build --yes

# Restart services manually
systemctl --user restart hapi-server.service hapi-runner.service

# Verify running version
curl -s http://localhost:3006/api/version | jq .

# Check logs
journalctl --user -u hapi-server.service -f

# Check status
systemctl --user status hapi-server.service
```

## Other Deployment Options

The install script supports other flags for specific scenarios:

```bash
# Custom port
bash deploy/linux/install.sh --build --yes --port 3007

# Custom service name (for testing alongside production)
bash deploy/linux/install.sh --build --yes --name hapi-test --port 3007

# With Tailscale serve
bash deploy/linux/install.sh --build --yes --tailscale

# See all options
bash deploy/linux/install.sh --help
```
