#!/bin/bash

# Deploy manager with verification
# Usage: ./deploy-manager-with-verification.sh [agent-name|all]

HUB_URL="http://192.168.1.30"
TIMEOUT=60
POLL_INTERVAL=5

deploy_to_agent() {
    local ip=$1
    local name=$2
    local system_type=$3
    
    echo "=== Deploying manager to $name ($ip) ==="
    
    # Copy manager files
    echo "Copying manager files..."
    scp manager-with-port-clearing.tar.gz root@$ip:/tmp/ || {
        echo "❌ Failed to copy files to $name"
        return 1
    }
    
    # Deploy based on system type
    echo "Deploying and restarting manager..."
    if [ "$system_type" = "unraid" ]; then
        ssh root@$ip "
            cd /opt/ai-agent && 
            tar -xzf /tmp/manager-with-port-clearing.tar.gz &&
            /etc/rc.d/rc.ai-agent-manager restart
        " || {
            echo "❌ Failed to deploy to $name"
            return 1
        }
    else
        ssh root@$ip "
            cd /opt/ai-agent && 
            tar -xzf /tmp/manager-with-port-clearing.tar.gz &&
            cp agent/ai-agent-manager.service /etc/systemd/system/ &&
            systemctl daemon-reload &&
            systemctl restart ai-agent-manager
        " || {
            echo "❌ Failed to deploy to $name"
            return 1
        }
    fi
    
    # Verify manager responds directly
    echo "Verifying manager responds on $ip:3081..."
    local start_time=$(date +%s)
    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [ $elapsed -ge $TIMEOUT ]; then
            echo "❌ Timeout: Manager on $name not responding after ${TIMEOUT}s"
            return 1
        fi
        
        # Test manager endpoint
        if curl -s --connect-timeout 3 http://$ip:3081/status >/dev/null 2>&1; then
            local version=$(curl -s http://$ip:3081/status | jq -r '.managerVersion // "unknown"')
            echo "✅ Manager responding: v$version"
            break
        fi
        
        echo "⏳ Waiting for manager to respond... (${elapsed}s/${TIMEOUT}s)"
        sleep $POLL_INTERVAL
    done
    
    # Verify hub detects the manager
    echo "Verifying hub detects manager..."
    start_time=$(date +%s)
    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [ $elapsed -ge $TIMEOUT ]; then
            echo "❌ Timeout: Hub not detecting $name manager after ${TIMEOUT}s"
            echo "💡 Manager responds directly but hub cache may be stale"
            return 1
        fi
        
        # Check hub detection
        local hub_manager_version=$(curl -s $HUB_URL/api/agents | jq -r ".agents[] | select(.name == \"$name\") | .managerVersion // \"unknown\"")
        if [ "$hub_manager_version" != "unknown" ] && [ "$hub_manager_version" != "null" ]; then
            echo "✅ Hub detects manager: v$hub_manager_version"
            return 0
        fi
        
        echo "⏳ Waiting for hub to detect manager... (${elapsed}s/${TIMEOUT}s)"
        sleep $POLL_INTERVAL
    done
}

# Create deployment package if it doesn't exist
if [ ! -f "manager-with-port-clearing.tar.gz" ]; then
    echo "Creating manager deployment package..."
    tar -czf manager-with-port-clearing.tar.gz agent/manager/dist agent/manager/package.json agent/ai-agent-manager.service
fi

# Define agents
declare -A agents
agents["nginx"]="192.168.1.2 systemd"
agents["pve1"]="192.168.1.5 systemd"
agents["pve2"]="192.168.1.6 systemd"
agents["pve3"]="192.168.1.7 systemd"
agents["unraid"]="192.168.1.10 unraid"

# Deploy to specified agent(s)
target=${1:-all}
failed_agents=()

if [ "$target" = "all" ]; then
    echo "Deploying manager to all agents with verification..."
    for name in "${!agents[@]}"; do
        IFS=' ' read -r ip system_type <<< "${agents[$name]}"
        if ! deploy_to_agent "$ip" "$name" "$system_type"; then
            failed_agents+=("$name")
        fi
        echo
    done
else
    if [ -z "${agents[$target]}" ]; then
        echo "❌ Unknown agent: $target"
        echo "Available agents: ${!agents[*]}"
        exit 1
    fi
    
    IFS=' ' read -r ip system_type <<< "${agents[$target]}"
    if ! deploy_to_agent "$ip" "$target" "$system_type"; then
        failed_agents+=("$target")
    fi
fi

# Summary
echo "=== Deployment Summary ==="
if [ ${#failed_agents[@]} -eq 0 ]; then
    echo "✅ All deployments successful!"
    echo "🎉 All managers verified and detected by hub"
else
    echo "❌ Failed deployments: ${failed_agents[*]}"
    echo "💡 Check logs above for specific error details"
    exit 1
fi