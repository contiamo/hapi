# Hapi Linux Deployment

This directory contains scripts and configuration for deploying Hapi on Linux servers.

## Quick Start

### Install with Default Settings

```bash
./install.sh
```

This will:
- Install the pre-built `hapi` binary to `~/.local/bin`
- Set up systemd user services for auto-start
- Configure the server to run on port 3006

### Install with Build from Source

```bash
./install.sh --build
```

### Install with Tailscale Access

```bash
./install.sh --tailscale
```

This will also configure Tailscale serve to make Hapi accessible on your Tailnet.

## Installation Options

```
Usage: ./install.sh [OPTIONS]

OPTIONS:
    -b, --build              Build from source before installing
    -p, --path PATH          Installation path (default: ~/.local/bin)
    -s, --skip-systemd       Skip systemd service setup
    -t, --tailscale          Setup Tailscale serve for remote access
    --port PORT              Port for Hapi server (default: 3006)
    -y, --yes                Skip confirmation prompts
    -h, --help               Show this help message
```

## Examples

### Install to Custom Path

```bash
./install.sh --path /usr/local/bin
```

### Install Without Systemd

```bash
./install.sh --skip-systemd
```

Then manually run:
```bash
hapi server
```

### Build, Install, and Setup Tailscale

```bash
./install.sh --build --tailscale
```

### Automated Install (CI/CD)

```bash
./install.sh --build --yes
```

## Requirements

### Minimal Install
- Linux system with systemd (optional)
- Pre-built `hapi` binary in `cli/dist/hapi`

### Build from Source
- [Bun](https://bun.sh) runtime
- [pnpm](https://pnpm.io) package manager
- Git

### Tailscale Integration
- [Tailscale](https://tailscale.com) installed and authenticated

## Systemd Services

The installer creates three systemd user services:

### hapi-server.service
Main Hapi server that hosts the web UI and API.

```bash
# View logs
journalctl --user -u hapi-server.service -f

# Restart
systemctl --user restart hapi-server.service

# Status
systemctl --user status hapi-server.service
```

### hapi-runner.service
Background runner for Claude Code execution. Depends on hapi-server.

```bash
# View logs
journalctl --user -u hapi-runner.service -f

# Restart
systemctl --user restart hapi-runner.service
```

### tailscale-serve-hapi.service
(Optional) Tailscale serve integration for remote access.

```bash
# View status
systemctl --user status tailscale-serve-hapi.service

# Restart Tailscale serve
systemctl --user restart tailscale-serve-hapi.service
```

## Service Management

### Start All Services

```bash
systemctl --user start hapi-server.service
systemctl --user start hapi-runner.service
# If using Tailscale:
systemctl --user start tailscale-serve-hapi.service
```

### Stop All Services

```bash
systemctl --user stop hapi-server.service
# This will also stop runner and tailscale-serve (PartOf dependency)
```

### Enable Auto-Start on Login

Services are automatically enabled during installation. To manually enable:

```bash
systemctl --user enable hapi-server.service
systemctl --user enable hapi-runner.service
```

### Disable Auto-Start

```bash
systemctl --user disable hapi-server.service
systemctl --user disable hapi-runner.service
```

## Uninstall

To completely remove Hapi and its services:

```bash
./uninstall.sh
```

This will:
- Stop and disable all systemd services
- Remove service files
- Remove the hapi binary
- Optionally remove configuration data

## Troubleshooting

### Binary Not Found

Make sure `~/.local/bin` is in your PATH:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Services Won't Start

Check the logs:
```bash
journalctl --user -u hapi-server.service -n 50
```

Common issues:
- Port 3006 already in use
- Missing dependencies
- Incorrect binary path

### Build Failures

Ensure all dependencies are installed:
```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install pnpm
npm install -g pnpm

# Install dependencies
cd /path/to/hapi
pnpm install
```

### Tailscale Not Working

Verify Tailscale is running and authenticated:
```bash
tailscale status
```

Check if port is being served:
```bash
tailscale serve status
```

## Configuration

### Change Server Port

1. Edit the service file:
   ```bash
   nano ~/.config/systemd/user/hapi-server.service
   ```

2. Update the `Environment="PORT=3006"` line

3. Reload and restart:
   ```bash
   systemctl --user daemon-reload
   systemctl --user restart hapi-server.service
   ```

### Data Location

Hapi stores its data in:
- `~/.claude/` - Claude SDK configuration and sessions
- `~/.config/hapi/` - Hapi configuration (if applicable)

## Updates

To update Hapi:

1. Pull latest changes (if building from source):
   ```bash
   cd /path/to/hapi
   git pull
   ```

2. Reinstall:
   ```bash
   ./install.sh --build
   ```

3. Restart services:
   ```bash
   systemctl --user restart hapi-server.service
   ```

## Security Considerations

### Local Access Only

By default, Hapi binds to `localhost` and is only accessible from the same machine.

### Tailscale Access

When using `--tailscale`, Hapi becomes accessible to all devices on your Tailnet. Ensure your Tailnet is properly secured.

### Firewall

If you need to expose Hapi beyond localhost without Tailscale:

```bash
# Allow port 3006 through firewall
sudo firewall-cmd --permanent --add-port=3006/tcp
sudo firewall-cmd --reload
```

**Warning**: Only do this if you understand the security implications.

## Support

For issues and questions:
- GitHub Issues: [Hapi Repository](https://github.com/LucasRoesler/hapi)
- Check logs: `journalctl --user -u hapi-server.service -f`
