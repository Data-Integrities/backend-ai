# Cloudflare DNS Management Capability

This capability allows the nginx agent to manage DNS records through Cloudflare's API.

## Overview

The nginx agent can:
- List all DNS records for configured domains
- Add new DNS records (A, AAAA, CNAME, TXT, MX, etc.)
- Update existing DNS records
- Delete DNS records
- Check DNS propagation status

## Configuration

The following environment variables must be set on the nginx agent:

```bash
CLOUDFLARE_API_TOKEN="your-api-token"
CLOUDFLARE_ZONE_ID="your-zone-id"
CLOUDFLARE_ACCOUNT_ID="your-account-id"
CLOUDFLARE_EMAIL="your-email"
```

## Supported Commands

### List DNS Records
```
list dns records [for domain]
show all dns entries
```

### Add DNS Record
```
add dns A record subdomain pointing to 192.168.1.100
create dns CNAME record www pointing to domain.com
add dns TXT record _acme-challenge with value "verification-string"
```

### Update DNS Record
```
update dns record subdomain to 192.168.1.101
change dns A record app to 192.168.1.50
```

### Delete DNS Record
```
delete dns record old-subdomain
remove dns entry test
```

### Check DNS Propagation
```
check dns propagation for subdomain.domain.com
verify dns record subdomain
```

## Examples

1. **Add a new subdomain for a service:**
   ```
   add dns A record plex pointing to 192.168.1.100
   add dns A record plex.i pointing to 192.168.1.100
   ```

2. **Update an existing service IP:**
   ```
   update dns record docker to 192.168.1.85
   ```

3. **Create internal and external records:**
   ```
   add dns A record service pointing to 99.38.0.207
   add dns A record service.i pointing to 192.168.1.50
   ```

## Technical Details

- Uses Cloudflare API v4
- Supports all standard DNS record types
- Automatic TTL management (default: 1 for proxied, 120 for DNS-only)
- Respects Cloudflare rate limits (1200 requests per 5 minutes)
- Provides detailed error messages for troubleshooting

## Security

- API tokens are stored as environment variables
- Tokens should have minimal required permissions (DNS:Edit, Zone:Read)
- All API calls are logged for audit purposes
- IP filtering can be configured in Cloudflare for additional security