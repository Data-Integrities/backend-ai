# Proxmox AI Control Agent

An intelligent agent that integrates with Proxmox VE API to provide natural language control over virtual machines, containers, and cluster operations.

## Features

### VM/Container Management
- **Start/Stop/Restart**: Control VM and container states
- **Status Monitoring**: Check VM health and resource usage
- **Migration**: Live migrate VMs between nodes
- **Clone Operations**: Create copies of existing VMs/containers

### Advanced Operations
- **Create VMs/Containers**: Deploy new instances with custom specifications
- **Backup Management**: Create and manage VM backups
- **Resource Monitoring**: Track cluster-wide resource usage
- **Auto-remediation**: Automatic alerts for issues

### Natural Language Commands
```
"Restart the web-server VM"
"Show status of all VMs on pve1"
"Migrate database-server to pve2"
"Create a new container named api-server with 4GB RAM"
"Backup the production VMs to local storage"
"What's the resource usage across the cluster?"
```

## Installation

### Prerequisites
- Proxmox VE cluster (7.0+)
- Node.js 18+
- Root access to install location

### Quick Install
```bash
# Download and install
git clone <repository>
cd agent-proxmox
npm install
npm run build

# Configure and install
sudo ./install-proxmox-agent.sh
```

### Manual Setup
```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env

# Build and start
npm run build
npm start
```

## Configuration

Edit `.env` or `/etc/proxmox-ai-agent/agent.env`:

```env
# Agent identification
AGENT_ID=proxmox-main-cluster
HUB_URL=ws://your-hub-server:3001

# Proxmox connection
PROXMOX_HOST=192.168.1.100
PROXMOX_USER=root@pam
PROXMOX_PASSWORD=your-secure-password

# Logging
LOG_LEVEL=info
```

## Supported Commands

### VM/Container Operations
| Command | Example | Risk Level |
|---------|---------|-----------|
| Start | "Start the web-server VM" | Low |
| Stop | "Stop container 101" | Medium |
| Restart | "Restart the database server" | Medium |
| Shutdown | "Gracefully shutdown the API server" | Medium |

### Management Operations
| Command | Example | Risk Level |
|---------|---------|-----------|
| Create | "Create a container named test-server with 2GB RAM" | High |
| Clone | "Clone web-server to web-server-backup" | Medium |
| Delete | "Delete the old-backup VM" | Critical |
| Migrate | "Move database-vm from pve1 to pve2" | High |

### Monitoring Commands
| Command | Example | Risk Level |
|---------|---------|-----------|
| Status | "Show status of VM web-server" | Low |
| List | "List all VMs on pve2" | Low |
| Resources | "Show cluster resource usage" | Low |
| Backup | "Backup the production VMs" | Low |

## API Integration

The agent uses the Proxmox VE REST API for all operations:

### Authentication
- Supports PAM and PVE authentication
- Automatic token refresh
- Secure credential storage

### Operations Supported
- VM lifecycle management (QEMU)
- Container operations (LXC)
- Cluster resource monitoring
- Node management
- Storage operations
- Backup/restore functionality

## Safety Features

### Risk Assessment
- **Low Risk**: Read-only operations, status checks
- **Medium Risk**: VM restarts, migrations
- **High Risk**: Creating/deleting resources
- **Critical Risk**: Destructive operations

### Confirmation Requirements
```javascript
// High/Critical risk operations require confirmation
"Delete the test-vm"
→ "⚠️ This will permanently delete VM 'test-vm'. Confirm? (y/N)"
```

### Validation
- VM name/ID validation before operations
- Node availability checks
- Resource constraint validation
- Task status monitoring

## Monitoring & Alerts

### Automatic Monitoring
- VM/Container status changes
- Resource threshold alerts
- Node health monitoring
- Failed backup notifications

### Alert Examples
```
🔴 High CPU usage on node pve1: 85%
⚠️  VM web-server-01 unexpectedly stopped
🟡 3 autostart VMs are currently stopped
✅ Backup of production VMs completed successfully
```

## Advanced Usage

### Batch Operations
```
"Start all VMs tagged with 'production'"
"Show status of containers on pve2"
"Backup all VMs with tag 'critical'"
```

### Conditional Logic
```
"If database-server is stopped, start it"
"Migrate overloaded VMs from pve1 to pve2"
"Create backup if VM hasn't been backed up in 7 days"
```

### Resource Management
```
"Show VMs using more than 80% CPU"
"List nodes with low disk space"
"Find VMs that can be migrated to balance load"
```

## Integration Examples

### Build Pipeline Integration
```bash
# In your CI/CD pipeline
curl -X POST http://hub:3000/api/command \
  -H "Content-Type: application/json" \
  -d '{"command": "Start the build-server VM"}'
```

### Monitoring Integration
```bash
# Prometheus AlertManager webhook
curl -X POST http://hub:3000/api/command \
  -d '{"command": "Restart the overloaded web-server"}'
```

### Chat Integration
```javascript
// Slack bot integration
async function handleSlackCommand(command) {
  const response = await fetch(`${HUB_URL}/api/command`, {
    method: 'POST',
    body: JSON.stringify({ command }),
    headers: { 'Content-Type': 'application/json' }
  });
  return response.json();
}
```

## Troubleshooting

### Common Issues

**Agent won't connect to Proxmox**
```bash
# Check credentials and network
curl -k https://pve.example.com:8006/api2/json/access/ticket \
  -d "username=root@pam&password=yourpassword"
```

**Commands not executing**
```bash
# Check agent logs
journalctl -u proxmox-ai-agent -f

# Test Proxmox API directly
curl -k https://pve.example.com:8006/api2/json/nodes
```

**Permission denied errors**
- Ensure Proxmox user has sufficient privileges
- Check firewall settings (port 8006)
- Verify SSL certificate trust

### Debugging

Enable debug logging:
```env
LOG_LEVEL=debug
```

Monitor API calls:
```bash
tail -f /var/log/proxmox-ai-agent/combined.log | grep API
```

## Security Considerations

### Access Control
- Use dedicated Proxmox user with minimal required permissions
- Store credentials securely (environment variables)
- Enable SSL/TLS for all communications

### Network Security
- Restrict agent network access to Proxmox cluster
- Use VPN for remote agent deployments
- Monitor and log all agent activities

### Operational Security
- Regular password rotation
- Audit command execution logs
- Implement approval workflows for critical operations

## Performance

### Resource Usage
- **Memory**: ~50MB base + API caching
- **CPU**: <1% during normal operations
- **Network**: Minimal (API calls + WebSocket)

### Scalability
- Supports clusters up to 32 nodes
- Handles 1000+ VMs/containers
- Concurrent operation support

### Optimization
- API response caching
- Bulk operation batching
- Async task monitoring

## Contributing

1. Fork the repository
2. Create feature branch
3. Add comprehensive tests
4. Update documentation
5. Submit pull request

## License

MIT License - see LICENSE file for details.