# S3 + CloudFront 프로필 이미지 업로드 설정 가이드
## (완전 퍼블릭 S3 - 부하테스트 대회용)

**⚠️ 주의: 이 설정은 부하테스트 대회용입니다. 프로덕션 환경에서는 사용하지 마세요!**

## 아키텍처

```
프론트엔드 → fetch() PUT → S3 URL 직접 업로드 (퍼블릭 버킷)
         ↓
    S3 key + 메타데이터 → 백엔드 → DB 저장
         ↓
    이미지 표시 = CloudFront URL
```

**특징:**
- ✅ AWS SDK 불필요
- ✅ IAM 자격 증명 불필요 (완전 퍼블릭)
- ✅ 프론트엔드에서 fetch()로 직접 업로드
- ✅ CloudFront로 빠른 이미지 전송

---

## 1. S3 버킷 생성 (완전 퍼블릭)

### 1-1. S3 버킷 생성

1. [AWS S3 콘솔](https://console.aws.amazon.com/s3/) 접속
2. "버킷 만들기" 클릭
3. 설정:
   - **버킷 이름**: `ktb-chat-profile-images`
   - **AWS 리전**: `ap-northeast-2` (서울)
   - **⚠️ 퍼블릭 액세스 차단 설정**: **모두 해제** (체크 모두 해제)

### 1-2. CORS 설정

버킷 → 권한 → CORS 편집:

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
        "AllowedOrigins": ["*"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3000
    }
]
```

### 1-3. 버킷 정책 (완전 퍼블릭 - 읽기/쓰기 모두 허용)

버킷 → 권한 → 버킷 정책:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadWrite",
            "Effect": "Allow",
            "Principal": "*",
            "Action": [
                "s3:GetObject",
                "s3:PutObject"
            ],
            "Resource": "arn:aws:s3:::ktb-chat-profile-images/profiles/*"
        }
    ]
}
```

**⚠️ 이 정책은 누구나 업로드/다운로드 가능합니다. 부하테스트용으로만 사용하세요!**

---

## 2. CloudFront 배포 생성

### 2-1. CloudFront 배포

1. [AWS CloudFront 콘솔](https://console.aws.amazon.com/cloudfront/) 접속
2. "배포 생성" 클릭
3. 설정:
   - **원본 도메인**: S3 버킷 선택
   - **원본 액세스**: Public (퍼블릭 버킷)
   - **뷰어 프로토콜 정책**: Redirect HTTP to HTTPS
   - **캐시 정책**: CachingOptimized
   - **가격 등급**: 한국만 사용 시 "북미, 유럽, 아시아만 사용"

### 2-2. CloudFront 도메인 확인

배포 완료 후:
- 예: `d1234567890abc.cloudfront.net`

---

## 3. 백엔드 설정

### 환경 변수

`apps/backend/src/main/resources/application.properties`:

```properties
# S3 Configuration
app.s3.region=ap-northeast-2
app.s3.bucket=ktb-chat-profile-images
app.s3.base-url=https://d1234567890abc.cloudfront.net
```

---

## 4. 프론트엔드 설정

### 4-1. 환경 변수

`apps/frontend/.env`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5001
NEXT_PUBLIC_SOCKET_URL=http://localhost:5002

# S3 Configuration (Public Bucket)
NEXT_PUBLIC_AWS_REGION=ap-northeast-2
NEXT_PUBLIC_S3_BUCKET_NAME=ktb-chat-profile-images

# CloudFront URL
NEXT_PUBLIC_CLOUDFRONT_URL=https://d1234567890abc.cloudfront.net
```

### 4-2. 의존성 설치

```bash
cd apps/frontend
npm install ulid
```

**주의: @aws-sdk/client-s3는 필요 없습니다!**

---

## 5. 업로드 플로우

1. **사용자가 이미지 선택**
2. **프론트엔드가 S3 key 생성**
   - `profiles/user-{userId}/{ulid}.{extension}`
3. **fetch() PUT으로 S3에 직접 업로드**
   ```javascript
   const s3Url = `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
   await fetch(s3Url, {
     method: 'PUT',
     body: file,
     headers: { 'Content-Type': file.type }
   });
   ```
4. **백엔드에 S3 key + 메타데이터 전송**
   - `POST /api/users/profile-image/register`
5. **이미지 표시**
   - CloudFront URL: `https://d1234567890abc.cloudfront.net/profiles/user-123/abc.jpg`

---

## 6. 테스트

### 6-1. 로컬 테스트

```bash
# 백엔드
cd apps/backend
mvn spring-boot:run

# 프론트엔드
cd apps/frontend
npm run dev
```

### 6-2. 프로필 이미지 업로드

1. `http://localhost:3000/profile` 접속
2. "이미지 변경" 클릭
3. 이미지 선택 및 업로드
4. 성공 메시지 확인

### 6-3. S3 확인

AWS S3 콘솔에서:
```
ktb-chat-profile-images/
└── profiles/
    └── user-{userId}/
        └── {ulid}.jpg
```

---

## 7. 트러블슈팅

### CORS 에러

```
Access to fetch has been blocked by CORS policy
```

**해결:**
- S3 CORS 설정 확인
- `AllowedOrigins`에 `"*"` 포함되어 있는지 확인

### 403 Forbidden

```
Access Denied
```

**해결:**
- 버킷 정책 확인 (`s3:PutObject` 허용 확인)
- 퍼블릭 액세스 차단 설정이 모두 해제되었는지 확인

### 이미지가 표시되지 않음

**해결:**
- CloudFront 배포 상태 확인 (Deployed)
- CloudFront URL 환경 변수 확인
- 브라우저 콘솔에서 이미지 URL 확인

---

## 8. 보안 경고

⚠️ **이 설정은 누구나 S3에 파일을 업로드할 수 있습니다!**

**부하테스트 대회 후 반드시:**
1. S3 버킷 삭제 또는 정책 변경
2. CloudFront 배포 삭제
3. 불필요한 파일 정리

**절대 프로덕션 환경에서 사용하지 마세요!**

---

## 9. API 엔드포인트

### POST /api/users/profile-image/register

S3에 업로드된 이미지의 key를 등록합니다.

**Request:**
```json
{
  "s3Key": "profiles/user-123/abc123.jpg",
  "originalName": "profile.jpg",
  "size": 102400,
  "mimeType": "image/jpeg",
  "width": 800,
  "height": 600
}
```

**Response:**
```json
{
  "success": true,
  "message": "프로필 이미지가 업데이트되었습니다.",
  "imageUrl": "https://d1234567890abc.cloudfront.net/profiles/user-123/abc123.jpg"
}
```

---

## 참고 자료

- [AWS S3 문서](https://docs.aws.amazon.com/s3/)
- [AWS CloudFront 문서](https://docs.aws.amazon.com/cloudfront/)
- [S3 버킷 정책](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-policies.html)
