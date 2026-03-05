# 서버 초기 세팅 (Bootstrap)

SSH 접속 후 Ubuntu 서버 초기 설정 가이드입니다.

## 사전 조건

- VPS 생성 및 OS 설치 완료 (Contabo, OCI 등)
- SSH 접속 가능 (root 또는 ubuntu)

## 1. 스크립트 준비

### Contabo (root 사용자)

```bash
scp /path/to/devassistant/scripts/bootstrap_ubuntu.sh root@<서버_IP>:~/
```

### OCI (ubuntu 사용자)

```bash
scp -i <key.pem> /path/to/devassistant/scripts/bootstrap_ubuntu.sh ubuntu@<public_ip>:~/
```

### 또는 git clone 후 (어떤 사용자든)

```bash
git clone <repo-url> /tmp/devassistant
cp /tmp/devassistant/scripts/bootstrap_ubuntu.sh ~/
```

## 2. 스크립트 실행

**Contabo**: root로 접속한 상태에서 실행. 스크립트가 `devassistant` 사용자를 만들고 root의 SSH 키를 복사한 뒤 root 로그인을 비활성화합니다. 이후에는 `devassistant`로 접속해야 합니다.

```bash
chmod +x ~/bootstrap_ubuntu.sh
sudo ~/bootstrap_ubuntu.sh
```

## 3. 스크립트가 수행하는 작업

### 3.1 패키지 업데이트

```bash
sudo apt update && sudo apt upgrade -y
```

### 3.2 기본 도구 설치

- git, curl, unzip, jq, ca-certificates, build-essential
- Node.js 22 (nvm 또는 NodeSource)

### 3.3 보안 설정

- 새 사용자 `devassistant` 생성, sudo 권한 부여
- SSH: `PasswordAuthentication no`, `PermitRootLogin no`
- ufw: 22 only allow, default deny
- fail2ban (선택): SSH 보호

### 3.4 디렉터리 구조

| 경로 | 용도 |
|------|------|
| /srv/devassistant | 코드/설정 |
| /srv/repos | 레포 모음 (개발 대상 경로) |
| /var/lib/devbridge | SQLite DB, 로그 |

### 3.5 타임존

```bash
sudo timedatectl set-timezone Asia/Seoul
```

## 4. devassistant 사용자로 전환

bootstrap 후:

```bash
sudo su - devassistant
```

이후 설치/운영은 `devassistant` 계정에서 수행합니다.

## 5. 수동 설정 (스크립트 외)

스크립트가 일부 환경에서 실패할 경우 아래를 수동으로 실행:

```bash
# ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22
sudo ufw --force enable

# fail2ban (선택)
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```
