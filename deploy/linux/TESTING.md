# Testing the Linux Installation

This guide explains how to test the installation script safely alongside your production instance.

## Test Installation

Run the install script with a custom name and port to avoid conflicts:

```bash
cd /var/home/lucas/Documents/code/hapi
./deploy/linux/install.sh --build --name hapi-test --port 3007
```

This will:
1. Build Hapi from source
2. Install the binary to `~/.local/bin/hapi` (same location, that's fine)
3. Create systemd services:
   - `hapi-test-server.service` (port 3007)
   - `hapi-test-runner.service`
4. Start the services

## Verify Installation

Check that both instances are running:

```bash
# Production instance (port 3006)
systemctl --user status hapi-server.service
curl http://localhost:3006

# Test instance (port 3007)
systemctl --user status hapi-test-server.service
curl http://localhost:3007
```

View logs:

```bash
# Test instance server logs
journalctl --user -u hapi-test-server.service -f

# Test instance runner logs
journalctl --user -u hapi-test-runner.service -f
```

## Access Test Instance

Open in browser:
- Test: http://localhost:3007
- Production: http://localhost:3006

Or from your laptop (replace with your server IP):
- Test: http://192.168.178.45:3007
- Production: http://192.168.178.45:3006

## Manage Test Instance

### Stop Services
```bash
systemctl --user stop hapi-test-server.service
```

### Start Services
```bash
systemctl --user start hapi-test-server.service
systemctl --user start hapi-test-runner.service
```

### Restart Services
```bash
systemctl --user restart hapi-test-server.service
```

### Check Status
```bash
systemctl --user status hapi-test-server.service
systemctl --user status hapi-test-runner.service
```

## Uninstall Test Instance

When done testing, remove the test instance:

```bash
./deploy/linux/uninstall.sh --name hapi-test
```

This will:
- Stop and disable `hapi-test-*` services
- Remove service files
- Keep the binary (shared with production)
- Keep data (shared Claude configuration)

To also remove data (WARNING: affects all instances):
```bash
./deploy/linux/uninstall.sh --name hapi-test --remove-data
```

## Service File Locations

The systemd service files are created at:
```
~/.config/systemd/user/hapi-test-server.service
~/.config/systemd/user/hapi-test-runner.service
```

You can inspect them:
```bash
cat ~/.config/systemd/user/hapi-test-server.service
```

## Troubleshooting

### Port Already in Use
If you see "address already in use", make sure to use a different port with `--port`.

### Build Failures
Check that you have:
- Bun installed: `bun --version`
- pnpm installed: `pnpm --version`

### Service Won't Start
Check logs for errors:
```bash
journalctl --user -u hapi-test-server.service -n 50
```

Common issues:
- Binary not found (check `$INSTALL_PATH`)
- Port conflicts
- Missing dependencies

### Binary Path Issues
The service includes your PATH environment variable, so it should have access to:
- System binaries (`/usr/bin`, `/usr/local/bin`)
- User binaries (`~/.local/bin`)
- Any custom paths in your `$PATH`

## Comparing Instances

You can run both instances side by side:

| Feature | Production | Test |
|---------|-----------|------|
| Service Name | `hapi-server` | `hapi-test-server` |
| Port | 3006 | 3007 |
| Binary | `~/.local/bin/hapi` | `~/.local/bin/hapi` (shared) |
| Data | `~/.claude/` | `~/.claude/` (shared) |
| Logs | `journalctl -u hapi-server` | `journalctl -u hapi-test-server` |

**Note**: Both instances share the same binary and data directory. The main differences are the service names and ports.
