# Local UI Testing

How to run the web UI locally against the production backend for faster iteration when working on UI-only changes.

## Prerequisites

- The production hapi server must be running on port 3006 (`systemctl --user status hapi-server.service`)
- `pnpm` must be available

## Start the dev server

Run only the Vite dev server (not the full `pnpm dev` which also starts a backend). The Vite config proxies `/api` and `/socket.io` to `http://localhost:3006`.

```bash
cd web && pnpm exec vite --port 5173
```

The app is now available at `http://localhost:5173`.

## Authenticate

The app stores the token in `localStorage`. The easiest way to inject it is via URL parameter - the app saves it automatically:

```bash
TOKEN=$(jq -r .cliApiToken ~/.hapi/settings.json)
echo "http://localhost:5173/?token=$TOKEN"
```

## Navigate to a session

Session routes use `/sessions/:id`, not `/chat/:id`. Get a live session ID from the server logs or API:

```bash
# Find an active session from server logs
journalctl --user -u hapi-server.service --no-pager -n 20 | grep "sessionId" | head -5
```

Then navigate with auth:

```
http://localhost:5173/sessions/<session-id>?token=<token>
```

## Using bdg to inspect the browser

Start bdg with **no timeout** (default is unlimited) so the session stays alive for multiple queries:

```bash
TOKEN=$(jq -r .cliApiToken ~/.hapi/settings.json)
SESSION=<session-id>
bdg "http://localhost:5173/sessions/${SESSION}?token=${TOKEN}" &
sleep 20  # wait for page to fully load

# Check console logs
bdg console --list --last 100

# Check for errors only
bdg console --list --last 100 --level error

# Inspect DOM elements
bdg dom query "div[data-index]"        # virtual list items
bdg dom query "div[style*='height']"   # virtualizer container
bdg dom query "button"                 # rendered buttons (good proxy for message count)

# Run arbitrary JS
bdg dom eval "document.querySelectorAll('[data-index]').length"

# Stream live console output
bdg tail --console
```

**Important**: Do not use `--timeout` flag, or set it to `0` for unlimited. Using a short timeout causes the session to expire mid-query.

## Iterating on changes

Vite hot-reloads on save, so changes to `web/src/**` are reflected immediately without restarting anything. Run DOM/console checks with bdg after each change to verify behavior.
