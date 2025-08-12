#!/bin/bash

echo "=== Testing nginx forwarders with clean browser state ==="
echo

# First, manually refresh the browser to clear all tabs
echo "IMPORTANT: Please manually refresh your browser NOW to clear all tabs"
echo "Press Enter when you've refreshed the browser..."
read -r

echo "Step 1: Filling task command field..."
echo "Text: 'list all nginx forwarders and show which ones are enabled'"
./pbp fill-task-command.json fill-command-response.json
FILL_RESULT=$(cat fill-command-response.json)
echo "Response: $FILL_RESULT"

if [[ "$FILL_RESULT" == *"error"* ]]; then
    echo "ERROR: Failed to fill task command!"
    exit 1
else
    echo "✓ Task command filled successfully"
fi

echo
echo "Waiting 2 seconds to see the text appear..."
sleep 2

echo
echo "Step 2: Clearing the title field (to ensure auto-generation works)..."
cat > clear-title.json << 'EOF'
{
  "method": "POST",
  "url": "http://192.168.1.30/api/browser-requests",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "type": "control",
    "action": "perform-action",
    "params": {
      "action": "set-value",
      "params": {
        "selector": "#task-title",
        "value": ""
      }
    }
  }
}
EOF
./pbp clear-title.json clear-title-response.json
echo "Response: $(cat clear-title-response.json)"

echo
echo "Step 3: Submitting form using the Start Task button..."
cat > click-start-task.json << 'EOF'
{
  "method": "POST",
  "url": "http://192.168.1.30/api/browser-requests",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "type": "control",
    "action": "perform-action",
    "params": {
      "action": "click",
      "params": {
        "selector": ".start-task-btn"
      }
    }
  }
}
EOF
./pbp click-start-task.json click-response.json
CLICK_RESULT=$(cat click-response.json)
echo "Response: $CLICK_RESULT"

if [[ "$CLICK_RESULT" == *"error"* ]]; then
    echo "ERROR: Failed to click Start Task button!"
    exit 1
else
    echo "✓ Form submitted successfully"
fi

echo
echo "Waiting 5 seconds for nginx to process and respond..."
sleep 5

echo
echo "=== Test complete ==="
echo "You should now see:"
echo "1. Only 2 tabs: '+ New Chat' and the new nginx task tab"
echo "2. nginx executing the forwarders list command automatically"

# Clean up temporary files
rm -f clear-title.json click-start-task.json