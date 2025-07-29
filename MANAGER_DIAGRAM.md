# Manager Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Developer Machine                          │
│                                                                     │
│  ┌─────────────────┐                                               │
│  │ deploy-version.sh│ ─────┐                                       │
│  └─────────────────┘      │                                       │
│                           ▼                                       │
│                    Builds & Uploads                               │
│                    hub-2.0.11.tar.gz                             │
│                    agent-2.0.11.tar.gz                           │
└───────────────────────────┼─────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    NAS (192.168.1.10:8888)                          │
│  ┌─────────────────────────────────────────────────────┐          │
│  │ /2.0.11/                                             │          │
│  │   ├── hub-2.0.11.tar.gz                            │          │
│  │   └── agent-2.0.11.tar.gz                          │          │
│  └─────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
                           ▲                    ▲
                           │                    │
                    Downloads from         Downloads from
                           │                    │
┌──────────────────────────┼────────────────────┼─────────────────────┐
│                          │                    │                     │
│   Hub VM (192.168.1.30)  │                    │                     │
│                          │                    │                     │
│  ┌────────────────┐     │      ┌─────────────┼──────────┐         │
│  │  Hub Manager   │◄────┘      │    Hub Service         │         │
│  │  Port: 3081    │            │    Port: 3000          │         │
│  │  (localhost)   │─controls─► │                        │         │
│  └────────────────┘            │  - AI Command Logic    │         │
│                                │  - Agent Management     │         │
│                                │  - Web UI              │         │
│                                └───────────┬─────────────┘         │
│                                           │                        │
└───────────────────────────────────────────┼────────────────────────┘
                                           │
                                 Tells agents to update
                                           │
        ┌──────────────────────────────────┼──────────────────────────┐
        │                                  ▼                          │
        ▼                                                            ▼
┌───────────────────────┐                                  ┌───────────────────────┐
│ nginx (192.168.1.2)   │                                  │ unraid (192.168.1.10) │
│                       │                                  │                       │
│ ┌──────────────┐     │                                  │ ┌──────────────┐     │
│ │Agent Manager │◄────┼─── Downloads from NAS            │ │Agent Manager │     │
│ │Port: 3081    │     │                                  │ │Port: 3081    │     │
│ └──────┬───────┘     │                                  │ └──────┬───────┘     │
│        │             │                                  │        │             │
│        ▼             │                                  │        ▼             │
│ ┌──────────────┐     │                                  │ ┌──────────────┐     │
│ │Agent Service │     │                                  │ │Agent Service │     │
│ │Port: 3080    │     │                                  │ │Port: 3080    │     │
│ └──────────────┘     │                                  │ └──────────────┘     │
└───────────────────────┘                                  └───────────────────────┘
```

## Port Consistency

All managers run on **port 3081** - just like all file servers run on the same port:

```
┌─────────────────────────────────────────────────────────────┐
│                        Port Layout                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Service Type          Port    Access                       │
│  ─────────────────────────────────────────────             │
│  Hub Manager          3081    localhost only                │
│  Agent Managers       3081    network (from hub)            │
│  Hub Service          3000    network (web UI)              │
│  Agent Services       3080    network (from hub)            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Update Flow Sequence

```
1. Developer runs: ./deploy-version.sh 2.0.11
   │
   ├─► Builds hub and agent
   ├─► Uploads to NAS
   └─► Calls hub manager
   
2. Hub Manager (via SSH to localhost:3081)
   │
   ├─► Downloads hub-2.0.11.tar.gz from NAS
   ├─► Backs up current hub
   ├─► Installs new version
   └─► Restarts hub service
   
3. Hub Service (now running 2.0.11)
   │
   ├─► Detects version mismatch with agents
   └─► Calls each agent manager
   
4. Agent Managers (network accessible :3081)
   │
   ├─► Download agent-2.0.11.tar.gz from NAS
   ├─► Back up current agent
   ├─► Install new version
   └─► Restart agent service
```

## Key Design Principles

1. **Managers are minimal** - Only lifecycle control, no business logic
2. **Consistent ports** - All managers on 3081 (like file servers on 8888)
3. **Separation of concerns** - Managers vs Services
4. **Network security** - Hub manager localhost only, agent managers network accessible
5. **Automated updates** - One command updates entire infrastructure