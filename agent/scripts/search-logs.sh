#!/bin/bash

# Backend AI Log Search Script
# Usage: ./search-logs.sh <correlationId>

CORRELATION_ID="$1"

if [ -z "$CORRELATION_ID" ]; then
    echo "Usage: $0 <correlationId>"
    exit 1
fi

# Output JSON format
echo "{"
echo "  \"correlationId\": \"$CORRELATION_ID\","
echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
echo "  \"sources\": {"

# Search manager logs
echo "    \"manager\": ["
if [ -f /var/log/ai-agent-manager.log ]; then
    grep -n "$CORRELATION_ID" /var/log/ai-agent-manager.log 2>/dev/null | tail -50 | while IFS= read -r line; do
        # Escape quotes and format as JSON
        escaped_line=$(echo "$line" | sed 's/"/\\"/g')
        echo "      \"$escaped_line\","
    done | sed '$ s/,$//'
fi
echo "    ],"

# Search agent service logs (journalctl)
echo "    \"agent\": ["
journalctl -u ai-agent --no-pager 2>/dev/null | grep "$CORRELATION_ID" | tail -50 | while IFS= read -r line; do
    escaped_line=$(echo "$line" | sed 's/"/\\"/g')
    echo "      \"$escaped_line\","
done | sed '$ s/,$//'
echo "    ],"

# Search agent manager service logs
echo "    \"systemd\": ["
journalctl -u ai-agent-manager --no-pager 2>/dev/null | grep "$CORRELATION_ID" | tail -50 | while IFS= read -r line; do
    escaped_line=$(echo "$line" | sed 's/"/\\"/g')
    echo "      \"$escaped_line\","
done | sed '$ s/,$//'
echo "    ],"

# Search rc.d logs for Unraid
echo "    \"rcd\": ["
if [ -f /var/log/ai-agent-rc.log ]; then
    grep -n "$CORRELATION_ID" /var/log/ai-agent-rc.log 2>/dev/null | tail -50 | while IFS= read -r line; do
        escaped_line=$(echo "$line" | sed 's/"/\\"/g')
        echo "      \"$escaped_line\","
    done | sed '$ s/,$//'
fi
echo "    ],"

# Search any Node.js console output logs
echo "    \"console\": ["
if [ -f /var/log/backend-ai-agent.log ]; then
    grep -n "$CORRELATION_ID" /var/log/backend-ai-agent.log 2>/dev/null | tail -50 | while IFS= read -r line; do
        escaped_line=$(echo "$line" | sed 's/"/\\"/g')
        echo "      \"$escaped_line\","
    done | sed '$ s/,$//'
fi
echo "    ]"

echo "  }"
echo "}"