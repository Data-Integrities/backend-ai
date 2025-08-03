#!/bin/bash

# Pull capabilities from all agents for backup and version control
# This creates a local capabilities/ directory with subdirectories for each agent

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}Pulling Capabilities from All Agents${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"

# Create capabilities directory under agent folder
CAPABILITIES_DIR="./agent/capabilities"
mkdir -p "$CAPABILITIES_DIR"

# Clean previous pull
echo -e "${YELLOW}→${NC} Cleaning previous capabilities backup..."
rm -rf "$CAPABILITIES_DIR"/*

# List of agents to pull from
AGENTS=(
    "nginx:192.168.1.2"
    "pve1:192.168.1.5"
    "pve2:192.168.1.6"
    "pve3:192.168.1.7"
    "unraid:192.168.1.10"
)

# Pull capabilities from each agent
for agent_info in "${AGENTS[@]}"; do
    IFS=':' read -r agent_name agent_ip <<< "$agent_info"
    
    echo -e "\n${YELLOW}→${NC} Pulling capabilities from ${agent_name} (${agent_ip})..."
    
    # Create agent subdirectory
    agent_dir="$CAPABILITIES_DIR/$agent_name"
    mkdir -p "$agent_dir"
    
    # Check if agent is reachable
    if ! ssh -o ConnectTimeout=5 -o BatchMode=yes root@$agent_ip exit 2>/dev/null; then
        echo -e "${RED}✗${NC} Cannot connect to $agent_name"
        continue
    fi
    
    # Check if capabilities directory exists on agent
    if ssh root@$agent_ip "[ -d /opt/ai-agent/agent/capabilities ]"; then
        # Copy all .md files from agent's capabilities directory
        echo -e "  Copying capability files..."
        scp -q root@$agent_ip:/opt/ai-agent/agent/capabilities/*.md "$agent_dir/" 2>/dev/null || {
            echo -e "${YELLOW}  No capability files found${NC}"
            continue
        }
        
        # List what we got
        md_files=$(ls -1 "$agent_dir"/*.md 2>/dev/null | wc -l)
        if [ "$md_files" -gt 0 ]; then
            echo -e "${GREEN}✓${NC} Retrieved $md_files capability files from $agent_name:"
            for file in "$agent_dir"/*.md; do
                echo -e "    - $(basename "$file")"
            done
        fi
    else
        echo -e "${YELLOW}  No capabilities directory found on $agent_name${NC}"
    fi
done

# Create a summary README
echo -e "\n${YELLOW}→${NC} Creating capabilities summary..."
cat > "$CAPABILITIES_DIR/README.md" << 'EOF'
# Agent Capabilities Backup

This directory contains a backup of all agent capabilities pulled from the live agents.
These files are for version control and backup purposes only.

**Important**: These files are NOT deployed with the agent code. Each agent maintains its own capabilities in `/opt/ai-agent/agent/capabilities/`.

## Structure

Each subdirectory represents an agent:
- `nginx/` - Capabilities for the nginx agent
- `pve1/`, `pve2/`, `pve3/` - Capabilities for Proxmox VE nodes
- `unraid/` - Capabilities for the Unraid NAS

## Updating Capabilities

To pull the latest capabilities from all agents:
```bash
./pull-capabilities.sh
```

To push capability changes back to a specific agent:
```bash
# Example: Update nginx capabilities
scp capabilities/nginx/*.md root@192.168.1.2:/opt/ai-agent/agent/capabilities/
```

## Version Control

These files should be committed to git whenever:
1. Capabilities are added or modified on any agent
2. Before making a release
3. As part of regular backups

Last pulled: $(date)
EOF

# Count total files
total_files=$(find "$CAPABILITIES_DIR" -name "*.md" -not -path "$CAPABILITIES_DIR/README.md" | wc -l)

echo -e "\n${BLUE}════════════════════════════════════════${NC}"
echo -e "${GREEN}✓${NC} Capabilities pull complete!"
echo -e "${GREEN}✓${NC} Total files retrieved: $total_files"
echo -e "${GREEN}✓${NC} Location: $CAPABILITIES_DIR/"
echo -e "${BLUE}════════════════════════════════════════${NC}"

# Suggest git commands if files were retrieved
if [ "$total_files" -gt 0 ]; then
    echo -e "\nTo add to version control:"
    echo -e "  ${BLUE}git add capabilities/${NC}"
    echo -e "  ${BLUE}git commit -m \"Update agent capabilities backup\"${NC}"
fi