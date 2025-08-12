# Nginx Forwarders Management Capability

This capability allows the nginx agent to manage forwarding configurations and SSL certificates.

## Overview

The nginx agent can:
- List all configured forwarders in /etc/nginx/sites-available and sites-enabled
- Show which forwarders work from public IPs vs internal 192.168.x.x range  
- Manage SSL certificates using Let's Encrypt (certbot)
- Renew expiring SSL certificates
- Reload nginx configuration after changes
- Map domains to internal services

## Configuration

The nginx configuration files are located in:
- `/etc/nginx/sites-available/` - Available site configurations
- `/etc/nginx/sites-enabled/` - Enabled site configurations (symlinks)
- `/etc/letsencrypt/` - SSL certificates managed by certbot

## Understanding Nginx Forwarders

When users ask about "forwarders" or "nginx sites", they want to see all the reverse proxy configurations. These configurations tell nginx how to route incoming requests to backend services.

### Key Concepts:
- **sites-available**: Directory containing all site configuration files (both active and inactive)
- **sites-enabled**: Directory containing symlinks to active configurations
- **server_name**: The domain name in the nginx config (what users access)
- **proxy_pass**: Where nginx forwards the requests to (usually an internal IP:port)
- **Access control**: Some sites restrict access to internal network only using "allow 192.168.1.0/24; deny all;"

### List Forwarders

When asked to "list forwarders", "show nginx sites", or "what forwarders do I have", you need to:

**IMPORTANT**: Execute the JSON parser script to get properly formatted data. The script returns JSON that can be formatted using the general-purpose format-json utility.

Execute this command to get a formatted table:
```bash
# For command-line interface (when you're executing commands directly)
/opt/ai-agent/scripts/list-nginx-forwarders.sh | /opt/ai-agent/utilities/format-json.js - -format text

# For backend-ai chat interface (when responding to web browser requests)
/opt/ai-agent/scripts/list-nginx-forwarders.sh | /opt/ai-agent/utilities/format-json.js - -format md
```

**IMPORTANT**: When responding to requests from the backend-ai chat interface (web browser), always use `-format md` to return markdown tables that will be properly rendered in the browser.

This will produce a clean table showing:
- **siteName**: The configuration file name
- **domains**: The domain names from server_name directive
- **listens**: Ports the site listens on (usually 80, 443)
- **forwardsTo**: The backend server IP:port
- **allow**: IP ranges allowed (for private sites)
- **private**: ✓ if restricted to internal network, ✗ if public
- **enabled**: ✓ if site is active, ✗ if disabled

For the backend-ai chat interface which renders markdown, use:
```bash
/opt/ai-agent/scripts/list-nginx-forwarders.sh | /opt/ai-agent/utilities/format-json.js - -format md
```

For raw JSON output:
```bash
/opt/ai-agent/scripts/list-nginx-forwarders.sh
```

### Check SSL Certificates
```
check ssl certificates
list ssl cert expiration dates
which certificates are expiring soon
```

### Renew SSL Certificates
```
renew ssl certificate for dataintegrities.com
renew all expiring certificates
renew certificate for [domain]
```

### Reload Configuration
```
reload nginx
test nginx configuration
restart nginx service
```

## Implementation Examples

1. **List all forwarders with the JSON parser:**
   
   The JSON parser script at `/opt/ai-agent/scripts/list-nginx-forwarders.sh` returns structured data that can be formatted in different ways:
   
   **Always use markdown format when responding to backend-ai chat requests:**
   ```bash
   /opt/ai-agent/scripts/list-nginx-forwarders.sh | /opt/ai-agent/utilities/format-json.js - -format md
   ```
   
   This produces a properly formatted markdown table with:
   - Abbreviated column headers (prv, ena)
   - Visual indicators (✓ and ✗)
   - Clean formatting for web browser rendering
   
   **For a simplified view with just key columns:**
   ```bash
   json=$(/opt/ai-agent/scripts/list-nginx-forwarders.sh)
   echo "$json" | python3 -c "
   import json, sys
   data = json.load(sys.stdin)
   print('%-40s %-20s %-3s %-3s' % ('Domain', 'Target', 'Prv', 'Ena'))
   print('%-40s %-20s %-3s %-3s' % ('-'*40, '-'*20, '-'*3, '-'*3))
   for site in data['sites']:
       domain = site['domains'][0] if site['domains'] else site['siteName']
       target = f\"{site['forwardsTo']['ip']}:{site['forwardsTo']['port']}\" if site['forwardsTo']['ip'] else 'N/A'
       prv = '✓' if site['private'] else '✗'
       ena = '✓' if site['enabled'] else '✗'
       print('%-40s %-20s %-3s %-3s' % (domain, target, prv, ena))
   "
   ```

2. **Check certificate expiration:**
   ```bash
   certbot certificates
   ```

3. **Renew a specific certificate:**
   ```bash
   certbot renew --cert-name dataintegrities.com
   nginx -s reload
   ```

4. **Test configuration before reload:**
   ```bash
   nginx -t
   ```

## Technical Details

### Forwarder Types

1. **Public Access Forwarders** (listen on 443/80):
   - Accessible from anywhere on the internet
   - Usually have SSL certificates from Let's Encrypt
   - Example: `dataintegrities.com → 192.168.1.48:80`

2. **Internal Only Forwarders** (ACL restricted):
   - Only accessible from 192.168.x.x range
   - May use self-signed certificates
   - Example: `internal.domain.com → 192.168.1.100:8080`

### SSL Certificate Management

- Certificates are managed by certbot (Let's Encrypt)
- Auto-renewal is configured via cron/systemd timer
- Manual renewal: `certbot renew`
- Force renewal: `certbot renew --force-renewal`

### Common Issues and Solutions

1. **Certificate Expired**:
   ```bash
   # Check what's expired
   certbot certificates
   
   # Renew specific cert
   certbot renew --cert-name dataintegrities.com
   
   # Reload nginx
   nginx -s reload
   ```

2. **Forwarder Not Working**:
   ```bash
   # Test configuration
   nginx -t
   
   # Check error logs
   tail -f /var/log/nginx/error.log
   
   # Verify upstream is reachable
   curl -I http://192.168.1.48:80
   ```

## Utilities

### format-json utility

The `format-json` utility is available at `/opt/ai-agent/utilities/format-json.js` for formatting JSON data:

- **Text format** (default): Creates aligned columns for command-line display
- **Markdown format**: Creates markdown tables for rich display interfaces
- **JSON format**: Pretty-prints the raw JSON

Usage:
```bash
# From file
/opt/ai-agent/utilities/format-json.js file.json -format text

# From stdin
command | /opt/ai-agent/utilities/format-json.js - -format md

# Formats supported: text (default), md/markdown, json
```

## Security Considerations

- Always use HTTPS for public-facing services
- Implement proper access controls for internal services
- Keep certificates up to date (< 90 days)
- Use strong SSL/TLS configurations
- Monitor certificate expiration dates