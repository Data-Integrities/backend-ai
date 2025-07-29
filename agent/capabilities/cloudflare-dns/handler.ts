import axios from 'axios';

interface CloudflareConfig {
    apiToken: string;
    zoneId: string;
    accountId?: string;
    email?: string;
}

interface DNSRecord {
    id?: string;
    type: string;
    name: string;
    content: string;
    ttl?: number;
    proxied?: boolean;
    priority?: number;
}

export class CloudflareDNSHandler {
    private config: CloudflareConfig;
    private apiBase = 'https://api.cloudflare.com/client/v4';

    constructor() {
        this.config = {
            apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
            zoneId: process.env.CLOUDFLARE_ZONE_ID || '',
            accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
            email: process.env.CLOUDFLARE_EMAIL
        };

        if (!this.config.apiToken || !this.config.zoneId) {
            throw new Error('Cloudflare DNS capability requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID environment variables');
        }
    }

    private async makeRequest(method: string, endpoint: string, data?: any) {
        try {
            const response = await axios({
                method,
                url: `${this.apiBase}${endpoint}`,
                headers: {
                    'Authorization': `Bearer ${this.config.apiToken}`,
                    'Content-Type': 'application/json'
                },
                data
            });

            if (!response.data.success) {
                throw new Error(`Cloudflare API error: ${JSON.stringify(response.data.errors)}`);
            }

            return response.data;
        } catch (error: any) {
            if (error.response?.data?.errors) {
                throw new Error(`Cloudflare API error: ${JSON.stringify(error.response.data.errors)}`);
            }
            throw error;
        }
    }

    async listRecords(filter?: { name?: string; type?: string }): Promise<DNSRecord[]> {
        let endpoint = `/zones/${this.config.zoneId}/dns_records`;
        const params = new URLSearchParams();
        
        if (filter?.name) params.append('name', filter.name);
        if (filter?.type) params.append('type', filter.type);
        
        if (params.toString()) {
            endpoint += `?${params.toString()}`;
        }

        const response = await this.makeRequest('GET', endpoint);
        return response.result;
    }

    async createRecord(record: DNSRecord): Promise<DNSRecord> {
        // Set default TTL based on proxied status
        if (!record.ttl) {
            record.ttl = record.proxied ? 1 : 120;
        }

        const response = await this.makeRequest('POST', `/zones/${this.config.zoneId}/dns_records`, record);
        return response.result;
    }

    async updateRecord(recordId: string, updates: Partial<DNSRecord>): Promise<DNSRecord> {
        const response = await this.makeRequest('PUT', `/zones/${this.config.zoneId}/dns_records/${recordId}`, updates);
        return response.result;
    }

    async deleteRecord(recordId: string): Promise<void> {
        await this.makeRequest('DELETE', `/zones/${this.config.zoneId}/dns_records/${recordId}`);
    }

    async findRecordByName(name: string): Promise<DNSRecord | null> {
        const records = await this.listRecords({ name });
        return records.length > 0 ? records[0] : null;
    }

    async updateRecordByName(name: string, updates: Partial<DNSRecord>): Promise<DNSRecord> {
        const record = await this.findRecordByName(name);
        if (!record || !record.id) {
            throw new Error(`DNS record not found: ${name}`);
        }
        
        // Merge existing record with updates
        const fullUpdate = { ...record, ...updates };
        return await this.updateRecord(record.id, fullUpdate);
    }

    async deleteRecordByName(name: string): Promise<void> {
        const record = await this.findRecordByName(name);
        if (!record || !record.id) {
            throw new Error(`DNS record not found: ${name}`);
        }
        
        await this.deleteRecord(record.id);
    }
}

// Command parser for natural language DNS commands
export function parseDNSCommand(command: string): any {
    const lowerCommand = command.toLowerCase();
    
    // List records
    if (lowerCommand.includes('list dns') || lowerCommand.includes('show') && lowerCommand.includes('dns')) {
        return { action: 'list' };
    }
    
    // Add record
    const addMatch = lowerCommand.match(/(?:add|create)\s+dns\s+(\w+)\s+record\s+(\S+)\s+(?:pointing to|to|with value)\s+(.+)/);
    if (addMatch) {
        const [, type, name, content] = addMatch;
        return {
            action: 'add',
            type: type.toUpperCase(),
            name: name.trim(),
            content: content.trim(),
            proxied: false // Default to DNS-only for internal IPs
        };
    }
    
    // Update record
    const updateMatch = lowerCommand.match(/(?:update|change)\s+dns\s+(?:record\s+)?(\S+)\s+to\s+(.+)/);
    if (updateMatch) {
        const [, name, content] = updateMatch;
        return {
            action: 'update',
            name: name.trim(),
            content: content.trim()
        };
    }
    
    // Delete record
    const deleteMatch = lowerCommand.match(/(?:delete|remove)\s+dns\s+(?:record|entry)\s+(\S+)/);
    if (deleteMatch) {
        const [, name] = deleteMatch;
        return {
            action: 'delete',
            name: name.trim()
        };
    }
    
    return null;
}

// Main handler for DNS commands
export async function handleDNSCommand(command: string): Promise<any> {
    const handler = new CloudflareDNSHandler();
    const parsed = parseDNSCommand(command);
    
    if (!parsed) {
        throw new Error('Could not parse DNS command. Try: "list dns records", "add dns A record subdomain to 192.168.1.100", etc.');
    }
    
    switch (parsed.action) {
        case 'list':
            const records = await handler.listRecords();
            return {
                success: true,
                message: `Found ${records.length} DNS records`,
                records: records.map(r => ({
                    name: r.name,
                    type: r.type,
                    content: r.content,
                    proxied: r.proxied
                }))
            };
            
        case 'add':
            // Auto-detect if this should be proxied based on IP
            if (parsed.content.match(/^(?:192\.168\.|10\.|172\.(?:1[6-9]|2[0-9]|3[0-1])\.)/)) {
                parsed.proxied = false; // Internal IPs can't be proxied
            }
            
            const newRecord = await handler.createRecord({
                type: parsed.type,
                name: parsed.name,
                content: parsed.content,
                proxied: parsed.proxied
            });
            
            return {
                success: true,
                message: `Created ${parsed.type} record for ${newRecord.name}`,
                record: newRecord
            };
            
        case 'update':
            const updated = await handler.updateRecordByName(parsed.name, {
                content: parsed.content
            });
            
            return {
                success: true,
                message: `Updated ${parsed.name} to ${parsed.content}`,
                record: updated
            };
            
        case 'delete':
            await handler.deleteRecordByName(parsed.name);
            
            return {
                success: true,
                message: `Deleted DNS record: ${parsed.name}`
            };
            
        default:
            throw new Error(`Unknown DNS action: ${parsed.action}`);
    }
}