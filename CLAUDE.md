# HAPI Project

> **Read `./Agents.local.md` for installation instructions and deployment workflow.**
> **Read `./cli/CLAUDE.md` for CLI-specific codebase overview and architecture.**

## Project Structure

This is a monorepo containing:

1. **cli/** - HAPI CLI tool (main component)
2. **server/** - HAPI server (Telegram Bot + Mini App + Socket.IO server)

See the respective CLAUDE.md files in each directory for detailed documentation.

## Local Development Without Interfering With Production

HAPI uses two key isolation mechanisms: **`HAPI_HOME`** (data directory) and **port**. Production and dev instances are fully isolated as long as these differ.

### Default environments

| | Production | Dev |
|---|---|---|
| Port | `3006` | `3007` |
| Data dir | `~/.hapi` | `~/.hapi-dev` |
| API token | strong random | `dev` |

### Starting the dev server

```bash
./scripts/dev-test.sh           # build + start
./scripts/dev-test.sh --skip-build  # skip rebuild if binary is current
```

This starts server and runner with isolated data, runs in foreground. Stop with `Ctrl+C`.

Or start components directly (useful for debugging - server runs as a background task so its logs stay accessible):

```bash
# Terminal / background task - server (keeps logs accessible)
HAPI_HOME=~/.hapi-dev HAPI_LISTEN_PORT=3007 HAPI_LISTEN_HOST=0.0.0.0 \
  CLI_API_TOKEN=dev ./cli/dist-exe/bun-linux-x64/hapi server --no-relay

# Runner (daemonizes itself)
HAPI_HOME=~/.hapi-dev HAPI_API_URL=http://localhost:3007 \
  CLI_API_TOKEN=dev ./cli/dist-exe/bun-linux-x64/hapi runner start
```

Stop the dev runner:
```bash
HAPI_HOME=~/.hapi-dev CLI_API_TOKEN=dev hapi runner stop
```

### Testing via curl

Authenticate and get a JWT (token is `dev` in dev mode):

```bash
JWT=$(curl -s -X POST http://localhost:3007/api/auth \
  -H "Content-Type: application/json" \
  -d '{"accessToken":"dev"}' | jq -r '.token')
```

Spawn a session:
```bash
MACHINE_ID=$(curl -s http://localhost:3007/api/machines \
  -H "Authorization: Bearer $JWT" | jq -r '.machines[0].id')

SESSION_ID=$(curl -s -X POST "http://localhost:3007/api/machines/$MACHINE_ID/spawn" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d "{\"directory\":\"$HOME\",\"agent\":\"claude\"}" | jq -r '.sessionId')
```

Check slash commands (wait ~5s for SDK metadata extraction):
```bash
curl -s "http://localhost:3007/api/sessions/$SESSION_ID/slash-commands" \
  -H "Authorization: Bearer $JWT" | jq .
```

### Isolation guarantees

- **Database**: `~/.hapi-dev/hapi.db` is separate from `~/.hapi/hapi.db`
- **Machine ID**: stored in `~/.hapi-dev/settings.json`, different UUID from production
- **Runner lock**: `~/.hapi-dev/runner.state.json.lock` prevents two dev runners on the same dir
- **Token**: dev token `dev` cannot auth against production server (different tokens)
- **Hot reload**: the server watches the binary mtime and restarts itself on rebuild - restart the server task after rebuilding

### Key gotcha: nested Claude processes

The hapi session process sets `CLAUDECODE` in its environment. Any code that spawns a child `claude` process (e.g. the SDK metadata extractor) must unset `CLAUDECODE` first, otherwise Claude refuses to start with:

```
Error: Claude Code cannot be launched inside another Claude Code session.
```

This is already handled in `cli/src/claude/sdk/query.ts`.
