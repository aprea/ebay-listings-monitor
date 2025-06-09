# Raspberry Pi 5 Deployment Guide

## Prerequisites

### Hardware

- Raspberry Pi 5 (4GB RAM)
- MicroSD card (32GB or larger recommended)
- Stable power supply (5V/5A USB-C for Pi 5)
- Ethernet connection recommended (Wi-Fi also works)

### Software Requirements

- Raspberry Pi OS 64-bit (required for Bun)
- PostgreSQL database (local or remote)

### Database Name
This deployment uses `ebay_listings_monitor` as the database name throughout all configurations.

## Initial Setup

### 1. Install Raspberry Pi OS 64-bit

Download and flash Raspberry Pi OS 64-bit using Raspberry Pi Imager:

```bash
# Enable SSH during setup for headless operation
# Configure Wi-Fi if not using Ethernet
```

### 2. System Updates

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install build-essential -y
```

### 3. Install Homebrew

```bash
# Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Add Homebrew to PATH
echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> ~/.bashrc
eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"

# Verify installation
brew --version
```

### 4. Install Bun via Homebrew

```bash
# Install Bun
brew install oven-sh/bun/bun

# Verify installation
bun --version
```

## PostgreSQL Setup

### Option A: Local PostgreSQL via Homebrew (Recommended)

```bash
# Install PostgreSQL
brew install postgresql@16

# Start PostgreSQL service
brew services start postgresql@16

# Wait for PostgreSQL to start
sleep 5

# Create database and user
createdb ebay_listings_monitor
psql postgres << EOF
CREATE USER ebaymonitor WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE ebay_listings_monitor TO ebaymonitor;
ALTER DATABASE ebay_listings_monitor OWNER TO ebaymonitor;
EOF
```

### Option B: Remote PostgreSQL

If using a remote database, ensure your Pi's IP is whitelisted and you have the connection string.

## Application Setup

### 1. Install Git and Clone Repository

```bash
# Install git via Homebrew
brew install git

# Clone repository
cd ~
git clone https://github.com/your-username/ebay-listings-monitor.git
cd ebay-listings-monitor
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Environment Configuration

Create `.env` file:

```bash
nano .env
```

Add your credentials:

```env
# eBay API Credentials
EBAY_PRODUCTION_CLIENT_ID=your_ebay_client_id
EBAY_PRODUCTION_CLIENT_SECRET=your_ebay_client_secret

# Database (local example)
DATABASE_URL=postgresql://ebaymonitor:your_secure_password@localhost:5432/ebay_listings_monitor

# Discord Bot Token
DISCORD_BOT_SECRET=your_discord_bot_token
```

### 4. Database Setup

```bash
# Run migrations
bunx drizzle-kit push

# Seed database with current listings (no notifications)
bun run index.ts --seed
```

## Systemd Service Setup

### 1. Create Service File

```bash
sudo nano /etc/systemd/system/ebay-monitor.service
```

Add the following content:

```ini
[Unit]
Description=eBay Listings Monitor
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/home/pi/ebay-listings-monitor
Environment="PATH=/home/linuxbrew/.linuxbrew/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=/home/linuxbrew/.linuxbrew/bin/bun run index.ts
Restart=always
RestartSec=30

# Environment
Environment="NODE_ENV=production"

# Logging
StandardOutput=journal
StandardError=journal

# Security
NoNewPrivileges=true
PrivateTmp=true

# Resource limits
MemoryLimit=1G
CPUQuota=50%

[Install]
WantedBy=multi-user.target
```

### 2. Enable and Start Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable ebay-monitor.service

# Start the service
sudo systemctl start ebay-monitor.service

# Check status
sudo systemctl status ebay-monitor.service
```

## Monitoring and Maintenance

### View Logs

```bash
# View recent logs
sudo journalctl -u ebay-monitor -n 50

# Follow logs in real-time
sudo journalctl -u ebay-monitor -f

# View logs from specific time
sudo journalctl -u ebay-monitor --since "2024-01-01 00:00:00"
```

### Service Management

```bash
# Stop service
sudo systemctl stop ebay-monitor

# Restart service
sudo systemctl restart ebay-monitor

# Reload after config changes
sudo systemctl daemon-reload
sudo systemctl restart ebay-monitor
```

### Database Maintenance

```bash
# Check database size
sudo -u postgres psql -d ebay_listings_monitor -c "SELECT pg_size_pretty(pg_database_size('ebay_listings_monitor'));"

# View listing count
sudo -u postgres psql -d ebay_listings_monitor -c "SELECT COUNT(*) FROM listings;"

# Optional: Clean old listings (older than 30 days)
sudo -u postgres psql -d ebay_listings_monitor -c "DELETE FROM listings WHERE created_at < NOW() - INTERVAL '30 days';"
```

## Performance Optimization

### 1. Swap File (Recommended)

```bash
# Create 2GB swap file
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2. Log Rotation

Create log rotation config:

```bash
sudo nano /etc/logrotate.d/ebay-monitor
```

Add:

```
/var/log/journal/*ebay-monitor* {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    missingok
}
```

### 3. Network Optimization

```bash
# Increase network buffer sizes
echo "net.core.rmem_max = 134217728" | sudo tee -a /etc/sysctl.conf
echo "net.core.wmem_max = 134217728" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

## Troubleshooting

### Common Issues

1. **Bun not found**

    ```bash
    export PATH="$HOME/.bun/bin:$PATH"
    source ~/.bashrc
    ```

2. **Database connection failed**

    - Check PostgreSQL is running: `sudo systemctl status postgresql`
    - Verify credentials in `.env`
    - Check pg_hba.conf authentication settings

3. **Discord bot offline**

    - Verify bot token in `.env`
    - Check bot has proper permissions in Discord server
    - Ensure channel ID is correct in `index.ts`

4. **High memory usage**
    - Monitor with: `htop`
    - Adjust MemoryLimit in systemd service
    - Consider reducing eBay API limit in `index.ts`

### Health Checks

Create a simple health check script:

```bash
nano ~/check-ebay-monitor.sh
```

Add:

```bash
#!/bin/bash
if systemctl is-active --quiet ebay-monitor; then
    echo "eBay Monitor is running"
    journalctl -u ebay-monitor -n 1 --no-pager
else
    echo "eBay Monitor is NOT running!"
    sudo systemctl start ebay-monitor
fi
```

Make executable:

```bash
chmod +x ~/check-ebay-monitor.sh
```

Add to crontab for regular checks:

```bash
crontab -e
# Add: */30 * * * * /home/pi/check-ebay-monitor.sh
```

## Backup Strategy

### Database Backup Script

```bash
nano ~/backup-ebay-db.sh
```

Add:

```bash
#!/bin/bash
BACKUP_DIR="/home/pi/backups"
mkdir -p $BACKUP_DIR
pg_dump -U ebaymonitor -h localhost ebay_listings_monitor | gzip > "$BACKUP_DIR/ebay_listings_monitor_$(date +%Y%m%d_%H%M%S).sql.gz"
# Keep only last 7 backups
find $BACKUP_DIR -name "ebay_listings_monitor_*.sql.gz" -mtime +7 -delete
```

Make executable and schedule:

```bash
chmod +x ~/backup-ebay-db.sh
crontab -e
# Add: 0 2 * * * /home/pi/backup-ebay-db.sh
```

## Security Recommendations

1. **Firewall Setup**

    ```bash
    sudo apt install ufw -y
    sudo ufw allow ssh
    sudo ufw allow 5432/tcp  # Only if PostgreSQL needs external access
    sudo ufw enable
    ```

2. **Secure .env file**

    ```bash
    chmod 600 .env
    ```

3. **Regular Updates**

    ```bash
    # Create update script
    nano ~/update-system.sh
    ```

    Add:

    ```bash
    #!/bin/bash
    sudo apt update && sudo apt upgrade -y
    cd ~/ebay-listings-monitor && git pull && bun install
    sudo systemctl restart ebay-monitor
    ```

## Monitoring Dashboard (Optional)

For visual monitoring, consider installing:

- **Grafana** + **Prometheus** for metrics
- **pgAdmin** for database management
- **Portainer** if using Docker

## Final Checklist

- [ ] Raspberry Pi OS 64-bit installed
- [ ] Bun installed and working
- [ ] PostgreSQL configured
- [ ] Repository cloned
- [ ] Dependencies installed (`bun install`)
- [ ] `.env` file configured
- [ ] Database migrations run
- [ ] Initial seed completed
- [ ] Systemd service created and enabled
- [ ] Service running successfully
- [ ] Logs accessible via journalctl
- [ ] Swap file created (optional but recommended)
- [ ] Backup strategy implemented
- [ ] Security measures in place
