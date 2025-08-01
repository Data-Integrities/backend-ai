# Backend AI Regeneration Guide

This project uses a regeneration pattern to maintain consistency between documentation and code. 
When making systemic changes, update the appropriate rules document and regenerate the affected code.

## Overview

The Backend AI system is divided into three regeneration domains:
1. **Communication** - How components talk to each other via callbacks
2. **UI** - How the system presents information to users
3. **Deployment** - How the system gets installed and updated

Each domain has its own regeneration document that defines the rules and specifications for that aspect of the system.

## Regeneration Documents

### 1. REGENERATE_COMMUNICATION.md
**Purpose**: Defines the callback-based communication architecture between Hub, Agents, and Managers

**Scope**:
- Callback protocols and JSON structures
- Status update mechanisms and timing
- Correlation tracking and execution monitoring
- Agent/Manager communication patterns
- Timeout handling and force-kill procedures
- Logging responsibilities for each component

**Key files affected**:
- `/hub/api/correlation-endpoints.ts` - Callback receipt and processing
- `/hub/api/correlation-tracker.ts` - Execution tracking and timeouts
- `/hub/api/webAPI.ts` - Parent-child execution monitoring
- `/hub/api/manager-control.ts` - Manager control via SSH
- `/hub/gui/index.html` - Callback handling and status update logic only
- `/agent/api/index.ts` - Agent startup and callback sending
- `/agent/manager/index.ts` - Manager monitoring and callbacks
- `/agent/templates/*/ai-agent-manager-*.sh` - Start/stop wrapper scripts

**When to regenerate**: When changing how components communicate, adding new callback types, or modifying the execution flow

### 2. REGENERATE_UI.md
**Purpose**: Defines the user interface appearance and interaction patterns

**Scope**:
- Modal layouts and dimensions
- Card appearance and status indicators
- Console formatting and log display
- Menu structures and navigation
- Visual feedback and animations
- Error dialogs and user notifications

**Key files affected**:
- `/hub/gui/index.html` - UI elements, styling, layouts
- `/hub/gui/styles.css` (if separated)
- Any UI component files

**When to regenerate**: When redesigning UI elements, changing layouts, or updating visual styles

### 3. REGENERATE_DEPLOYMENT.md
**Purpose**: Defines deployment automation, service management, and platform-specific configurations

**Scope**:
- Deployment script logic and parallelization
- Service file configurations (systemd/rc.d)
- Platform-specific adaptations (Linux/Unraid)
- Version management and auto-incrementing
- File permissions and ownership
- Node.js installation and verification

**Key files affected**:
- `/deploy-everything.sh` - Main deployment script
- `/agent/templates/systemd/*` - systemd service files
- `/agent/templates/rc.d/*` - Unraid rc.d scripts
- Installation and setup scripts

**When to regenerate**: When changing deployment processes, adding platform support, or modifying service configurations

## Regeneration Process

1. **Identify the domain** - Determine which aspect needs changes (communication/UI/deployment)
2. **Update the rules** - Modify the appropriate REGENERATE_*.md document
3. **Request regeneration** - Ask Claude to regenerate code based on that specific document
4. **Review changes** - Carefully review the regenerated code for unintended modifications
5. **Test thoroughly** - Verify the regenerated code works as expected
6. **Commit together** - Always commit both the rules and regenerated code in the same commit

## Important Guidelines

### Do's:
- ✅ Regenerate from ONE document at a time
- ✅ Always test regenerated code before deployment
- ✅ Keep rules documents up to date with manual changes
- ✅ Use regeneration for systemic changes
- ✅ Review diffs carefully before committing

### Don'ts:
- ❌ Don't regenerate from all documents at once (unless full rebuild)
- ❌ Don't mix concerns between documents
- ❌ Don't regenerate for minor tweaks - just update the code
- ❌ Don't forget to update the rules when making manual changes

## Example Scenarios

**Scenario 1**: "Callbacks are showing 'unknown' agent name"
- Domain: Communication
- Update: REGENERATE_COMMUNICATION.md
- Regenerate: Callback handling code

**Scenario 2**: "Make the log viewer more compact"
- Domain: UI
- Update: REGENERATE_UI.md
- Regenerate: UI layout code

**Scenario 3**: "Deploy to workers in parallel"
- Domain: Deployment
- Update: REGENERATE_DEPLOYMENT.md
- Regenerate: deploy-everything.sh

## Quick Reference

| Change Type | Use Document |
|------------|--------------|
| Callback format | REGENERATE_COMMUNICATION.md |
| Status updates | REGENERATE_COMMUNICATION.md |
| Modal appearance | REGENERATE_UI.md |
| Console layout | REGENERATE_UI.md |
| Deploy scripts | REGENERATE_DEPLOYMENT.md |
| Service files | REGENERATE_DEPLOYMENT.md |

## Notes

- Each regeneration document should be self-contained with all rules for that domain
- Cross-references between documents should be minimal
- When in doubt, regenerate less rather than more
- Manual fixes are fine for isolated issues - regeneration is for systemic changes