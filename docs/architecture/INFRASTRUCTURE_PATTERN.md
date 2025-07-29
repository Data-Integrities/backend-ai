# Infrastructure Pattern: aliases.zsh to Hub Configuration

## Overview
This document describes the pattern for managing machine access across the infrastructure, using ~/.zsh/aliases.zsh as the source of truth for machine names, IPs, and access patterns.

## SSH Alias Pattern in aliases.zsh

The aliases follow a consistent pattern:
```bash
alias <machine-name>="ssh <user>@<ip-address>"
```

Examples:
```bash
alias nginx="ssh root@192.168.1.2"      # System service machine (root access)
alias mongo="ssh jeffk@192.168.1.40"    # Application machine (user access)
```

## Access User Pattern

**Root Access** - Used for machines running system services:
- nginx (web server) 
- pve1/2/3 (Proxmox hosts)
- pihole (DNS server)
- www (web server)
- ldap (authentication)
- pbs1/2 (backup servers)

**User Access (jeffk)** - Used for application-level services:
- app (application server)
- mongo (database)
- plex (media server)
- downloads (download manager)
- services (user services)
- mssql (database)

## Converting to Hub Configuration

When adding machines to hub's agents-config.json, use this mapping:

1. **Extract from alias**: `alias nginx="ssh root@192.168.1.2"`
2. **Convert to config**:
```json
{
  "agent-name": "nginx",
  "ip": "192.168.1.2",
  "port": 3080,
  "accessUser": "root",
  "aliases": ["nginx", "additional", "names"]
}
```

## Complete Mapping Reference

From ~/.zsh/aliases.zsh:
```bash
alias nginx="ssh root@192.168.1.2"
alias pihole="ssh root@192.168.1.3"
alias pve1="ssh root@192.168.1.5"
alias pve2="ssh root@192.168.1.6"
alias pve3="ssh root@192.168.1.7"
alias unraid="ssh root@192.168.1.10"
alias nas="ssh root@192.168.1.10"      # Same as unraid
alias www="ssh root@192.168.1.20"
alias app="ssh jeffk@192.168.1.22"
alias downloads="ssh jeffk@192.168.1.24"
alias services="ssh jeffk@192.168.1.26"
alias pbs1="ssh root@192.168.1.30"     # This is the hub!
alias pbs2="ssh root@192.168.1.31"
alias ldap="ssh root@192.168.1.35"
alias mongo="ssh jeffk@192.168.1.40"
alias plex="ssh jeffk@192.168.1.50"
alias qnap="ssh jeffk@192.168.1.71"
alias mssql="ssh jeffk@192.168.1.80"
```

## Usage in Hub

The hub uses this information in two ways:

1. **HTTP API Communication** (primary):
   - Uses IP:3080 for agent communication
   - No authentication needed (agent handles that)

2. **SSH Operations** (deployment/emergency):
   - Uses accessUser@ip for SSH operations
   - Examples: deploying updates, emergency restarts
   - Requires SSH key to be present on hub

## SSH Key Setup

The hub at 192.168.1.30 has jeffk's SSH private key (~/.ssh/id_ed25519) which allows passwordless access to all machines where the public key is in authorized_keys.

## Why This Pattern Works

1. **Single Source of Truth**: aliases.zsh defines the infrastructure
2. **Visual Prompt Safety**: Root vs user login shows in shell prompt
3. **Consistent Naming**: Same names used everywhere (shell, hub, documentation)
4. **Clear Privilege Model**: System services get root, apps get user access
5. **Easy to Remember**: Machine names match their function

## Adding New Machines

### Quick Import from Alias

You can request: "Import into hub config, the nas alias"

This will:
1. Look up the alias in aliases.zsh: `alias nas="ssh root@192.168.1.10"`
2. Extract the components: name=nas, user=root, ip=192.168.1.10
3. Add to agents-config.json:
   ```json
   {
     "agent-name": "nas",
     "ip": "192.168.1.10",
     "port": 3080,
     "accessUser": "root",
     "aliases": ["nas", "unraid", "storage"]  // Note: nas and unraid share same IP
   }
   ```

### Manual Process

1. Add to ~/.zsh/aliases.zsh:
   ```bash
   alias newmachine="ssh root@192.168.1.100"
   ```

2. Add to hub's agents-config.json:
   ```json
   {
     "agent-name": "newmachine",
     "ip": "192.168.1.100",
     "port": 3080,
     "accessUser": "root",
     "aliases": ["newmachine", "any", "other", "names"]
   }
   ```

3. Ensure SSH key is deployed to new machine
4. Install agent on new machine

## Import Examples

- "Import mongo alias" → Adds mongo (jeffk@192.168.1.40)
- "Import www alias" → Adds www (root@192.168.1.20)
- "Import app and services aliases" → Adds both machines
- "Import all aliases that aren't already configured" → Bulk import