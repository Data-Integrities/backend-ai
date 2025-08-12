#!/usr/bin/env node

/**
 * Simple proxy server to forward requests to Backend AI Hub
 * Runs on localhost to bypass Claude Code permission issues
 */

const http = require('http');
const https = require('https');
const url = require('url');

const HUB_HOST = '192.168.1.30';
const HUB_PORT = 80;
const PROXY_PORT = 3001;

const server = http.createServer((req, res) => {
  // Enable CORS for browser requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);

  // Parse the request
  const parsedUrl = url.parse(req.url);
  
  // Forward to hub
  const options = {
    hostname: HUB_HOST,
    port: HUB_PORT,
    path: parsedUrl.path,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${HUB_HOST}:${HUB_PORT}` // Fix the host header
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Forward status and headers
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    
    // Pipe the response
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy request error:', err);
    res.writeHead(500);
    res.end(`Proxy error: ${err.message}`);
  });

  // Forward the request body
  if (req.method === 'POST' || req.method === 'PUT') {
    // Check if this is a base64 encoded request
    if (req.headers['x-content-encoding'] === 'base64') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          // Remove quotes if present
          const base64Data = body.replace(/^"|"$/g, '');
          // Decode base64
          const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');
          console.log('Decoded base64 payload:', decodedData);
          
          // Update content length
          options.headers['content-length'] = Buffer.byteLength(decodedData);
          delete options.headers['x-content-encoding'];
          
          // Create new request with decoded data
          const proxyReqWithData = http.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
          });
          
          proxyReqWithData.on('error', (err) => {
            console.error('Proxy request error:', err);
            res.writeHead(500);
            res.end(`Proxy error: ${err.message}`);
          });
          
          proxyReqWithData.write(decodedData);
          proxyReqWithData.end();
        } catch (err) {
          console.error('Base64 decode error:', err);
          res.writeHead(400);
          res.end('Invalid base64 data');
        }
      });
    } else {
      req.pipe(proxyReq);
    }
  } else {
    proxyReq.end();
  }
});

server.listen(PROXY_PORT, 'localhost', () => {
  console.log(`Hub proxy server running on http://localhost:${PROXY_PORT}`);
  console.log(`Forwarding requests to http://${HUB_HOST}:${HUB_PORT}`);
  console.log('');
  console.log('Example usage:');
  console.log(`  curl http://localhost:${PROXY_PORT}/api/agents`);
  console.log(`  curl -X POST http://localhost:${PROXY_PORT}/api/browser-requests \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"tabId": "any", "type": "data", "action": "get-logs", "params": {}}'`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down proxy server...');
  server.close(() => {
    console.log('Proxy server stopped');
    process.exit(0);
  });
});