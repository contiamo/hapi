#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
BUILD_FROM_SOURCE=true
HAPI_PORT=3007
HAPI_HOST="0.0.0.0"
BASE_PATHS="$HOME"
DEV_HOME="$HOME/.hapi-dev"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

print_info() {
    echo -e "${BLUE}INFO:${NC} $1"
}

print_success() {
    echo -e "${GREEN}SUCCESS:${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}WARNING:${NC} $1"
}

print_error() {
    echo -e "${RED}ERROR:${NC} $1"
}

print_usage() {
    cat << EOF
HAPI Development Testing Script

Usage: $0 [OPTIONS]

OPTIONS:
    --skip-build             Skip building from source (default: build enabled)
    --port PORT              Port for dev server (default: 3007)
    --host HOST              Host to bind to (default: 0.0.0.0)
    --base-paths PATHS       Comma-separated base paths (default: \$HOME)
    -h, --help               Show this help message

EXAMPLES:
    # Build and run dev server (default behavior)
    $0

    # Skip build and use existing binary
    $0 --skip-build

    # Run with custom port
    $0 --port 3008

    # Run with specific base paths
    $0 --base-paths "/home/user/projects,/home/user/documents"

NOTES:
    - Dev instance uses ~/.hapi-dev for data (isolated from production)
    - Production instance on port 3006 can run simultaneously
    - API token is set to "dev" for easy development testing
    - Stop with Ctrl+C to cleanly shut down both server and runner
EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-build)
            BUILD_FROM_SOURCE=false
            shift
            ;;
        --port)
            HAPI_PORT="$2"
            shift 2
            ;;
        --host)
            HAPI_HOST="$2"
            shift 2
            ;;
        --base-paths)
            BASE_PATHS="$2"
            shift 2
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
done

# Build from source
build_from_source() {
    print_info "Building HAPI from source..."

    cd "$PROJECT_ROOT"

    # Check for dependencies
    if ! command -v bun &> /dev/null; then
        if [ -f "$HOME/.bun/bin/bun" ]; then
            export PATH="$HOME/.bun/bin:$PATH"
            print_info "Found bun in $HOME/.bun/bin"
        else
            print_error "bun is required for building. Install from https://bun.sh"
            exit 1
        fi
    fi

    if ! command -v pnpm &> /dev/null; then
        print_error "pnpm is required for building. Install with: npm install -g pnpm"
        exit 1
    fi

    print_info "Installing dependencies..."
    pnpm install

    print_info "Building single executable..."
    bun run build:single-exe || true

    # Verify build succeeded
    if [ ! -f "$PROJECT_ROOT/cli/dist-exe/bun-linux-$(uname -m | sed 's/aarch64/arm64/' | sed 's/x86_64/x64/')/hapi" ]; then
        print_error "Build failed - binary not found at cli/dist-exe/bun-linux-$(uname -m | sed 's/aarch64/arm64/' | sed 's/x86_64/x64/')/hapi"
        exit 1
    fi

    print_success "Build completed"
}

# Get API token (fixed to "dev" for simplicity)
get_api_token() {
    local token_file="$DEV_HOME/api-token"
    local token="dev"

    # Save to file for reference
    echo "$token" > "$token_file"
    chmod 600 "$token_file"
    echo "$token"
}

# Check if port is available
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 1
    fi
    return 0
}

# Kill any stale dev runner from a previous run
kill_stale_dev_processes() {
    local state_file="$DEV_HOME/runner.state.json"
    if [ -f "$state_file" ]; then
        local pid
        pid=$(jq -r '.pid // empty' "$state_file" 2>/dev/null || true)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            print_info "Killing stale dev runner (PID $pid)..."
            kill -9 "$pid" 2>/dev/null || true
        fi
    fi
    rm -f "$DEV_HOME/runner.state.json.lock"
}

# Cleanup function
cleanup() {
    print_info "Shutting down..."

    if [ -n "$RUNNER_PID" ] && kill -0 "$RUNNER_PID" 2>/dev/null; then
        print_info "Stopping runner (PID $RUNNER_PID)..."
        kill "$RUNNER_PID" 2>/dev/null || true
        wait "$RUNNER_PID" 2>/dev/null || true
    fi

    if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        print_info "Stopping server (PID $SERVER_PID)..."
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi

    # Clean up any session child processes spawned by the runner
    if [ -n "$BINARY" ]; then
        pkill -f "$BINARY" 2>/dev/null || true
    fi

    rm -f "$DEV_HOME/runner.state.json.lock"

    print_success "Shutdown complete"
}

# Main execution
main() {
    echo ""
    echo "======================================"
    echo "  HAPI Development Server"
    echo "======================================"
    echo ""

    # Build if requested
    if [ "$BUILD_FROM_SOURCE" = true ]; then
        build_from_source
    fi

    # Find binary
    local arch
    arch=$(uname -m | sed 's/aarch64/arm64/' | sed 's/x86_64/x64/')
    local binary_path=""
    if [ -f "$PROJECT_ROOT/cli/dist-exe/bun-linux-${arch}/hapi" ]; then
        binary_path="$PROJECT_ROOT/cli/dist-exe/bun-linux-${arch}/hapi"
    elif [ -f "$PROJECT_ROOT/cli/dist/hapi" ]; then
        binary_path="$PROJECT_ROOT/cli/dist/hapi"
    else
        print_error "HAPI binary not found. Run with --build to build from source."
        exit 1
    fi

    BINARY="$binary_path"

    # Kill any stale processes from a previous dev run
    kill_stale_dev_processes

    # Check port availability
    if ! check_port "$HAPI_PORT"; then
        print_warning "Port $HAPI_PORT is already in use"
        print_info "Another process may be using this port. Continue anyway? (y/n)"
        read -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Cancelled"
            exit 0
        fi
    fi

    # Create dev home directory
    mkdir -p "$DEV_HOME"

    # Get or create API token
    CLI_API_TOKEN=$(get_api_token)

    # Display configuration
    print_info "Configuration:"
    echo "  Port: $HAPI_PORT"
    echo "  Host: $HAPI_HOST"
    echo "  Data directory: $DEV_HOME"
    echo "  Base paths: $BASE_PATHS"
    echo "  Binary: $BINARY"
    echo "  API Token: dev"
    echo ""

    # Set up environment
    export HAPI_HOME="$DEV_HOME"
    export HAPI_LISTEN_PORT="$HAPI_PORT"
    export HAPI_LISTEN_HOST="$HAPI_HOST"
    export HAPI_BASE_PATHS="$BASE_PATHS"
    export CLI_API_TOKEN="$CLI_API_TOKEN"
    export HAPI_API_URL="http://localhost:$HAPI_PORT"

    # Register cleanup handler
    trap cleanup EXIT INT TERM

    # Start server in background
    print_info "Starting server..."
    "$BINARY" server --no-relay &
    SERVER_PID=$!

    # Wait for server to be ready
    print_info "Waiting for server to be ready..."
    sleep 3

    # Check if server is still running
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        print_error "Server failed to start. Check logs above."
        exit 1
    fi

    print_success "Server started (PID $SERVER_PID)"

    # Get local IP address (portable method)
    LOCAL_IP=$(ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1' | head -1)

    echo ""
    echo "======================================"
    echo "  Server Information"
    echo "======================================"
    echo "Server URL: http://$HAPI_HOST:$HAPI_PORT"
    echo "API Token: dev"
    echo ""
    if [ -n "$LOCAL_IP" ]; then
        echo "Connect from network:"
        echo "  http://$LOCAL_IP:$HAPI_PORT"
        echo ""
    fi
    echo "Connect CLI manually:"
    echo "  export HAPI_API_URL=http://localhost:$HAPI_PORT"
    echo "  export CLI_API_TOKEN=dev"
    echo "  hapi <command>"
    echo "======================================"
    echo ""

    # Start runner in foreground mode as a background job so we can track and kill it
    print_info "Starting runner..."
    "$BINARY" runner start-sync &
    RUNNER_PID=$!

    print_success "Dev instance is running!"
    echo ""
    echo "Press Ctrl+C to stop..."
    echo ""

    wait $SERVER_PID $RUNNER_PID
}

# Run main function
main
