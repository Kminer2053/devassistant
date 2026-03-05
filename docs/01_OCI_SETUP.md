# OCI 인스턴스 설정 가이드

Oracle Cloud Always Free에서 Ubuntu 24.04 ARM A1 인스턴스를 생성하는 단계별 안내입니다.

## 사전 준비

- Oracle Cloud 계정 (무료 가입: oracle.com/cloud/free)
- SSH 키 쌍 (공개키/개인키)

## 1. Compartment 생성

1. Oracle Cloud Console 접속: https://cloud.oracle.com
2. 좌측 메뉴 **Identity & Security** → **Compartments**
3. **Create Compartment** 클릭
4. 이름: `devassistant` (또는 원하는 이름)
5. **Create Compartment** 클릭

## 2. VCN 생성 (인터넷 연결 포함)

1. 좌측 메뉴 **Networking** → **Virtual Cloud Networks**
2. Compartment: 방금 생성한 Compartment 선택
3. **Create Virtual Cloud Network** 클릭
4. **Create VCN with Internet Connectivity** 선택
5. VCN 이름: `devassistant-vcn`
6. **Next** → **Create** 클릭

## 3. 인스턴스 생성

### 3.1 인스턴스 시작

1. 좌측 메뉴 **Compute** → **Instances**
2. Compartment 선택
3. **Create instance** 클릭

### 3.2 이름

- Name: `devassistant-vm`

### 3.3 Placement

- Availability Domain: 기본값 유지

### 3.4 Image and shape

1. **Edit** (Image and shape 섹션) 클릭
2. **Image**: **Ubuntu 24.04** 선택 (Always Free 표시 확인)
3. **Shape**: **Change shape** 클릭
   - **Ampere** 시리즈 선택
   - **VM.Standard.A1.Flex** 선택
   - **Select shape** 클릭
4. OCPU: **1**, Memory: **4** GB (Always Free 범위 내)
   - 필요 시 확장 가능: 최대 4 OCPU / 24GB (무료 한도 내)

### 3.5 Boot volume

- 기본값 50GB 유지 (Always Free 한도: 200GB/월)
- 추가 볼륨은 무료 한도 초과 시 과금됨

### 3.6 Networking

1. VCN: `devassistant-vcn` 선택
2. Subnet: `Public Subnet-xxx` 선택
3. **Assign a public IPv4 address**: 체크

### 3.7 Add SSH keys

1. **Generate a key pair for me** 또는 **Upload public key files** 선택
2. 개인키 다운로드 후 안전한 곳에 보관 (`.pem` 파일)

### 3.8 생성

**Create** 클릭

## 4. Security List / NSG 설정

### 4.1 인바운드 규칙 확인

1. 인스턴스 생성 후 **Subnet** 링크 클릭
2. **Security Lists** 탭 → 기본 Security List 클릭
3. **Add Ingress Rules** 클릭
4. 설정:
   - Source CIDR: **내 IP** (예: `123.456.789.0/32`) 또는 `0.0.0.0/0` (비권장)
   - IP Protocol: **TCP**
   - Destination Port Range: **22**
   - Description: `SSH only`
5. **Add Ingress Rules** 클릭

### 4.2 금지 사항

- **18789, 8080, 4096** 포트는 절대 인바운드에 추가하지 않음

## 5. 공인 IP 확인

1. **Compute** → **Instances** → 인스턴스 선택
2. **Instance information**에서 **Public IP address** 확인

## 6. SSH 접속

```bash
chmod 400 /path/to/your-key.pem
ssh -i /path/to/your-key.pem ubuntu@<public_ip>
```

예:

```bash
ssh -i ~/.ssh/oci-devassistant.pem ubuntu@129.153.xxx.xxx
```

## 7. 문제 해결

### Out of host capacity

- 다른 Availability Domain 선택 후 재시도
- 리전 변경 고려 (Home Region에서 Always Free만 지원)
- 시간대 변경 후 재시도

### Shape를 VM.Standard.A1.Flex로 변경할 수 없음

- Always Free 리소스가 해당 AD에 부족할 수 있음
- 다른 AD 선택 또는 x86 Ampere 미지원 리전인지 확인
- 대안: VM.Standard.E2.1.Micro (x86, Always Free) – 1 OCPU, 1GB RAM
