#!/bin/bash

# Deploy hub with correlationID support
echo "📦 Building hub with correlationID support..."
cd /Users/jeffk/Developement/provider-search/backend-ai/hub
npm run build

# Create tarball with GUI
echo "📦 Creating hub deployment package..."
tar -czf ../hub-correlation.tar.gz \
  dist/ \
  gui/ \
  package.json \
  package-lock.json \
  .env \
  agents-config.json

# Deploy to hub container
echo "🚀 Deploying to hub container..."
scp ../hub-correlation.tar.gz root@192.168.1.30:/tmp/

ssh root@192.168.1.30 << 'EOF'
cd /opt/backend-ai/hub
echo "📦 Extracting update..."
tar -xzf /tmp/hub-correlation.tar.gz
rm /tmp/hub-correlation.tar.gz

echo "♻️ Restarting hub service..."
systemctl restart ai-hub

echo "✅ Hub deployment complete!"
systemctl status ai-hub --no-pager
EOF

echo "✅ Hub v27 with correlationID support deployed!"