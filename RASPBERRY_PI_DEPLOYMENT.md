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

## Process Management with PM2

### 1. Install PM2

```bash
# Install PM2 globally
brew install pm2

# Set PM2 to start on boot
pm2 startup systemd -u pi --hp /home/pi
# Follow the command output instructions
```

### 2. Create PM2 Ecosystem File

```bash
nano ~/ebay-listings-monitor/ecosystem.config.js
```

Add the following content:

```javascript
export const apps = [
	{
		name: 'ebay-listings-monitor',
		script: 'bun',
		args: 'run index.ts',
		instances: 1,
		autorestart: true,
		watch: false,
		max_memory_restart: '1G',
		env: {
			NODE_ENV: 'production',
			PATH: '/home/linuxbrew/.linuxbrew/bin:/usr/local/bin:/usr/bin:/bin',
		},
		error_file: './logs/error.log',
		out_file: './logs/out.log',
		log_file: './logs/combined.log',
		time: true,
		merge_logs: true,
		max_restarts: 10,
		min_uptime: '10s',
		restart_delay: 4000,
		exp_backoff_restart_delay: 100,
	},
];
```

### 3. Start the Application

```bash
# Create logs directory
mkdir -p ~/ebay-listings-monitor/logs

# Start the application
cd ~/ebay-listings-monitor
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# View logs
pm2 logs ebay-listings-monitor

# Monitor in real-time
pm2 monit
```

### 4. PM2 Management Commands

```bash
# Check status
pm2 status

# Restart application
pm2 restart ebay-listings-monitor

# Stop application
pm2 stop ebay-listings-monitor

# View detailed info
pm2 describe ebay-listings-monitor

# View logs
pm2 logs ebay-listings-monitor --lines 50

# Clear logs
pm2 flush

# Update PM2
pm2 update

# Monitor resources
pm2 monit
```

## Monitoring and Maintenance

### View Logs

```bash
# View recent logs
pm2 logs ebay-listings-monitor --lines 50

# Follow logs in real-time
pm2 logs ebay-listings-monitor

# View error logs only
pm2 logs ebay-listings-monitor --err

# View logs with timestamps
pm2 logs ebay-listings-monitor --format

# View logs from file
tail -f ~/ebay-listings-monitor/logs/out.log
```

### Service Management

```bash
# Stop application
pm2 stop ebay-listings-monitor

# Restart application
pm2 restart ebay-listings-monitor

# Reload with zero downtime
pm2 reload ebay-listings-monitor

# Delete from PM2
pm2 delete ebay-listings-monitor

# Restart with updated code
cd ~/ebay-listings-monitor
git pull
bun install
pm2 restart ebay-listings-monitor
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
    # For manual execution
    export PATH="/home/linuxbrew/.linuxbrew/bin:$PATH"
    source ~/.bashrc

    # For PM2, ensure PATH is set in ecosystem.config.js
    ```

2. **Database connection failed**

    - Check PostgreSQL is running: `brew services list | grep postgresql`
    - Restart PostgreSQL: `brew services restart postgresql@16`
    - Verify credentials in `.env`
    - Test connection: `psql -U ebaymonitor -d ebay_listings_monitor`

3. **Discord bot offline**

    - Verify bot token in `.env`
    - Check bot has proper permissions in Discord server
    - Ensure channel ID is correct in `index.ts`

4. **High memory usage**

    - Monitor with: `htop` or `pm2 monit`
    - PM2 will auto-restart at 1G (configured in ecosystem.config.js)
    - Consider reducing eBay API limit in `index.ts`

5. **PM2 process not starting**

    ```bash
    # Check PM2 status
    pm2 status

    # View error logs
    pm2 logs ebay-listings-monitor --err

    # Restart PM2 daemon
    pm2 kill
    pm2 resurrect

    # Reset PM2
    pm2 delete all
    pm2 start ecosystem.config.js
    ```

6. **Application crashes repeatedly**

    ```bash
    # Check crash logs
    pm2 logs ebay-listings-monitor --lines 100

    # Check if hitting restart limits
    pm2 describe ebay-listings-monitor

    # Increase restart limits in ecosystem.config.js
    ```

### Health Checks

Create a health check script:

```bash
nano ~/check-ebay-monitor.sh
```

Add:

```bash
#!/bin/bash
APP_NAME="ebay-listings-monitor"

# Check if PM2 process is running
STATUS=$(pm2 jlist | jq -r ".[] | select(.name==\"$APP_NAME\") | .pm2_env.status" 2>/dev/null)

if [ "$STATUS" = "online" ]; then
    echo "[$(date)] eBay Monitor is running"
    pm2 logs $APP_NAME --lines 1 --nostream
else
    echo "[$(date)] eBay Monitor is NOT running! Attempting restart..."
    pm2 restart $APP_NAME
fi
```

Make executable:

```bash
chmod +x ~/check-ebay-monitor.sh
```

Add to crontab for regular checks:

```bash
crontab -e
# Add this line:
# */30 * * * * /home/pi/check-ebay-monitor.sh >> /home/pi/health-check.log 2>&1
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

### Basic Setup

- [ ] Raspberry Pi OS 64-bit installed
- [ ] Homebrew installed
- [ ] Bun installed via Homebrew and working
- [ ] PostgreSQL configured via Homebrew
- [ ] Repository cloned
- [ ] Dependencies installed (`bun install`)
- [ ] `.env` file configured
- [ ] Database migrations run (`bunx drizzle-kit push`)
- [ ] Initial seed completed (`bun run index.ts --seed`)

### Process Management

- [ ] PM2 installed via Homebrew
- [ ] PM2 ecosystem.config.js created
- [ ] Application started with PM2
- [ ] PM2 startup configured
- [ ] PM2 process list saved
- [ ] Logs accessible via `pm2 logs`

### Additional Setup

- [ ] Swap file created (optional but recommended)
- [ ] Health check script configured
- [ ] Backup strategy implemented
- [ ] Security measures in place (firewall, file permissions)
- [ ] Monitoring tools configured (optional)
