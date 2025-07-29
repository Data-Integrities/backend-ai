# Cloudflare Integration for Claude

This document explains how to enable Claude to manage Cloudflare DNS records and other Cloudflare services.

## Prerequisites

1. Cloudflare account with API access
2. Domain(s) managed through Cloudflare
3. API Token with appropriate permissions

## Setting Up Cloudflare API Access

### 1. Create an API Token

1. Log into Cloudflare Dashboard
2. Go to **My Profile** → **API Tokens**
3. Click **Create Token**
4. Use "Edit zone DNS" template or create custom token with these permissions:
   - **Zone → DNS → Edit**
   - **Zone → Zone → Read**
   - **Zone → Zone Settings → Read** (optional, for advanced features)
5. Set **Zone Resources** to:
   - Include → Specific zone → dataintegrities.com (and any other domains)
6. Set **IP Address Filtering** (optional but recommended):
   - Include your home IP address
7. Create token and save it securely

### 2. Get Zone ID

1. Go to your domain's Overview page in Cloudflare
2. Find **Zone ID** in the right sidebar under API section
3. Copy this ID for use in API calls

## API Configuration for Claude

### Option 1: Environment Variables (Recommended)

Add to `~/.zshrc` or `~/.bashrc`:
```bash
export CLOUDFLARE_API_TOKEN="your-api-token-here"
export CLOUDFLARE_ZONE_ID="your-zone-id-here"
export CLOUDFLARE_EMAIL="jeff@dataintegrities.com"  # Optional for some endpoints
```

### Option 2: Configuration File

Create `~/.claude/cloudflare-config.json`:
```json
{
  "api_token": "your-api-token-here",
  "zones": {
    "dataintegrities.com": "zone-id-here",
    "personal-domain.com": "zone-id-here"
  },
  "email": "jeff@dataintegrities.com"
}
```

## Common Cloudflare Operations

### List DNS Records
```bash
curl -X GET "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
     -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
     -H "Content-Type: application/json" | jq '.'
```

### Create DNS Record
```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
     -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
     -H "Content-Type: application/json" \
     --data '{
       "type": "A",
       "name": "subdomain",
       "content": "192.168.1.100",
       "ttl": 1,
       "proxied": false
     }'
```

### Update DNS Record
```bash
# First get the record ID
RECORD_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records?name=subdomain.dataintegrities.com" \
     -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
     | jq -r '.result[0].id')

# Then update it
curl -X PUT "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${RECORD_ID}" \
     -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
     -H "Content-Type: application/json" \
     --data '{
       "type": "A",
       "name": "subdomain",
       "content": "192.168.1.101",
       "ttl": 1,
       "proxied": false
     }'
```

### Delete DNS Record
```bash
curl -X DELETE "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${RECORD_ID}" \
     -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
```

## Security Best Practices

1. **Never commit API tokens** to git repositories
2. **Use environment variables** instead of hardcoding tokens
3. **Restrict token permissions** to minimum required
4. **Set IP restrictions** on tokens when possible
5. **Rotate tokens regularly**
6. **Monitor API usage** in Cloudflare dashboard

## Testing the Connection

Once configured, test with:
```bash
# This should list your DNS records
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
     -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
     | jq '.result[] | {name: .name, type: .type, content: .content}'
```

## Troubleshooting

### Common Errors

1. **Authentication error (10000)**
   - Check API token is correct
   - Verify token has required permissions

2. **Not found (7003)**
   - Verify Zone ID is correct
   - Check token has access to the zone

3. **Rate limited (10009)**
   - Cloudflare limits: 1200 requests per 5 minutes
   - Implement rate limiting in scripts

## Usage with Claude

Once configured, you can ask Claude to:
- List all DNS records
- Add new subdomains
- Update existing records
- Remove DNS entries
- Check DNS propagation
- Manage page rules
- Configure SSL settings

Example requests:
- "Add a new A record for test.dataintegrities.com pointing to 192.168.1.50"
- "List all DNS records for dataintegrities.com"
- "Update the IP for app.dataintegrities.com to 192.168.1.25"
- "Remove the DNS record for old.dataintegrities.com"

## Additional Resources

- [Cloudflare API Documentation](https://developers.cloudflare.com/api/)
- [DNS Record Types](https://developers.cloudflare.com/dns/manage-dns-records/reference/dns-record-types/)
- [API Token Permissions](https://developers.cloudflare.com/api/tokens/create/permissions/)