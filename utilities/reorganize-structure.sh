#!/bin/bash

echo "🚀 Reorganizing Backend AI structure..."

# Create clean directories
echo "Creating clean directory structure..."
mkdir -p clean-structure/agent/{src/api,src/ui,public,examples}
mkdir -p clean-structure/hub/{src/api,src/ui,public}

# Copy Agent files from web-agent (the good universal agent)
echo "Setting up universal Agent..."
cp -r web-agent/src/* clean-structure/agent/src/
cp web-agent/package.json clean-structure/agent/
cp web-agent/tsconfig.json clean-structure/agent/

# Copy Hub files (HTTP-only version)
echo "Setting up HTTP-only Hub..."
cp hub/src/index-http.ts clean-structure/hub/src/index.ts
cp hub/src/HttpAgentManager.ts clean-structure/hub/src/
cp hub/src/AICommandProcessor.ts clean-structure/hub/src/
cp hub/public/index.html clean-structure/hub/public/
cp hub/agents-config.json clean-structure/hub/
cp hub/package.json clean-structure/hub/
cp hub/tsconfig.json clean-structure/hub/
cp hub/.env clean-structure/hub/

# Copy shared folder
echo "Copying shared utilities..."
cp -r shared clean-structure/

# Create example READMEs
echo "Creating example README files..."

# Nginx example
cat > clean-structure/agent/examples/README-nginx.md << 'EOF'
# Nginx Web Server Agent

I am running on the nginx reverse proxy server at 192.168.1.2.

## Auto-Approved Actions (No confirmation needed)
- Reading configuration files
- Checking service status (systemctl status nginx)
- Testing nginx configuration (nginx -t)
- Listing sites (ls /etc/nginx/sites-*)
- Viewing logs (tail, cat, grep on log files)
- DNS lookups and queries

## Requires Approval
- Restarting or reloading nginx
- Creating or modifying site configurations
- Enabling/disabling sites
- Updating Cloudflare DNS records
- Installing packages or updates

## Critical Actions (Always require explicit approval)
- Deleting site configurations
- Modifying SSL certificates
- Changing nginx.conf
- System reboots

## Capabilities
- Nginx configuration path: /etc/nginx/
- Sites available: /etc/nginx/sites-available/
- Sites enabled: /etc/nginx/sites-enabled/
- Enable site: ln -s /etc/nginx/sites-available/{site} /etc/nginx/sites-enabled/
- Test config: nginx -t
- Reload nginx: systemctl reload nginx
- Cloudflare CLI: cloudflare-cli (token in /etc/cloudflare/token)

## Examples
- To add a new site: Create config in sites-available, test it, then symlink to sites-enabled
- To check config: nginx -t
- To update DNS: cloudflare-cli dns update example.com A 192.168.1.100
EOF

# Proxmox Host example
cat > clean-structure/agent/examples/README-proxmox-host.md << 'EOF'
# Proxmox Host Agent

I am running on Proxmox VE host pve1 at 192.168.1.5.

## Auto-Approved Actions (No confirmation needed)
- Listing VMs and containers (qm list, pct list)
- Checking resource usage (free, df, pvesh get /nodes/pve1/status)
- Reading configurations (qm config, pct config)
- Viewing logs
- Network status (ip addr, bridge status)
- Storage status (pvesm status)

## Requires Approval
- Starting/stopping VMs or containers
- Creating new VMs or containers  
- Modifying configurations
- Snapshot operations
- Backup operations
- Network configuration changes

## Critical Actions (Always require explicit approval)
- Destroying VMs or containers
- Deleting backups or snapshots
- Storage pool modifications
- Cluster changes
- System updates or reboots

## Capabilities
- VM management: qm command (create, start, stop, destroy, migrate)
- Container management: pct command (create, start, stop, destroy)
- Storage: pvesm command and /etc/pve/storage.cfg
- Network: /etc/network/interfaces
- Cluster: pvecm command
- API: pvesh for Proxmox API calls

## Examples
- Create VM: qm create 100 --name test-vm --memory 2048 --cores 2
- Start container: pct start 101
- Check cluster: pvecm status
- List storages: pvesm status
EOF

# Container example
cat > clean-structure/agent/examples/README-container.md << 'EOF'
# Application Container Agent

I am running inside LXC container CT-101 on pve2.

## Auto-Approved Actions (No confirmation needed)
- Checking application status
- Reading configuration files
- Viewing application logs
- Checking disk usage
- Listing processes

## Requires Approval
- Restarting applications
- Modifying configurations
- Installing packages
- Running maintenance scripts

## Critical Actions (Always require explicit approval)
- Deleting application data
- Database operations
- User management changes

## Capabilities
- Application: /opt/myapp/
- Config: /etc/myapp/config.yml
- Logs: /var/log/myapp/
- Service: systemctl start/stop/restart myapp
- Limited system access due to container restrictions

## Examples
- Check app: systemctl status myapp
- View logs: tail -f /var/log/myapp/app.log
- Restart app: systemctl restart myapp
EOF

echo "✅ Clean structure created in ./clean-structure/"
echo ""
echo "Next steps:"
echo "1. Review the new structure"
echo "2. Build both projects"
echo "3. Deploy to servers"
echo ""
echo "To build:"
echo "  cd clean-structure/agent && npm install && npm run build"
echo "  cd clean-structure/hub && npm install && npm run build"