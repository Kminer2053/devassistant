# Contabo VPS 설정 가이드

Contabo VPS에서 Ubuntu 서버를 준비하여 "나만의 개발비서"를 구축하는 단계별 안내입니다.

## 사전 준비

- Contabo 계정 (가입: https://contabo.com)
- SSH 키 쌍 (공개키/개인키)
- 결제 수단 (신용카드 등)

## 1. VPS 주문

1. [Contabo VPS](https://contabo.com/en/vps/) 접속
2. 원하는 플랜 선택 (권장: **Cloud VPS 10** 이상 – 4 vCPU, 8GB RAM)
   - 개발비서 구성에 4GB RAM 이상 권장
3. **Datacenter**: 서울에서 가까운 리전 선택 (예: Singapore)
4. **OS**: Ubuntu 22.04 또는 Ubuntu 24.04 선택
5. 주문 완료 후 결제

## 2. OS 설치 (Customer Panel)

1. [new.contabo.com](https://new.contabo.com) 또는 [my.contabo.com](https://my.contabo.com) 로그인
2. 주문한 VPS 선택 → **Reinstall** 또는 **Install**
3. 설치 옵션:
   - **Installation type**: Standard installation (클린 OS)
   - **OS**: Ubuntu 22.04 / 24.04
   - **Password**: 강력한 비밀번호 설정 (이메일로 발송되지 않으므로 반드시 저장)
   - **SSH Key** (선택): 공개키를 미리 등록해 두면 보안 강화
4. 설치 시작 → 완료까지 수분 대기

## 3. 접속 정보 확인

1. Customer Panel에서 VPS 선택
2. **IP 주소**, **root 비밀번호** 확인
3. 기본 사용자: **root** (Linux)

## 4. SSH 접속

```bash
ssh root@<서버_공인_IP>
```

비밀번호 입력 후 접속됩니다. SSH 키를 등록했다면 비밀번호 없이 접속 가능합니다.

### 4.1 SSH 키 등록 (아직 안 했다면)

로컬에서:

```bash
ssh-copy-id root@<서버_공인_IP>
```

또는 수동으로:

```bash
# 로컬에서 공개키 출력
cat ~/.ssh/id_rsa.pub   # 또는 id_ed25519.pem.pub

# 서버에서 (root로 로그인 후)
mkdir -p ~/.ssh
echo "공개키_내용" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

## 5. 방화벽 확인

Contabo는 기본적으로 SSH(22)가 열려 있습니다. 별도 보안 그룹 설정은 없으며, 서버 내부에서 `ufw` 등으로 관리합니다.

- **18789, 8080, 4096 포트**: 절대 외부에 노출하지 않음 (SSH 터널로만 접근)

## 6. 다음 단계

SSH로 root 접속이 되면:

1. **[02_SERVER_BOOTSTRAP.md](02_SERVER_BOOTSTRAP.md)** – 서버 초기 세팅 실행

## 7. 문제 해결

### 접속 불가

- IP 주소, 비밀번호 재확인
- 로컬 방화벽/공유기에서 22 포트 차단 여부 확인
- Contabo Customer Panel에서 VPS 상태가 "Online"인지 확인

### 느린 응답

- Singapore 등 가까운 리전 선택 시 개선
- 해상 케이블 경로에 따라 한국에서 다소 지연 가능
