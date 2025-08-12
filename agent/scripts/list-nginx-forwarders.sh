#!/bin/bash

# List all nginx forwarders as JSON
# This script parses all nginx site configurations and returns consolidated JSON

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSER="$SCRIPT_DIR/parse-nginx-config.js"

# Check if parser exists
if [ ! -f "$PARSER" ]; then
    echo '{"error": "Parser script not found"}'
    exit 1
fi

# Start JSON array
echo '{'
echo '  "sites": ['

first=true
for site in /etc/nginx/sites-available/*; do
    [ -f "$site" ] || continue
    
    # Skip default site
    site_name=$(basename "$site")
    [ "$site_name" == "default" ] && continue
    
    # Parse the config
    result=$(node "$PARSER" "$site" 2>/dev/null)
    
    if [ $? -eq 0 ] && [ -n "$result" ]; then
        if [ "$first" = true ]; then
            first=false
        else
            echo ","
        fi
        # Indent the JSON
        echo "$result" | sed 's/^/    /'
    fi
done

echo '  ]'
echo '}'