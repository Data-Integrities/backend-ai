#!/bin/bash

echo "=== Testing nginx forwarders through UI (v2) ==="
echo

# First, click on the + New Chat tab to ensure we're on the right tab
echo "Step 1: Clicking on + New Chat tab..."
cat > click-new-chat.json << 'EOF'
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
      "action": "switch-tab",
      "params": {
        "tabId": "new"
      }
    }
  }
}
EOF
./pbp click-new-chat.json click-response.json
echo "Response: $(cat click-response.json)"
echo
echo "Waiting 2 seconds..."
sleep 2

echo "Step 2: Filling task command field..."
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
echo "Waiting 3 seconds to see the text appear..."
sleep 3

echo
echo "Step 3: Submitting form (title will be auto-generated)..."
./pbp submit-new-task-form.json submit-response.json
SUBMIT_RESULT=$(cat submit-response.json)
echo "Response: $SUBMIT_RESULT"

if [[ "$SUBMIT_RESULT" == *"error"* ]]; then
    echo "ERROR: Failed to submit form!"
    exit 1
else
    echo "✓ Form submitted successfully"
fi

echo
echo "Waiting 5 seconds for nginx to process and respond..."
sleep 5

echo
echo "=== Test complete ==="
echo "nginx should now execute the forwarders list command automatically"
echo
echo "Checking for any errors by looking at pending requests..."
./pbp check-pending.json final-check.json && cat final-check.json

# Clean up temporary file
rm -f click-new-chat.json