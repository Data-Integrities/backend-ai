#!/bin/bash

# Backend AI Permission Testing Script
# Tests different curl patterns to see which require approval

echo "==================================="
echo "Backend AI Permission Testing"
echo "==================================="
echo ""

# Test 1: Simple GET
echo "Test 1: Simple GET request"
echo "Command: curl -s http://192.168.1.30/api/agents | jq '.agents | length'"
echo -n "Result: "
curl -s http://192.168.1.30/api/agents | jq '.agents | length' 2>/dev/null || echo "FAILED"
echo ""

# Test 2: GET with query params
echo "Test 2: GET with query parameters"
echo "Command: curl -s \"http://192.168.1.30/api/browser-requests/test-id?wait=false\""
echo -n "Result: "
curl -s "http://192.168.1.30/api/browser-requests/test-id?wait=false" | jq -r '.error' 2>/dev/null || echo "FAILED"
echo ""

# Test 3: POST with JSON (the problematic one)
echo "Test 3: POST with JSON data"
echo "Command: curl -s -X POST http://192.168.1.30/api/browser-requests -H \"Content-Type: application/json\" -d '{...}'"
echo -n "Result: "
REQUEST_ID=$(curl -s -X POST http://192.168.1.30/api/browser-requests \
  -H "Content-Type: application/json" \
  -d '{"tabId": "any", "type": "data", "action": "test", "params": {}}' | jq -r '.requestId' 2>/dev/null)
  
if [ "$REQUEST_ID" != "null" ] && [ -n "$REQUEST_ID" ]; then
    echo "SUCCESS - Request ID: $REQUEST_ID"
else
    echo "FAILED or required approval"
fi
echo ""

# Test 4: POST without data
echo "Test 4: POST without data"
echo "Command: curl -s -X POST http://192.168.1.30/api/test"
echo -n "Result: "
curl -s -X POST http://192.168.1.30/api/test 2>&1 | head -1
echo ""

# Summary
echo "==================================="
echo "Summary:"
echo "If Test 3 failed or required approval, the permission pattern needs adjustment."
echo "Check ~/.claude/settings.local.json for the current pattern."
echo "===================================