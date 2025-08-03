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

## Supported Commands

### List Forwarders
```
list nginx forwarders
show all nginx sites
what domains are configured in nginx
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

## Examples

1. **List all forwarders with their mappings:**
   ```bash
   grep -E "server_name|proxy_pass|listen" /etc/nginx/sites-enabled/* | grep -v "^#"
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

## Security Considerations

- Always use HTTPS for public-facing services
- Implement proper access controls for internal services
- Keep certificates up to date (< 90 days)
- Use strong SSL/TLS configurations
- Monitor certificate expiration dates