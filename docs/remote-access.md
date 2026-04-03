# Remote Access from Mac

DGX Lab runs on the DGX Spark and is accessed from your Mac via a browser. This guide covers three access methods: local network, Tailscale, and SSH tunnel.

## 1. Local Network

If your Mac and DGX Spark are on the same network, find the Spark's IP:

```bash
# On the DGX Spark
hostname -I
```

Then open `http://<spark-ip>:3000` (dev) or `http://<spark-ip>` (production/docker) on your Mac.

## 2. Tailscale

Tailscale creates a private network between your devices, making the app accessible from anywhere.

### Install on DGX Spark

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

### Install on Mac

Download from [tailscale.com/download](https://tailscale.com/download) or:

```bash
brew install tailscale
```

### Access

Once both devices are on Tailscale, use the Tailscale hostname or IP:

```
http://<spark-tailscale-hostname>:3000   # dev
http://<spark-tailscale-hostname>        # production/docker
```

Find the hostname with `tailscale status` on either device.

## 3. SSH Tunnel

If you cannot use Tailscale and the Spark is behind a firewall:

```bash
# On your Mac
ssh -L 3000:localhost:3000 -L 8000:localhost:8000 <user>@<spark-ip>
```

Then open `http://localhost:3000` on your Mac. The tunnel must stay open.

## Auto-Start on Boot

To have DGX Lab start automatically when the DGX Spark boots:

### systemd service

```bash
sudo tee /etc/systemd/system/dgx-lab.service << 'EOF'
[Unit]
Description=DGX Lab
After=network.target

[Service]
Type=simple
User=<your-user>
WorkingDirectory=/path/to/dgx-lab
ExecStart=/usr/bin/make dev
Restart=on-failure
RestartSec=5
Environment=PATH=%h/.local/bin:%h/.bun/bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now dgx-lab
```

### Manage the service

```bash
sudo systemctl status dgx-lab    # check status
sudo systemctl restart dgx-lab   # restart
sudo systemctl stop dgx-lab      # stop
sudo systemctl disable dgx-lab   # disable auto-start
journalctl -u dgx-lab -f         # view logs
```

## Mac Shortcuts

Add to your `~/.zshrc` on your Mac for quick access:

```bash
# Replace <spark> with your Tailscale hostname or local IP
DGX_HOST="<spark>"

alias dgx-lab="open http://$DGX_HOST:3000"
alias dgx-lab-start="ssh <user>@$DGX_HOST 'sudo systemctl start dgx-lab'"
alias dgx-lab-stop="ssh <user>@$DGX_HOST 'sudo systemctl stop dgx-lab'"
alias dgx-lab-ssh="ssh <user>@$DGX_HOST"
```

Then:

```bash
dgx-lab-start   # start the app
dgx-lab         # open in browser
dgx-lab-stop    # stop the app
dgx-lab-ssh     # ssh into the Spark
```
