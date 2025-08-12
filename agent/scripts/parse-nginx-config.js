#!/usr/bin/env node

/**
 * Parse nginx site configuration files and return JSON
 * Usage: node parse-nginx-config.js <nginx-config-file>
 */

const fs = require('fs');
const path = require('path');

function parseNginxConfig(configPath) {
    try {
        const content = fs.readFileSync(configPath, 'utf8');
        const siteName = path.basename(configPath);
        
        const result = {
            siteName: siteName,
            domains: [],
            listens: [],
            forwardsTo: {
                ip: null,
                port: null
            },
            allow: [],
            private: false,
            enabled: false
        };
        
        // Extract server_name (domains)
        const serverNameMatch = content.match(/server_name\s+([^;]+);/);
        if (serverNameMatch) {
            result.domains = serverNameMatch[1].trim().split(/\s+/);
        }
        
        // Extract listen ports
        const listenMatches = content.matchAll(/listen\s+(\d+)/g);
        for (const match of listenMatches) {
            const port = parseInt(match[1]);
            if (!result.listens.includes(port)) {
                result.listens.push(port);
            }
        }
        
        // Extract forward target (set $server and set $port)
        const serverMatch = content.match(/set\s+\$server\s+"([^"]+)"/);
        const portMatch = content.match(/set\s+\$port\s+(\d+)/);
        
        if (serverMatch && portMatch) {
            result.forwardsTo.ip = serverMatch[1];
            result.forwardsTo.port = portMatch[1];
        } else {
            // Try to extract from proxy_pass
            const proxyPassMatch = content.match(/proxy_pass\s+https?:\/\/([^;\s]+)/);
            if (proxyPassMatch) {
                const proxyTarget = proxyPassMatch[1];
                
                // Check if it's an upstream reference (just a name, not IP:port)
                if (!/[:\.]/.test(proxyTarget)) {
                    // Look for upstream definition
                    const upstreamRegex = new RegExp(`upstream\\s+${proxyTarget}\\s*{[^}]*server\\s+([^:;\\s]+)(?::(\\d+))?`, 's');
                    const upstreamMatch = content.match(upstreamRegex);
                    if (upstreamMatch) {
                        result.forwardsTo.ip = upstreamMatch[1];
                        result.forwardsTo.port = upstreamMatch[2] || '80';
                    } else {
                        // Upstream not found, use the proxy target as-is
                        result.forwardsTo.ip = proxyTarget;
                        result.forwardsTo.port = '80';
                    }
                } else {
                    // Direct IP or hostname with optional port
                    const [ip, port] = proxyTarget.split(':');
                    result.forwardsTo.ip = ip;
                    result.forwardsTo.port = port || '80';
                }
            }
        }
        
        // Extract allow directives
        const allowMatches = content.matchAll(/allow\s+([^;]+);/g);
        for (const match of allowMatches) {
            result.allow.push(match[1].trim());
        }
        
        // Check if private (has allow 192.168.1.0/24 and deny all)
        if (content.includes('allow 192.168.1.0/24') && content.includes('deny all')) {
            result.private = true;
        }
        
        // Check if enabled (file exists in sites-enabled)
        const enabledPath = `/etc/nginx/sites-enabled/${siteName}`;
        try {
            fs.accessSync(enabledPath);
            result.enabled = true;
        } catch {
            result.enabled = false;
        }
        
        return result;
        
    } catch (error) {
        return {
            error: error.message,
            siteName: path.basename(configPath)
        };
    }
}

// Main execution
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('Usage: parse-nginx-config.js <nginx-config-file>');
        process.exit(1);
    }
    
    const configPath = args[0];
    const result = parseNginxConfig(configPath);
    
    console.log(JSON.stringify(result, null, 2));
}

module.exports = { parseNginxConfig };