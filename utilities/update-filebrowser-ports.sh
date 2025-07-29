#!/bin/bash

# Update all FileBrowser installations to port 8888

echo "=== Updating FileBrowser to port 8888 on all machines ==="
echo ""

# List of machines with FileBrowser
MACHINES=(
    "192.168.1.2:nginx"
    "192.168.1.5:pve1"
    "192.168.1.6:pve2"
    "192.168.1.7:pve3"
    "192.168.1.20:www"
    "192.168.1.22:app"
    "192.168.1.24:downloads"
    "192.168.1.26:services"
    "192.168.1.30:pbs1/hub"
    "192.168.1.80:mssql"
)

for machine in "${MACHINES[@]}"; do
    IPS="${machine%:*}"
    NAME="${machine#*:}"
    
    echo "Updating $NAME ($IPS)..."
    
    # Stop FileBrowser
    ssh root@$IPS "pkill filebrowser 2>/dev/null || true"
    
    # Update systemd service if it exists
    ssh root@$IPS "if [ -f /etc/systemd/system/filebrowser.service ]; then sed -i 's/-p 8080/-p 8888/g' /etc/systemd/system/filebrowser.service && sed -i 's/-p 18080/-p 8888/g' /etc/systemd/system/filebrowser.service && systemctl daemon-reload; fi"
    
    # Start FileBrowser on new port
    ssh root@$IPS "nohup /usr/local/bin/filebrowser -r / -d /usr/local/community-scripts/filebrowser.db -p 8888 > /var/log/filebrowser.log 2>&1 &"
    
    # Verify it's running
    sleep 2
    if ssh root@$IPS "netstat -tlnp | grep 8888 | grep -q filebrowser"; then
        echo "✓ $NAME updated successfully"
    else
        echo "✗ $NAME failed to start on port 8888"
    fi
    echo ""
done

echo "=== FileBrowser Port Update Complete ==="
echo "Don't forget to update nginx configurations next!"