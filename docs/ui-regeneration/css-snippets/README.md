# CSS Snippets for UI Components

This folder should contain the exact CSS used for each component. Extract these using browser DevTools.

## Files Needed:

### Agent Cards
- `agent-card-base.css` - Base card styling
- `agent-card-indicators.css` - Status indicator circles
- `agent-card-responsive.css` - Grid and responsive rules

### Log Viewer
- `log-viewer-modal.css` - Modal positioning (80vh, etc.)
- `log-viewer-header.css` - Compact header styling
- `log-viewer-content.css` - Timeline and log entry styles

### Console
- `console-entries.css` - Entry layout and colors
- `console-status-colors.css` - All status color definitions
- `console-scrolling.css` - Overflow and scroll behavior

### Dialogs
- `dialog-base.css` - Common dialog styles
- `dialog-summary.css` - Summary dialog specific styles

### Status Bar
- `status-bar-layout.css` - Flexbox/grid layout
- `status-bar-clock.css` - Clock formatting styles

### Global
- `color-palette.css` - All color variables used
- `typography.css` - Font sizes, families, weights
- `spacing.css` - Common margin/padding values

## How to Extract:

1. Open Chrome/Firefox DevTools
2. Select element
3. Copy all computed styles
4. Clean up to only relevant styles
5. Save with meaningful comments

## Example Format:

```css
/* Agent Card Status Indicators */
.status-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
    margin: 0 2px;
}

.status-indicator.online {
    background-color: #10b981; /* Tailwind green-500 */
}

.status-indicator.offline {
    background-color: #ef4444; /* Tailwind red-500 */
}
```