#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
REMOVE_DATA=false
INSTALL_PATH="$HOME/.local/bin"
SERVICE_NAME="hapi"
SKIP_CONFIRMATION=false

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
Hapi Linux Uninstallation Script

Usage: $0 [OPTIONS]

OPTIONS:
    -n, --name NAME          Service name to uninstall (default: hapi)
    -d, --remove-data        Also remove Hapi configuration and data
    -p, --path PATH          Installation path (default: ~/.local/bin)
    -y, --yes                Skip confirmation prompts
    -h, --help               Show this help message

EXAMPLES:
    # Uninstall default Hapi instance but keep data
    $0

    # Uninstall test instance
    $0 --name hapi-test

    # Completely remove Hapi including all data
    $0 --remove-data

    # Uninstall from custom path
    $0 --path /usr/local/bin --name hapi-test

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--name)
            SERVICE_NAME="$2"
            shift 2
            ;;
        -d|--remove-data)
            REMOVE_DATA=true
            shift
            ;;
        -p|--path)
            INSTALL_PATH="$2"
            shift 2
            ;;
        -y|--yes)
            SKIP_CONFIRMATION=true
            shift
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

# Stop and disable systemd services
stop_services() {
    print_info "Stopping and disabling $SERVICE_NAME systemd services..."

    local services=(
        "${SERVICE_NAME}-server.service"
        "${SERVICE_NAME}-runner.service"
        "tailscale-serve-${SERVICE_NAME}.service"
    )

    for service in "${services[@]}"; do
        if systemctl --user is-active --quiet "$service" 2>/dev/null; then
            print_info "Stopping $service..."
            systemctl --user stop "$service" || true
        fi

        if systemctl --user is-enabled --quiet "$service" 2>/dev/null; then
            print_info "Disabling $service..."
            systemctl --user disable "$service" || true
        fi
    done

    print_success "Services stopped and disabled"
}

# Remove systemd service files
remove_service_files() {
    print_info "Removing $SERVICE_NAME systemd service files..."

    local systemd_user_dir="$HOME/.config/systemd/user"
    local services=(
        "${SERVICE_NAME}-server.service"
        "${SERVICE_NAME}-runner.service"
        "tailscale-serve-${SERVICE_NAME}.service"
    )

    for service in "${services[@]}"; do
        local service_file="$systemd_user_dir/$service"
        if [ -f "$service_file" ]; then
            print_info "Removing $service..."
            rm -f "$service_file"
        fi
    done

    # Reload systemd
    if command -v systemctl &> /dev/null; then
        systemctl --user daemon-reload
    fi

    print_success "Service files removed"
}

# Remove binary
remove_binary() {
    print_info "Removing Hapi binary..."

    local binary_path="$INSTALL_PATH/hapi"
    if [ -f "$binary_path" ]; then
        rm -f "$binary_path"
        print_success "Binary removed from $binary_path"
    else
        print_warning "Binary not found at $binary_path"
    fi
}

# Remove data
remove_data() {
    print_warning "This will remove all Hapi configuration and session data!"
    echo "The following directories will be removed:"
    echo "  - ~/.claude/"
    echo "  - ~/.config/hapi/"
    echo ""

    if [ "$SKIP_CONFIRMATION" = false ]; then
        read -p "Are you sure you want to remove all data? (yes/no) " -r
        if [[ ! $REPLY =~ ^yes$ ]]; then
            print_info "Skipping data removal"
            return
        fi
    fi

    print_info "Removing Hapi data..."

    # Remove Claude configuration
    if [ -d "$HOME/.claude" ]; then
        rm -rf "$HOME/.claude"
        print_success "Removed ~/.claude/"
    fi

    # Remove Hapi configuration
    if [ -d "$HOME/.config/hapi" ]; then
        rm -rf "$HOME/.config/hapi"
        print_success "Removed ~/.config/hapi/"
    fi

    print_success "Data removed"
}

# Print summary
print_summary() {
    echo ""
    echo "======================================"
    echo "  Hapi Uninstallation Summary"
    echo "======================================"
    echo "Service name: $SERVICE_NAME"
    echo "Binary removed: $INSTALL_PATH/hapi"
    echo "Services removed: Yes"
    echo "Data removed: $([ "$REMOVE_DATA" = true ] && echo "Yes" || echo "No")"
    echo ""

    if [ "$REMOVE_DATA" = false ]; then
        echo "Note: Configuration and data preserved in:"
        echo "  - ~/.claude/"
        echo "  - ~/.config/hapi/"
        echo ""
        echo "To remove data, run: $0 --name $SERVICE_NAME --remove-data"
    fi

    echo "======================================"
}

# Main uninstallation flow
main() {
    echo ""
    echo "======================================"
    echo "  Hapi Linux Uninstallation"
    echo "======================================"
    echo ""

    # Show configuration
    print_info "Uninstallation Configuration:"
    echo "  Service name: $SERVICE_NAME"
    echo "  Installation path: $INSTALL_PATH"
    echo "  Remove data: $REMOVE_DATA"
    echo ""

    if [ "$SKIP_CONFIRMATION" = false ]; then
        read -p "Proceed with uninstallation? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Uninstallation cancelled"
            exit 0
        fi
    fi

    # Check if systemctl is available
    if command -v systemctl &> /dev/null; then
        stop_services
        remove_service_files
    else
        print_warning "systemctl not found, skipping service removal"
    fi

    remove_binary

    if [ "$REMOVE_DATA" = true ]; then
        remove_data
    fi

    print_summary
    print_success "Uninstallation complete!"
}

# Run main function
main
