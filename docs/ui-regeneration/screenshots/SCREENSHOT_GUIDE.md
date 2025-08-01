# UI Screenshot Guide for Regeneration

This guide lists all screenshots needed for pixel-perfect UI regeneration. Please use the exact filenames provided.

## Agent Cards (`agent-cards/`)

### Basic States
- `agent-card-both-online.png` - Agent and Manager both green (show nginx card)
- `agent-card-agent-offline-manager-online.png` - Agent red, Manager green
- `agent-card-agent-online-manager-offline.png` - Agent green, Manager red
- `agent-card-both-offline.png` - Both indicators red (NOTE: Should still show last known versions)
- `agent-card-hover-state.png` - Mouse hovering over card (if there's hover effect)

### Grid Layout
- `agent-cards-grid-layout.png` - Show multiple cards to see spacing between them

### Version Display
- `agent-card-with-versions.png` - Close-up showing version text when services online
- `agent-card-no-versions.png` - Close-up showing "unknown" only on first startup before any polling

## Log Viewer (`log-viewer/`)

### Modal Structure
- `log-viewer-full-modal.png` - Entire modal showing 80vh height with gaps
- `log-viewer-title-bar.png` - Close-up of compact title bar with smaller font
- `log-viewer-header-section.png` - The 2-line header with command/agent/status

### Content Areas
- `log-viewer-execution-timeline.png` - The scrollable log area
- `log-viewer-long-lines-wrapped.png` - Show how long lines wrap
- `log-viewer-empty-state.png` - How it looks with no logs

## Console (`console/`)

### Entry Types
- `console-entry-pending.png` - Blue pending status
- `console-entry-success.png` - Green success status
- `console-entry-failed.png` - Red failed status
- `console-entry-timeout.png` - Orange timeout status
- `console-entry-manual-termination.png` - Orange manual termination
- `console-entry-partial-success.png` - Yellow partial success

### Parent-Child Display
- `console-parent-child-hierarchy.png` - Show parent with indented children
- `console-multiple-operations.png` - Several operations to show scroll behavior

### Timestamp Format
- `console-timestamp-format.png` - Close-up showing timestamp format

## Dialogs (`dialogs/`)

### Summary Dialogs
- `dialog-stop-all-success.png` - All managers stopped successfully
- `dialog-stop-all-partial.png` - Some success, some failed
- `dialog-stop-all-failed.png` - All operations failed
- `dialog-start-all-success.png` - All agents started successfully

### Error Dialogs
- `dialog-manager-offline-error.png` - "Cannot Control Agent" error
- `dialog-agent-not-found.png` - Agent not found error

### Dialog Components
- `dialog-header-with-timing.png` - Close-up of "Total time: X.XX seconds"
- `dialog-individual-timings.png` - Close-up of "→ 2.4s" timing display

## Hamburger Menu (`hamburger-menu/`)

### Menu States
- `hamburger-menu-closed.png` - The hamburger icon in header
- `hamburger-menu-open-full.png` - Full dropdown showing all options
- `hamburger-menu-dividers.png` - Close-up of divider styling

### Menu Sections
- `hamburger-menu-agent-operations.png` - Agent operations section
- `hamburger-menu-manager-operations.png` - Manager operations section

## Status Bar (`status-bar/`)

### Clock Display
- `status-bar-clock-format.png` - Showing "2:45:33 PM" format (no leading zero)
- `status-bar-last-update.png` - The "Last Update" timestamp

### Full Status Bar
- `status-bar-complete.png` - Entire status bar in context

## Additional Context Shots

### Full Page Views
- `full-page-normal-state.png` - Entire hub interface in normal state
- `full-page-with-modal.png` - Hub with log viewer modal open
- `full-page-operation-running.png` - Hub during active operations

### Responsive Behavior
- `responsive-tablet-view.png` - How it looks on tablet
- `responsive-mobile-view.png` - How it looks on mobile (if supported)

## CSS/Styling References

For each major component, also capture:
- Browser DevTools showing computed styles
- Any custom CSS classes used
- Color values from DevTools color picker

## Notes for Screenshots

1. **Use Chrome/Firefox DevTools** to capture exact color values
2. **Include ruler/measurement tool** when showing spacing
3. **Consistent window size** - Use 1920x1080 if possible
4. **Light background** - Ensure good contrast for documentation
5. **Real data** - Use actual agent names, not test data

## Example Annotations

For critical measurements, you can annotate screenshots with:
- Red arrows pointing to specific elements
- Text labels with pixel values (e.g., "10px gap")
- Color swatches showing exact hex values

Save any annotated versions with `-annotated` suffix:
- `agent-card-both-online-annotated.png`