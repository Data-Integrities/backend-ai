#!/bin/bash

# Screenshot capture helper script
SCREENSHOT_DIR="/Users/jeffk/Developement/provider-search/backend-ai/docs/ui-regeneration/screenshots"

# Define all screenshots needed (in order)
declare -a SCREENSHOTS=(
    "agent-cards/agent-card-both-online.png|Agent card with both A and M indicators GREEN (show nginx)"
    "agent-cards/agent-card-both-offline.png|Agent card with both A and M indicators RED (should still show version numbers)"
    "agent-cards/agent-card-agent-offline-manager-online.png|Agent card with A=RED, M=GREEN"
    "agent-cards/agent-card-agent-online-manager-offline.png|Agent card with A=GREEN, M=RED"
    "agent-cards/agent-card-hover-state.png|Mouse hovering over any agent card (if there's a hover effect)"
    "agent-cards/agent-card-with-versions.png|Close-up of version text when services are online"
    "agent-cards/agent-card-no-versions.png|Card showing 'unknown' (only if you have one that's never been polled)"
    "agent-cards/agent-cards-grid-layout.png|Multiple agent cards showing the grid spacing"
    "log-viewer/log-viewer-full-modal.png|ENTIRE log viewer modal (should show 80vh height)"
    "log-viewer/log-viewer-title-bar.png|Close-up of the compact title bar"
    "log-viewer/log-viewer-header-section.png|The 2-line header section with command/agent/status"
    "log-viewer/log-viewer-execution-timeline.png|The scrollable log content area"
    "log-viewer/log-viewer-long-lines-wrapped.png|Example of long log lines wrapping"
    "log-viewer/log-viewer-empty-state.png|Log viewer with no logs"
    "console/console-entry-pending.png|Blue PENDING status console entry"
    "console/console-entry-success.png|Green SUCCESS status console entry"
    "console/console-entry-failed.png|Red FAILED status console entry"
    "console/console-entry-timeout.png|Orange TIMEOUT status console entry"
    "console/console-entry-manual-termination.png|Orange MANUAL TERMINATION entry"
    "console/console-entry-partial-success.png|Yellow PARTIAL SUCCESS entry"
    "console/console-parent-child-hierarchy.png|Parent command with indented └─ children"
    "console/console-multiple-operations.png|Several operations showing scroll behavior"
    "console/console-timestamp-format.png|Close-up of timestamp format"
    "dialogs/dialog-stop-all-success.png|'Stop All Managers' success dialog"
    "dialogs/dialog-stop-all-partial.png|Dialog showing some succeeded, some failed"
    "dialogs/dialog-stop-all-failed.png|Dialog showing all operations failed"
    "dialogs/dialog-start-all-success.png|'Start All Agents' success dialog"
    "dialogs/dialog-manager-offline-error.png|'Cannot Control Agent' error when manager is down"
    "dialogs/dialog-agent-not-found.png|Agent not found error (if you have this)"
    "dialogs/dialog-header-with-timing.png|Close-up of 'Total time: X.XX seconds'"
    "dialogs/dialog-individual-timings.png|Close-up of individual '→ 2.4s' timings"
    "hamburger-menu/hamburger-menu-closed.png|The ☰ hamburger icon in header"
    "hamburger-menu/hamburger-menu-open-full.png|Full dropdown menu showing all options"
    "hamburger-menu/hamburger-menu-dividers.png|Close-up of the divider lines"
    "hamburger-menu/hamburger-menu-agent-operations.png|Agent operations section"
    "hamburger-menu/hamburger-menu-manager-operations.png|Manager operations section"
    "status-bar/status-bar-clock-format.png|Clock showing '2:45:33 PM' format (no leading zero)"
    "status-bar/status-bar-last-update.png|The 'Last Update' timestamp"
    "status-bar/status-bar-complete.png|Entire status bar at bottom"
    "full-page-normal-state.png|ENTIRE hub interface in normal state"
    "full-page-with-modal.png|Hub with log viewer modal open"
    "full-page-operation-running.png|Hub during active operations (console entries visible)"
    "responsive-tablet-view.png|Hub on tablet/iPad view (optional)"
    "responsive-mobile-view.png|Hub on mobile view (optional)"
)

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counter
CURRENT=0
TOTAL=${#SCREENSHOTS[@]}

echo -e "${BLUE}=== Backend AI Screenshot Capture Tool ===${NC}"
echo -e "Total screenshots needed: ${YELLOW}$TOTAL${NC}"
echo ""
echo "Instructions:"
echo "1. I'll tell you what to capture"
echo "2. Take the screenshot (Cmd+Shift+4 on Mac)"
echo "3. EITHER:"
echo "   - Drag & drop the image file here"
echo "   - OR: Right-click screenshot → Copy, then paste file path"
echo "   - OR: Type/paste the full file path"
echo "4. Press Enter to continue"
echo ""
echo -e "${YELLOW}Ready? Press Enter to start...${NC}"
read

# Loop through all screenshots
for item in "${SCREENSHOTS[@]}"; do
    # Split the item into path and description
    IFS='|' read -r filepath description <<< "$item"
    
    CURRENT=$((CURRENT + 1))
    FULL_PATH="$SCREENSHOT_DIR/$filepath"
    
    # Create directory if needed
    DIR=$(dirname "$FULL_PATH")
    mkdir -p "$DIR"
    
    echo ""
    echo -e "${BLUE}[$CURRENT/$TOTAL]${NC} ${GREEN}$filepath${NC}"
    echo -e "${YELLOW}Capture:${NC} $description"
    
    # Check if file already exists
    if [ -f "$FULL_PATH" ]; then
        echo -e "${GREEN}✓ Already exists${NC} (press Enter to keep, or drag & drop new image to replace)"
    else
        echo "Take screenshot, then drag & drop the file here (or paste path):"
    fi
    echo -n "> "
    
    # Read the pasted image path
    read PASTED_PATH
    
    # Check if something was pasted
    if [ -n "$PASTED_PATH" ] && [ -f "$PASTED_PATH" ]; then
        # Copy the pasted image to the correct location
        cp "$PASTED_PATH" "$FULL_PATH"
        echo -e "${GREEN}✓ Saved!${NC}"
    elif [ -f "$FULL_PATH" ]; then
        echo -e "${GREEN}✓ Kept existing file${NC}"
    else
        echo -e "${YELLOW}⚠ Skipped (no image)${NC}"
    fi
done

echo ""
echo -e "${GREEN}=== Capture Complete! ===${NC}"
echo ""
echo "Summary:"
find "$SCREENSHOT_DIR" -name "*.png" -type f | wc -l | xargs echo "Total PNG files:"
echo ""
echo "Next steps:"
echo "1. Review the captured screenshots"
echo "2. Push to GitHub"
echo "3. Test UI regeneration"