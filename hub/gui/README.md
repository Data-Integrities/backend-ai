# Hub GUI Architecture

## Universal Action Router Pattern

The Hub GUI uses a **Universal Action Router** pattern where ALL UI interactions go through a single `performAction()` method. This ensures complete programmatic control, consistent logging, and eliminates brittle DOM dependencies.

### Core Principle

**NEVER** write onclick handlers that directly call functions. **ALWAYS** use:
```javascript
onclick="window.performAction('action-name', {param1: value1, param2: value2})"
```

### Architecture Overview

```
UI Element (onclick) 
    ↓
performAction('action-name', params)
    ↓
ActionRouter.performAction()
    ↓
Action Handler (registered in ActionRouter)
    ↓
Actual Function Call
```

## Adding New UI Actions

When adding any new UI functionality:

### 1. Register the Action in ActionRouter

```javascript
// In the ActionRouter.registerActions() method
this.actions.set('my-new-action', async (params) => {
    // Validate required parameters
    if (!params.requiredParam) throw new Error('requiredParam is required');
    
    // Call the actual function
    if (typeof myFunction === 'function') {
        const result = await myFunction(params.requiredParam);
        return { success: true, result };
    } else {
        throw new Error('myFunction not found');
    }
});
```

### 2. Use performAction in HTML

```html
<!-- CORRECT - Using performAction -->
<button onclick="window.performAction('my-new-action', {requiredParam: 'value'})">
    Click Me
</button>

<!-- WRONG - Direct function call -->
<button onclick="myFunction('value')">
    Click Me
</button>
```

### 3. Dynamic Elements

When creating elements dynamically in JavaScript:

```javascript
// CORRECT
const button = `
    <button onclick="window.performAction('delete-item', {id: '${itemId}'})">
        Delete
    </button>
`;

// WRONG
const button = `
    <button onclick="deleteItem('${itemId}')">
        Delete
    </button>
`;
```

## Benefits

1. **Programmatic Control**: Claude Code (or any automation) can trigger ANY UI action via the browser request queue
2. **Consistent Logging**: All actions are automatically logged with correlation IDs
3. **No DOM Dependencies**: Actions work regardless of UI structure changes
4. **Testability**: Easy to test actions independently of UI
5. **Debugging**: Single point to debug all UI interactions

## Common Action Patterns

### Simple Actions
```javascript
this.actions.set('toggle-panel', async () => {
    togglePanel();
    return { toggled: true };
});
```

### Actions with Parameters
```javascript
this.actions.set('send-message', async (params) => {
    if (!params.message) throw new Error('message required');
    await sendMessage(params.message);
    return { sent: true };
});
```

### Actions with Element References
```javascript
this.actions.set('close-dialog', async (params) => {
    if (!params.element) throw new Error('element required');
    const dialog = params.element.closest('.dialog');
    if (dialog) dialog.remove();
    return { closed: true };
});
```

### Agent Operations
```javascript
this.actions.set('start-agent', async (params) => {
    if (!params.agent) throw new Error('agent required');
    const agent = this.findAgent(params.agent);
    await window.executeAgentOperation(agent, 'start');
    return { started: true };
});
```

## Browser Request Queue Integration

The ActionRouter integrates with the browser request queue, allowing external control:

```javascript
// From Claude Code or external automation
await fetch('/api/browser-requests/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        tabId: 'any',
        type: 'control',
        action: 'perform-action',
        params: {
            action: 'start-agent',
            params: { agent: 'nginx' }
        }
    })
});
```

## Existing Actions Reference

### Agent Control
- `start-agent` - Start an agent service
- `stop-agent` - Stop an agent service
- `restart-agent` - Restart an agent service
- `start-manager` - Start a manager service
- `stop-manager` - Stop a manager service
- `restart-manager` - Restart a manager service
- `reboot` - Reboot a machine

### Bulk Operations
- `start-all-agents` - Start all agent services
- `stop-all-agents` - Stop all agent services
- `start-all-managers` - Start all manager services
- `stop-all-managers` - Stop all manager services

### UI Navigation
- `switch-tab` - Switch to a different chat tab
- `close-tab` - Close a chat tab
- `toggle-console` - Show/hide console panel
- `clear-console` - Clear console logs

### Chat Operations
- `send-message` - Send a chat message
- `start-new-chat` - Start new chat with agent
- `reopen-chat-from-log` - Reopen saved chat

### View Operations
- `view-logs` - View execution logs
- `switch-markdown-tab` - Toggle rendered/raw markdown
- `toggle-error-details` - Show/hide error details
- `copy-message` - Copy message to clipboard

### Modal/Dialog Control
- `close-history-modal` - Close history modal
- `close-summary-modal` - Close summary modal
- `close-dialog` - Close generic dialog
- `close-modal` - Close generic modal

### Permission Handling
- `proceed-with-permission` - Accept permission request
- `deny-permission` - Deny permission request

### Command Operations
- `confirm-command` - Confirm command execution
- `cancel-command` - Cancel command execution

## Do's and Don'ts

### DO:
- ✅ Always use `window.performAction()` for ALL UI interactions
- ✅ Register actions in `ActionRouter.registerActions()`
- ✅ Validate required parameters in action handlers
- ✅ Return meaningful results from actions
- ✅ Use descriptive action names (kebab-case)

### DON'T:
- ❌ Never use direct onclick function calls
- ❌ Never use DOM selectors to find and click elements
- ❌ Never bypass the action router for "simple" actions
- ❌ Never modify DOM directly in onclick handlers

## Testing Actions

You can test any action from the browser console:

```javascript
// Test an action
await window.performAction('start-agent', {agent: 'nginx'});

// Test with error handling
try {
    const result = await window.performAction('toggle-console');
    console.log('Success:', result);
} catch (error) {
    console.error('Failed:', error);
}
```

## Debugging

Enable action logging by watching the console:
- Every action logs: `[ActionRouter] Performing action: {action-name}`
- Success logs: `[ActionRouter] Action {action-name} completed successfully`
- Failure logs: `[ActionRouter] Action {action-name} failed: {error}`

## Future Extensions

The action router pattern enables:
- Action middleware (authentication, rate limiting)
- Action recording/replay for testing
- Undo/redo functionality
- Action analytics
- Remote control via WebSocket
- Keyboard shortcut mapping

Remember: **Every UI interaction should go through performAction()**. No exceptions!