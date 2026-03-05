#!/bin/bash
set -e

echo "=== DevAssistant Bootstrap ==="

# Update
sudo apt update && sudo apt upgrade -y

# Base tools
sudo apt install -y git curl unzip jq ca-certificates build-essential

# Node.js 22 (NodeSource)
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
fi

# User
if ! id devassistant &>/dev/null; then
  sudo useradd -m -s /bin/bash devassistant
  echo "devassistant ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/devassistant
  sudo chmod 440 /etc/sudoers.d/devassistant
  # Copy SSH keys from current user (root/ubuntu) to devassistant so we don't lock ourselves out
  CUR_HOME=$(eval echo ~${SUDO_USER:-$USER})
  if [ -f "$CUR_HOME/.ssh/authorized_keys" ]; then
    sudo mkdir -p /home/devassistant/.ssh
    sudo cp "$CUR_HOME/.ssh/authorized_keys" /home/devassistant/.ssh/
    sudo chown -R devassistant:devassistant /home/devassistant/.ssh
    sudo chmod 700 /home/devassistant/.ssh
    sudo chmod 600 /home/devassistant/.ssh/authorized_keys
  fi
fi

# SSH hardening
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart sshd 2>/dev/null || sudo systemctl restart ssh

# ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22
echo "y" | sudo ufw enable

# fail2ban (optional)
if command -v apt-get &>/dev/null; then
  sudo apt install -y fail2ban 2>/dev/null || true
  sudo systemctl enable fail2ban 2>/dev/null || true
  sudo systemctl start fail2ban 2>/dev/null || true
fi

# Directories
sudo mkdir -p /srv/devassistant /srv/repos
sudo mkdir -p /var/lib/devbridge
sudo chown -R devassistant:devassistant /srv/devassistant /srv/repos /var/lib/devbridge 2>/dev/null || true

# Timezone
sudo timedatectl set-timezone Asia/Seoul

echo "=== Bootstrap done. Next: copy devassistant repo to /srv/devassistant and run install scripts. ==="
