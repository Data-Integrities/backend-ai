# Hub SSH Setup Guide

The hub's manager control feature requires SSH access to agent hosts. Since the hub runs in a container, it needs SSH keys configured.

## Current Issue

When trying to control managers through the hub GUI, you may see SSH authentication errors:
```
Permission denied, please try again.
Too many authentication failures
```

## Solution Options

### Option 1: Add SSH Keys to Hub Container (Recommended)

1. Generate SSH key pair on the hub container:
```bash
ssh root@192.168.1.30
docker exec -it ai-hub bash
ssh-keygen -t ed25519 -f /root/.ssh/id_ed25519 -N ""
```

2. Copy the public key to each agent host:
```bash
# From hub container
cat /root/.ssh/id_ed25519.pub

# Add to each agent's authorized_keys
ssh root@192.168.1.2 "echo 'PUBLIC_KEY_HERE' >> ~/.ssh/authorized_keys"
ssh root@192.168.1.5 "echo 'PUBLIC_KEY_HERE' >> ~/.ssh/authorized_keys"
ssh root@192.168.1.6 "echo 'PUBLIC_KEY_HERE' >> ~/.ssh/authorized_keys"
ssh root@192.168.1.7 "echo 'PUBLIC_KEY_HERE' >> ~/.ssh/authorized_keys"
ssh root@192.168.1.10 "echo 'PUBLIC_KEY_HERE' >> ~/.ssh/authorized_keys"
```

### Option 2: Use Host's SSH Keys

Mount the host's SSH directory into the container by updating the Docker run command:
```bash
docker run -d \
  --name ai-hub \
  -p 80:80 \
  -v /root/.ssh:/root/.ssh:ro \
  backend-ai-hub:latest
```

### Option 3: Use SSH Agent Forwarding

If you have SSH agent running on the host, you can forward it to the container:
```bash
docker run -d \
  --name ai-hub \
  -p 80:80 \
  -v $SSH_AUTH_SOCK:/ssh-agent \
  -e SSH_AUTH_SOCK=/ssh-agent \
  backend-ai-hub:latest
```

## Temporary Workaround

Until SSH is configured, you can still control managers manually:

### Stop Manager
```bash
# For systemd systems (nginx, pve1-3)
ssh root@AGENT_IP "systemctl stop ai-agent-manager"

# For Unraid
ssh root@192.168.1.10 "/etc/rc.d/rc.ai-agent-manager stop"
```

### Start Manager
```bash
# For systemd systems
ssh root@AGENT_IP "systemctl start ai-agent-manager"

# For Unraid
ssh root@192.168.1.10 "/etc/rc.d/rc.ai-agent-manager start"
```

### Restart Manager
```bash
# For systemd systems
ssh root@AGENT_IP "systemctl restart ai-agent-manager"

# For Unraid
ssh root@192.168.1.10 "/etc/rc.d/rc.ai-agent-manager restart"
```

## Testing Manager Control

Once SSH is configured, test the hub's manager control:
```bash
# Test through API
curl -X POST http://192.168.1.30/api/managers/unraid/stop
curl -X POST http://192.168.1.30/api/managers/unraid/start

# Or use the GUI - right-click on an agent and select manager operations
```