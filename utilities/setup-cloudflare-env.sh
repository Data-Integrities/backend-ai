#!/bin/bash
# Cloudflare API Setup Script

echo "Setting up Cloudflare environment variables..."

# Add to .zshrc if not already present
if ! grep -q "CLOUDFLARE_API_TOKEN" ~/.zshrc; then
    echo "" >> ~/.zshrc
    echo "# Cloudflare API Configuration" >> ~/.zshrc
    echo 'export CLOUDFLARE_API_TOKEN="YOUR_TOKEN_HERE"' >> ~/.zshrc
    echo 'export CLOUDFLARE_ZONE_ID="YOUR_ZONE_ID_HERE"' >> ~/.zshrc
    echo "Added Cloudflare variables to ~/.zshrc"
else
    echo "Cloudflare variables already exist in ~/.zshrc"
fi

echo ""
echo "IMPORTANT: Edit ~/.zshrc and replace:"
echo "  YOUR_TOKEN_HERE with your actual API token"
echo "  YOUR_ZONE_ID_HERE with your zone ID from Cloudflare dashboard"
echo ""
echo "Then run: source ~/.zshrc"
echo ""
echo "To find your Zone ID:"
echo "1. Go to https://dash.cloudflare.com/"
echo "2. Select your domain (dataintegrities.com)"
echo "3. Find 'Zone ID' in the right sidebar under API section"