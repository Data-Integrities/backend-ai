# Provider Search Infrastructure Discovery

## GitHub Actions Runners Identified

Based on workflow files analysis, the following runners are used:
- `proxmox-dataintegrities-www` - For building www site
- `proxmox-provider-search-app` - For Flutter app builds  
- `proxmox-provider-search-mongo` - For MongoDB/WebAPI builds
- `proxmox-provider-search-ubuntu` - For Linux x64 builds
- `proxmox-provider-search-windows` - For Windows builds
- `proxmox-webdownload` - For download service builds

## VM/Container Mapping Progress

### pve1 - Main Services
- **103 mongodb** - Database for patient/provider data
- **105 di-services** - Backend WebAPI (services.dataintegrities.com)
- **107 di-downloads** - File/report download service
- **109 di-app** - Main application server
- **111 di-web** - Web frontend
- **118 nginx** - Reverse proxy/load balancer

### pve2 - Possible Runners
- **101 ubuntu-vm** - Running VM, likely a GitHub runner
- **102 win11pro-vm** - Running VM, possibly Windows runner
- Containers 100, 210, 211 are Ubuntu-based but no runners found yet

### pve3 - Database Services
- **113 mds-collector** - Data collection service
- **114 mssql** - SQL Server database

## Discovery Methods Used
1. Checked workflow files for runner names
2. Searched containers for actions-runner directories
3. Looked for runner services in systemd
4. Checked running processes for runner executables

## Next Steps
- Check VMs 101 and 102 on pve2 for GitHub runners
- Verify which containers/VMs match the runner names from workflows
- Document the complete infrastructure mapping