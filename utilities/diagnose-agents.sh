#!/bin/bash

echo "Diagnosing agent infrastructure..."
echo "================================="

# Check hub status
echo -e "\n1. Hub Status:"
curl -s http://192.168.1.30/api/status | jq -r '. | "Hub Version: \(.version)\nHub Status: \(.status)"'

# Check each agent
echo -e "\n2. Agent Status:"
for agent in nginx pve1 pve2 pve3 unraid; do
    case $agent in
        nginx) IP="192.168.1.2" ;;
        pve1) IP="192.168.1.5" ;;
        pve2) IP="192.168.1.6" ;;
        pve3) IP="192.168.1.7" ;;
        unraid) IP="192.168.1.10" ;;
    esac
    
    echo -e "\n  $agent ($IP):"
    
    # Check manager
    MANAGER_STATUS=$(curl -s http://$IP:3081/status 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo "    Manager: $(echo $MANAGER_STATUS | jq -r '.running // "error"')"
    else
        echo "    Manager: Not responding"
    fi
    
    # Check agent
    AGENT_STATUS=$(curl -s http://$IP:3080/api/status 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo "    Agent: Running ($(echo $AGENT_STATUS | jq -r '.version // "unknown"'))"
    else
        echo "    Agent: Not responding"
    fi
done

echo -e "\n3. Hub's view of agents:"
curl -s http://192.168.1.30/api/agents | jq -r '.agents[] | "  \(.name): \(if .isOnline then "ONLINE" else "OFFLINE" end) (version: \(.version // "unknown"))"'

echo -e "\n4. Recommendations:"
echo "  - If managers are not responding, agents need deployment"
echo "  - If managers say 'false' but can start, check service logs"
echo "  - If agents show different versions, run deployment script"