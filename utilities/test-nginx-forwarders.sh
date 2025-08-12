#!/bin/bash

echo "=== Testing nginx forwarders through UI ==="
echo

echo "Step 1: Refreshing browser to start from known state..."
./pbp refresh-browser.json refresh-response.json
REFRESH_RESULT=$(cat refresh-response.json)
echo "Response: $REFRESH_RESULT"

# Check for errors
if [[ "$REFRESH_RESULT" == *"error"* ]]; then
    echo "ERROR: Browser refresh failed!"
    echo "Please manually refresh your browser and press Enter to continue..."
    read -r
else
    echo "✓ Refresh request queued successfully"
    echo
    echo "Waiting 3 seconds for browser to refresh..."
    sleep 3
fi

echo
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