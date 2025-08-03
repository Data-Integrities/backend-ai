# Cloudflare DNS Management Capability

## Aliases/Triggers
- change my dns
- update dns record
- add to cloudflare
- create dns entry
- list dns records
- show all domains
- delete from cloudflare
- remove dns entry
- check dns propagation
- manage cloudflare dns

## Configuration
This capability requires the following environment variables:
- CLOUDFLARE_API_TOKEN=Cc0l0GPNBZT3A1aGk22ZxN9UZu4c-THnC2Syi5JE
- CLOUDFLARE_ZONE_ID=8b0b5b74a9476257a7db027d45f8cd7d
- CLOUDFLARE_ACCOUNT_ID=5427f34c6aaf8813981d4ffceb9d7cb8
- CLOUDFLARE_EMAIL=jeff@dataintegrities.com

## How to List DNS Records

To list all DNS records:
```bash
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
     -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
     -H "Content-Type: application/json" | jq '.result[] | {name: .name, type: .type, content: .content}'
```

## How to Add DNS Records

To add an A record (e.g., "add to cloudflare test.dataintegrities.com pointing to 192.168.1.100"):
```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
     -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
     -H "Content-Type: application/json" \
     --data '{
       "type": "A",
       "name": "test",
       "content": "192.168.1.100",
       "ttl": 120,
       "proxied": false
     }'
```

For internal IPs (192.168.x.x, 10.x.x.x), always set `"proxied": false`.
For external IPs, you can set `"proxied": true` to use Cloudflare's CDN.

## How to Update DNS Records

To update an existing record:
1. First find the record ID:
```bash
RECORD_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records?name=subdomain.dataintegrities.com" \
     -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
     | jq -r '.result[0].id')
```

2. Then update it:
```bash
curl -X PUT "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${RECORD_ID}" \
     -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
     -H "Content-Type: application/json" \
     --data '{
       "type": "A",
       "name": "subdomain",
       "content": "192.168.1.101",
       "ttl": 120,
       "proxied": false
     }'
```

## How to Delete DNS Records

To delete a record:
1. Find the record ID (same as update)
2. Delete it:
```bash
curl -X DELETE "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${RECORD_ID}" \
     -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
```

## Common Patterns

### Internal vs External Records
- Use `.i.` subdomain for internal IPs: `service.i.dataintegrities.com → 192.168.1.x`
- Use regular subdomain for external access: `service.dataintegrities.com → 99.38.0.207`

### Record Types
- **A**: IPv4 address (most common)
- **AAAA**: IPv6 address
- **CNAME**: Alias to another domain
- **TXT**: Text records (for verification, SPF, etc.)
- **MX**: Mail server records

## Examples

When user says: "add to cloudflare plex.dataintegrities.com pointing to 192.168.1.100"
Execute:
```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/8b0b5b74a9476257a7db027d45f8cd7d/dns_records" \
     -H "Authorization: Bearer Cc0l0GPNBZT3A1aGk22ZxN9UZu4c-THnC2Syi5JE" \
     -H "Content-Type: application/json" \
     --data '{
       "type": "A",
       "name": "plex",
       "content": "192.168.1.100",
       "ttl": 120,
       "proxied": false
     }'
```

When user says: "list dns records"
Execute the list command and format the output nicely for the user.