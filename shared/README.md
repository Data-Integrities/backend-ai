# Backend AI Shared Types

This directory contains TypeScript type definitions shared between the hub, agents, and managers.

## Overview

The shared types library ensures type safety and consistency across all Backend AI components. All communication between services uses these typed interfaces.

## Key Types

### Communication Types (`types/Communication.ts`)

#### AgentInfo
Represents an agent's registration and status information:
```typescript
interface AgentInfo {
  agentId: string;           // Unique identifier
  "agent-name": string;      // Display name
  ip: string;               // Agent IP address
  registrationTime: number; // Unix timestamp
  capabilities: string[];   // Available capabilities
  machineInfo: MachineInfo; // System information
}
```

#### CommandRequest
Structure for commands sent from hub to agents:
```typescript
interface CommandRequest {
  command: string;      // Command to execute
  correlationId: string; // Tracking ID
  timestamp: number;    // Request time
}
```

#### CommandResponse
Response from agent after executing command:
```typescript
interface CommandResponse {
  correlationId: string;  // Matches request
  output: string;         // Command output
  error?: string;         // Error if failed
  timestamp: number;      // Response time
}
```

### System Types

#### MachineInfo
System information reported by agents:
```typescript
interface MachineInfo {
  hostname: string;
  platform: string;      // linux, darwin, win32
  release: string;       // OS version
  cpus: number;         // CPU count
  memory: {
    total: number;      // Total RAM in bytes
    free: number;       // Available RAM
  };
  uptime: number;       // System uptime in seconds
}
```

#### ServiceStatus
Service health information:
```typescript
interface ServiceStatus {
  name: string;          // Service name
  running: boolean;      // Is running?
  pid?: number;          // Process ID if running
  uptime?: number;       // Service uptime
}
```

## Usage

### In Hub
```typescript
import { AgentInfo, CommandRequest } from '@backend-ai/shared';

// Track registered agents
const agents: Map<string, AgentInfo> = new Map();

// Send command to agent
const request: CommandRequest = {
  command: 'systemctl status nginx',
  correlationId: generateId(),
  timestamp: Date.now()
};
```

### In Agent
```typescript
import { AgentInfo, CommandResponse } from '@backend-ai/shared';

// Register with hub
const info: AgentInfo = {
  agentId: 'nginx-001',
  "agent-name": 'nginx',
  ip: '192.168.1.2',
  registrationTime: Date.now(),
  capabilities: ['nginx', 'cloudflare-dns'],
  machineInfo: getMachineInfo()
};

// Respond to command
const response: CommandResponse = {
  correlationId: request.correlationId,
  output: stdout,
  timestamp: Date.now()
};
```

## Adding New Types

1. Add type definition to appropriate file in `/shared/src/types/`
2. Export from the module's index file
3. Run `npm run build` in shared directory
4. Update dependent services to use new types

## Building

The shared library must be built before use:
```bash
cd shared
npm install
npm run build
```

This creates `/shared/dist/` with compiled JavaScript and type definitions.

## Development Workflow

1. Make changes to types
2. Build shared library: `npm run build`
3. In dependent projects: `npm install ../shared`
4. TypeScript will pick up the new types

## Type Safety Benefits

- **Compile-time checking**: Catch type mismatches before runtime
- **IDE support**: Auto-completion and inline documentation
- **Refactoring safety**: Change types in one place, errors show everywhere
- **API contracts**: Clear interface between services

## Common Patterns

### Optional Fields
Use `?` for optional properties:
```typescript
interface Config {
  required: string;
  optional?: string;  // May be undefined
}
```

### Union Types
For fields with multiple possible types:
```typescript
type Status = 'pending' | 'running' | 'completed' | 'failed';
```

### Generic Types
For reusable patterns:
```typescript
interface Response<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

## Versioning

The shared types version should be bumped when:
- Adding new required fields (major)
- Removing fields (major)
- Changing field types (major)
- Adding optional fields (minor)
- Adding new interfaces (minor)