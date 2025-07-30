# Backend AI Documentation Cleanup Plan

## Current Structure Assessment

### Well-Organized Areas:
1. **Root README** - Good overview, points to sub-components, no duplication of implementation details
2. **Component READMEs** - Each major component (hub, agent/manager, hub/manager) has focused documentation
3. **Capability Documentation** - Cloudflare DNS capability has its own detailed README

### Issues Found:

1. **Manager Documentation Duplication**:
   - `/agent/manager/README.md` and `/hub/manager/README.md` are 90% identical
   - Both describe the same manager pattern but for different components
   - Could benefit from a shared manager pattern document

2. **Missing Agent README**:
   - No `/agent/README.md` to describe the agent component specifically
   - Agent details are mixed into root README

3. **Template Documentation**:
   - `/agent/templates/rc.d/README.md` and `/agent/templates/systemd/README.md` exist but weren't checked
   - These might have service-specific details that could be consolidated

## Recommended Structure:

```
backend-ai/
├── README.md                          # Overview, architecture, quick start
├── CLAUDE.md                          # AI assistant instructions
├── docs/
│   ├── architecture/                  # Architecture decisions (already good)
│   ├── deployment/                    # Deployment guides (already good)
│   └── patterns/
│       └── MANAGER_PATTERN.md         # Shared manager pattern documentation
├── hub/
│   ├── README.md                      # Hub-specific details, API endpoints
│   └── manager/
│       └── README.md                  # Brief: "Hub manager - see /docs/patterns/MANAGER_PATTERN.md"
├── agent/
│   ├── README.md                      # NEW: Agent-specific details, capabilities
│   ├── manager/
│   │   └── README.md                  # Brief: "Agent manager - see /docs/patterns/MANAGER_PATTERN.md"
│   ├── capabilities/
│   │   └── cloudflare-dns/
│   │       └── README.md              # Capability details (already good)
│   └── templates/
│       ├── systemd/
│       │   └── README.md              # systemd-specific setup
│       └── rc.d/
│           └── README.md              # rc.d-specific setup
└── shared/
    └── README.md                      # NEW: Shared types and utilities documentation
```

## Specific Changes Needed:

### 1. Create `/agent/README.md`
Move agent-specific content from root README:
- Agent architecture
- Port 3080 details
- Agent capabilities
- How agents work with hub

### 2. Create `/docs/patterns/MANAGER_PATTERN.md`
Extract common manager pattern from both manager READMEs:
- Why separate manager (reliability, updates, etc.)
- Standard endpoints (/status, /start, /stop, /restart, /update, /version, /logs)
- Port 3081 convention
- Update process flow
- Security considerations

### 3. Update Manager READMEs
Simplify to component-specific details only:
- Installation location
- Service name
- Specific configuration
- Link to shared pattern doc

### 4. Create `/shared/README.md`
Document the shared types library:
- What types are shared
- How to use them
- Adding new types

### 5. Update Root README
Ensure it:
- Provides high-level overview only
- Links to component READMEs for details
- Keeps critical invariants (NO WEBSOCKETS, port numbers, etc.)
- Quick start remains simple

## Benefits:
1. **No duplication** - Shared patterns documented once
2. **Clear hierarchy** - Root → Component → Implementation
3. **AI-friendly** - Each folder has clear purpose
4. **Maintainable** - Updates to patterns happen in one place