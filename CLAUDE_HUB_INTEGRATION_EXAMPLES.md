# Claude Code to Hub Integration Examples

This document shows practical examples of how Claude Code can interact with the Backend AI Hub to manage infrastructure while developing applications.

## Example 1: Setting Up Auto-Deployment for a Node.js Project

### User Request
"Set up automatic deployment for this Node.js app to the nginx server"

### Claude Code Actions

```bash
# 1. First, check if the hub is accessible
curl -s http://192.168.1.30/health

# 2. Check if nginx agent is online
curl -s http://192.168.1.30/api/agents | jq '.agents[] | select(.["agent-name"] == "nginx")'

# 3. Ask nginx if GitHub Actions runner is installed
curl -X POST http://192.168.1.30/api/command \
  -H "Content-Type: application/json" \
  -d '{
    "target": "nginx",
    "command": "Check if GitHub Actions runner is installed and configured for the provider-search repository"
  }'

# 4. If runner not installed, request installation
curl -X POST http://192.168.1.30/api/command \
  -H "Content-Type: application/json" \
  -d '{
    "target": "nginx",
    "command": "Install GitHub Actions runner for repository provider-search/backend-ai with name nginx-runner"
  }'

# 5. Create workflow file
cat > .github/workflows/deploy-to-nginx.yml << 'EOF'
name: Deploy to Nginx Server

on:
  push:
    branches: [main]
    paths:
      - 'app/**'
      - 'package.json'
      - 'package-lock.json'

jobs:
  deploy:
    runs-on: [self-hosted, nginx-runner]
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Install dependencies
        run: npm ci
        
      - name: Build application
        run: npm run build
        
      - name: Deploy to production
        run: |
          pm2 stop app-name || true
          cp -r dist/* /var/www/app-name/
          pm2 start ecosystem.config.js
EOF
```

## Example 2: Creating a New Container for Database

### User Request
"I need a MongoDB container for this project"

### Claude Code Actions

```bash
# 1. Request container creation on pve1
curl -X POST http://192.168.1.30/api/command \
  -H "Content-Type: application/json" \
  -d '{
    "target": "pve1",
    "command": "Create an LXC container named mongodb at IP 192.168.1.45 with 4GB RAM and 20GB disk using Ubuntu 22.04 template"
  }'

# 2. Wait for container creation (poll for results)
COMMAND_ID="<from-previous-response>"
curl -s http://192.168.1.30/api/command/$COMMAND_ID/results

# 3. Deploy agent to new container
curl -X POST http://192.168.1.30/api/command \
  -H "Content-Type: application/json" \
  -d '{
    "target": "pve1",
    "command": "Deploy AI agent to container mongodb at 192.168.1.45"
  }'

# 4. Configure MongoDB through the new agent
curl -X POST http://192.168.1.30/api/command \
  -H "Content-Type: application/json" \
  -d '{
    "target": "mongodb",
    "command": "Install MongoDB 7.0 and configure it to listen on all interfaces with authentication enabled"
  }'
```

## Example 3: Setting Up SSL Certificates

### User Request
"Set up SSL for app.dataintegrities.com"

### Claude Code Actions

```bash
# 1. Configure DNS through nginx (which manages Cloudflare)
curl -X POST http://192.168.1.30/api/command \
  -H "Content-Type: application/json" \
  -d '{
    "target": "nginx",
    "command": "Create internal DNS entry for app.dataintegrities.com pointing to 192.168.1.22 and configure nginx reverse proxy with SSL"
  }'

# 2. Request SSL certificate generation
curl -X POST http://192.168.1.30/api/command \
  -H "Content-Type: application/json" \
  -d '{
    "target": "nginx",
    "command": "Generate Let's Encrypt SSL certificate for app.dataintegrities.com"
  }'
```

## Example 4: Multi-Agent Coordination

### User Request
"Deploy this microservices app across multiple servers"

### Claude Code Actions

```bash
# 1. Check all required agents are online
curl -s http://192.168.1.30/api/agents | jq '.agents[] | select(.["agent-name"] | IN("nginx", "app", "mongo", "services"))'

# 2. Deploy database first
curl -X POST http://192.168.1.30/api/command \
  -H "Content-Type: application/json" \
  -d '{
    "target": "mongo",
    "command": "Set up MongoDB replica set for microservices-app database"
  }'

# 3. Deploy backend services
curl -X POST http://192.168.1.30/api/command \
  -H "Content-Type: application/json" \
  -d '{
    "target": "services",
    "command": "Deploy auth-service and api-service from provider-search/microservices repo"
  }'

# 4. Deploy frontend
curl -X POST http://192.168.1.30/api/command \
  -H "Content-Type: application/json" \
  -d '{
    "target": "app",
    "command": "Deploy React frontend from provider-search/microservices-frontend repo"
  }'

# 5. Configure load balancer
curl -X POST http://192.168.1.30/api/command \
  -H "Content-Type: application/json" \
  -d '{
    "target": "nginx",
    "command": "Configure load balancing for microservices.dataintegrities.com across app and services servers"
  }'
```

## Example 5: Infrastructure Query and Monitoring

### User Request
"Show me the status of all my services"

### Claude Code Actions

```bash
# 1. Get all agents status
curl -s http://192.168.1.30/api/agents | jq -r '.agents[] | "\(.["agent-name"]): \(if .online then "🟢 Online" else "🔴 Offline" end)"'

# 2. Check specific service health
curl -X POST http://192.168.1.30/api/command \
  -H "Content-Type: application/json" \
  -d '{
    "targets": ["nginx", "app", "mongo", "services"],
    "command": "Show running services and their resource usage"
  }'

# 3. Get system metrics
curl -X POST http://192.168.1.30/api/command \
  -H "Content-Type: application/json" \
  -d '{
    "targets": ["pve1", "pve2", "pve3"],
    "command": "Show CPU, memory, and disk usage for all containers and VMs"
  }'
```

## Example 6: Teaching Agents New Capabilities

### User Request
"Teach nginx how to manage my Cloudflare DNS"

### Claude Code Actions

```bash
# Create a library document for the nginx agent
curl -X POST http://192.168.1.30/api/command \
  -H "Content-Type: application/json" \
  -d '{
    "target": "nginx",
    "command": "Create a library document called cloudflare-management.md with the following content: [Cloudflare DNS Management Guide - API endpoints, authentication with API token stored in /etc/cloudflare/token, commands for creating A records, CNAME records, and managing SSL settings]"
  }'

# Now nginx can handle Cloudflare commands
curl -X POST http://192.168.1.30/api/command \
  -H "Content-Type: application/json" \
  -d '{
    "target": "nginx",
    "command": "Create external DNS entry for api.dataintegrities.com pointing to our public IP with Cloudflare proxy enabled"
  }'
```

## Integration Best Practices

1. **Always Check Agent Status First**: Before sending commands, verify the target agent is online
2. **Use Command IDs**: Store command IDs to poll for results, especially for long-running operations
3. **Handle Approval Requirements**: Some commands may require approval - poll for status
4. **Batch Related Commands**: Use multi-target commands when coordinating across agents
5. **Document in Code**: Add comments in your code about infrastructure dependencies

## Error Handling

```bash
# Check if hub is accessible
if ! curl -s --fail http://192.168.1.30/health > /dev/null; then
  echo "Hub is not accessible. Infrastructure commands unavailable."
  exit 1
fi

# Check if specific agent is online before sending commands
AGENT_STATUS=$(curl -s http://192.168.1.30/api/agents | jq -r '.agents[] | select(.["agent-name"] == "nginx") | .online')
if [ "$AGENT_STATUS" != "true" ]; then
  echo "Nginx agent is offline. Cannot proceed with deployment."
  exit 1
fi
```

## Future Patterns

As the hub and agents evolve, these patterns will expand to include:
- Automated testing infrastructure provisioning
- Blue-green deployments
- Database migration coordination
- Disaster recovery automation
- Cross-datacenter replication setup