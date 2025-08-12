# UI Control API Documentation

## Overview

The Backend AI Hub now supports programmatic UI control through its ActionRouter system. This allows Claude (or any API client) to interact with the UI elements, making it possible to:

- Automate testing workflows
- Document UI functionality with live examples
- Perform UI operations without manual interaction
- Create reproducible test scenarios

## How It Works

1. **Send a browser request** with the action you want to perform
2. **The hub queues the request** and waits for the browser to poll
3. **The browser executes the action** and returns the result
4. **Check the result** using the request ID

## Available UI Control Actions

### 1. set-value
Sets the value of input fields, textareas, or select elements.

```json
{
  "type": "action",
  "action": "set-value",
  "params": {
    "selector": "#chat-input",
    "value": "Hello from Claude!"
  }
}
```

### 2. get-value
Retrieves the current value or text content of an element.

```json
{
  "type": "action",
  "action": "get-value",
  "params": {
    "selector": "#chat-input"
  }
}
```

### 3. click
Simulates a click on any element.

```json
{
  "type": "action",
  "action": "click",
  "params": {
    "selector": ".hamburger-menu"
  }
}
```

### 4. submit-form
Submits a form by either clicking its submit button or calling submit().

```json
{
  "type": "action",
  "action": "submit-form",
  "params": {
    "selector": "#search-form"
  }
}
```

### 5. get-elements
Finds all elements matching a selector and returns information about them.

```json
{
  "type": "action",
  "action": "get-elements",
  "params": {
    "selector": ".agent-card"
  }
}
```

### 6. wait-for-element
Waits for an element to appear in the DOM (useful for dynamic content).

```json
{
  "type": "action",
  "action": "wait-for-element",
  "params": {
    "selector": ".modal",
    "timeout": 5000,
    "interval": 100
  }
}
```

### 7. screenshot-element
Gets the dimensions and visibility of an element (useful for visual testing).

```json
{
  "type": "action",
  "action": "screenshot-element",
  "params": {
    "selector": ".agent-status"
  }
}
```

## Example Usage with Claude

### Testing Agent Start/Stop

```bash
# 1. Click on nginx agent to select it
echo '{
  "type": "action",
  "action": "click",
  "params": {
    "selector": "[data-agent=\"nginx\"]"
  }
}' > input.json

./pbp input.json output.json

# 2. Right-click to open context menu
echo '{
  "type": "action",
  "action": "click",
  "params": {
    "selector": "[data-agent=\"nginx\"]",
    "rightClick": true
  }
}' > input.json

./pbp input.json output.json

# 3. Click "Stop Agent" in context menu
echo '{
  "type": "action",
  "action": "click",
  "params": {
    "selector": "[data-action=\"stop-agent\"]"
  }
}' > input.json

./pbp input.json output.json
```

### Testing Chat Functionality

```bash
# 1. Set chat input value
echo '{
  "type": "action",
  "action": "set-value",
  "params": {
    "selector": "#chat-input",
    "value": "What is your current status?"
  }
}' > input.json

./pbp input.json output.json

# 2. Submit the chat
echo '{
  "type": "action",
  "action": "click",
  "params": {
    "selector": "#send-button"
  }
}' > input.json

./pbp input.json output.json
```

### Automated Testing Workflow

```bash
# Test that all agents are visible
echo '{
  "type": "action",
  "action": "get-elements",
  "params": {
    "selector": ".agent-card"
  }
}' > input.json

./pbp input.json output.json
# Should return 5 agent cards

# Check agent status indicators
echo '{
  "type": "action",
  "action": "get-elements",
  "params": {
    "selector": ".agent-status.online"
  }
}' > input.json

./pbp input.json output.json
# Returns count of online agents
```

## Benefits for Claude

1. **Documentation**: Can create live, interactive documentation by actually using the UI
2. **Testing**: Can verify UI functionality after deployments
3. **Debugging**: Can check element states and values when troubleshooting
4. **Automation**: Can perform repetitive UI tasks programmatically
5. **Validation**: Can ensure UI elements exist and are interactive

## Integration with Existing Tools

The UI control actions integrate seamlessly with the existing ActionRouter pattern:
- Same request/response flow as other hub actions
- Uses the browser request queue for async execution
- Maintains correlation IDs for tracking
- Logs all UI actions for debugging

## Security Considerations

- Actions are executed in the context of the browser tab
- No access to browser storage or cookies
- Limited to DOM manipulation only
- All actions are logged for audit purposes

## Future Enhancements

- Support for drag-and-drop operations
- Keyboard event simulation
- Multi-step action sequences
- Visual regression testing
- Recording and playback of UI interactions