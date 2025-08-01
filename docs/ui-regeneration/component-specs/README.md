# Component Specifications

This folder contains detailed specifications for each UI component, including HTML structure and behavior.

## Files Needed:

### HTML Structure
- `agent-card-structure.html` - Full HTML for one agent card
- `log-viewer-structure.html` - Modal HTML structure
- `console-entry-structure.html` - Console entry template
- `dialog-structure.html` - Dialog HTML templates

### Behavior Specifications
- `agent-card-behavior.md` - Click handlers, hover effects
- `console-behavior.md` - Auto-scroll, entry addition
- `dialog-behavior.md` - Show/hide logic, button handlers

### State Management
- `ui-state-structure.md` - How UI state is stored in memory
- `dom-update-patterns.md` - How elements are updated

## Example Structure File:

```html
<!-- agent-card-structure.html -->
<div class="agent-card" data-agent="nginx">
    <div class="agent-header">
        <span class="agent-name">nginx</span>
        <div class="status-indicators">
            <span class="status-indicator agent-status online" title="Agent"></span>
            <span class="status-indicator manager-status online" title="Manager"></span>
        </div>
    </div>
    <div class="agent-details">
        <div class="agent-ip">192.168.1.2</div>
        <div class="agent-version">Agent: v2.1.94</div>
        <div class="manager-version">Manager: v2.1.94</div>
    </div>
</div>
```

## What to Document:

1. **Exact HTML structure** - Every class, data attribute
2. **Dynamic elements** - What changes and when
3. **Event handlers** - What happens on click, hover
4. **Update patterns** - How data flows to DOM
5. **Edge cases** - Empty states, error states