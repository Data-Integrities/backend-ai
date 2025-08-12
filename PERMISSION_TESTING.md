# Backend AI Permission Testing Guide

## Current Issue
The permission pattern `curl*http://192.168.1.30/*:*` in `~/.claude/settings.local.json` is not matching POST requests with JSON data. This causes Claude Code to ask for approval on every POST request to the browser-requests endpoints.

## Test Results from Previous Session
1. ✅ GET requests work without approval
2. ❌ POST requests with JSON data require approval
3. ✅ The permission exists in settings.local.json
4. ❌ The pattern doesn't match the full curl command structure

## Example Commands That Require Approval
```bash
# This command triggers approval despite the permission
curl -s -X POST http://192.168.1.30/api/browser-requests \
  -H "Content-Type: application/json" \
  -d '{"tabId": "any", "type": "data", "action": "get-logs", "params": {}}'
```

## Potential Solutions to Test

### Solution 1: More Specific Pattern
Try updating the permission to be more specific about POST requests:
```json
"Bash(curl*-X POST*http://192.168.1.30/*:*)"
```

### Solution 2: Multiple Patterns
Add multiple patterns to cover different curl variations:
```json
"Bash(curl*http://192.168.1.30/*:*)",
"Bash(curl -s*http://192.168.1.30/*:*)",
"Bash(curl*POST*http://192.168.1.30/*:*)"
```

### Solution 3: Broader Pattern
Try a more permissive pattern:
```json
"Bash(*curl*192.168.1.30*:*)"
```

### Solution 4: Escape Special Characters
The JSON data might be interfering with pattern matching:
```json
"Bash(curl*192.168.1.30*:*)"
```

## Testing Process
1. Update `~/.claude/settings.local.json` with new pattern
2. Start a new Claude Code session (permissions only reload on startup)
3. Test the same curl commands
4. Document which pattern works

## Critical Commands to Test
```bash
# 1. POST to browser-requests (the main issue)
curl -s -X POST http://192.168.1.30/api/browser-requests \
  -H "Content-Type: application/json" \
  -d '{"tabId": "any", "type": "data", "action": "get-logs", "params": {}}'

# 2. GET with query params (currently works)
curl -s "http://192.168.1.30/api/browser-requests/test-id?wait=true"

# 3. Simple GET (currently works)
curl -s http://192.168.1.30/api/agents
```

## Why This Matters
The browser request queue is essential for:
- Retrieving interleaved logs (UI events + backend logs)
- Refreshing the browser when needed
- Getting detailed execution information
- Testing and debugging the universal action router

Without automatic permission, every operation requires manual approval, severely impacting productivity.

## Next Steps
1. Test different permission patterns in settings.local.json
2. Find the pattern that allows POST requests with JSON
3. Document the working pattern
4. Update CLAUDE.md with instructions for future sessions