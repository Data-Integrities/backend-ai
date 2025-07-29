# The Backend AI Story: Our Journey to Infrastructure Management

## Chapter 1: The Beginning - "Just Get Them Running"

We started with a simple goal: create AI-powered agents that could manage infrastructure across different machines. The initial architecture was straightforward:
- A Hub (the brain) on 192.168.1.30
- Agents (the workers) on various machines: nginx, pve1, pve2, pve3, unraid
- WebSocket connections between them

### The First Problems

Almost immediately, we hit issues:
- Agents would crash and not restart
- WebSocket connections were unreliable
- Each machine had different ways of keeping services running (PM2, systemd, Docker)
- Version mismatches everywhere

*"Why is nginx running version 1.0.0 but pve1 has 2.0.7?"*

## Chapter 2: The Authentication Detour

Jeff had strong opinions about authentication. We implemented a time-based token system:
- Tokens that expired after a certain time
- Complex validation between hub and agents
- Security headers everywhere

But then we realized something: this was internal infrastructure. The agents were on a private network. We were over-engineering.

*"Let's remove the auth for now and focus on getting things working."*

## Chapter 3: The WebSocket Problem

WebSockets seemed elegant at first:
- Real-time communication
- Push notifications
- Instant status updates

But they became our biggest headache:
- Connections would drop randomly
- Reconnection logic was complex
- State synchronization was a nightmare

The solution? Switch to simple HTTP:
- Agents have REST APIs on port 3080
- Hub polls agents periodically
- Simple, reliable, debuggable

*"No WebSockets! Pure HTTP/REST architecture."*

## Chapter 4: The PM2 Mess

Each machine had its own way of managing processes:
- nginx used PM2
- Proxmox hosts used systemd with bash wrapper scripts
- unraid had Docker

This led to the infamous "31.52%" bug - PM2 would keep restarting crashed agents, creating multiple instances, all fighting for port 3080.

*"Why is there 31.52% of an agent running?!"*

## Chapter 5: The Manager Revolution

The breakthrough came when we realized we needed a separation of concerns:
- **Agents** (port 3080): Do the actual work
- **Managers** (port 3081): Control agent lifecycle

The managers would be dead simple:
```javascript
// That's it. That's all a manager does.
app.post('/start', () => { systemctl start ai-agent });
app.post('/stop', () => { systemctl stop ai-agent });
app.post('/restart', () => { systemctl restart ai-agent });
app.post('/update', () => { /* download and extract */ });
```

### The Design Principles

1. **Managers are thin** - No business logic, just lifecycle control
2. **Managers are consistent** - All on port 3081, same API everywhere
3. **Managers are reliable** - If agent crashes, manager can restart it
4. **Managers enable updates** - Hub tells manager to update, manager handles it

*"It's just like wanting all file servers on the same port - consistency matters!"*

## Chapter 6: The Deployment Disaster

Every deployment was an adventure:
- Build locally but forget to include `dist/` folder
- Wrong file permissions
- Missing dependencies
- Old processes still running on ports

We kept hitting the same issues:
- "MODULE_NOT_FOUND" - forgot to build
- "EADDRINUSE" - old process still running
- "Cannot find dist/api/index.js" - deployed source, not built code

## Chapter 7: The Great Unification

Finally, we standardized everything:
- All agents run as systemd services
- All agents have managers
- All deployments include built code
- Version numbers match across hub and agents

The deployment flow became:
1. Build both hub and agent locally
2. Upload to NAS in version-specific folder
3. Tell hub manager to update hub
4. Hub tells all agent managers to update agents
5. Everything running the same version!

## Chapter 8: The UI Evolution

The hub UI went through several iterations:
- Added version numbers (right-justified, of course)
- Replaced "Chat History" with a VSCode-style status bar
- Added hamburger menu for bulk operations
- Swapped icons (hub gets green A, agents get blue H)

*"When I see hub 2.0.9 and agent 2.0.7, I know there's a problem."*

## The Lessons Learned

1. **Simple is better** - HTTP beats WebSockets for reliability
2. **Consistency matters** - Same ports, same patterns everywhere
3. **Separation of concerns** - Managers handle lifecycle, agents do work
4. **Build before deploy** - Always include the `dist` folder!
5. **Version everything** - Matching versions prevent confusion
6. **Remove PM2** - One process manager (systemd) is enough

## The Current State

Today, the system is humming along:
- ✅ Agents on all machines (nginx, pve1, pve2, pve3, unraid)
- ✅ Managers controlling lifecycle
- ✅ Hub coordinating everything
- ✅ "Start All" / "Stop All" working from hamburger menu
- ✅ Consistent versions everywhere

## What's Next?

- Better error handling for the `dist` folder issue
- Automated builds before deployment
- Maybe bring back authentication (but simpler!)
- Health checks and auto-recovery

---

*"Please push out our latest version"*
*"Version 2.0.11 deployed successfully"*
*"GRRREAT!!!"*

That's our story so far. From WebSocket chaos to HTTP simplicity. From PM2 confusion to systemd clarity. From manual SSH sessions to automated deployments.

The journey continues...