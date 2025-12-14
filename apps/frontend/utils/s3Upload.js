import { ulid } from 'ulid';

/**
 * S3에 프로필 이미지 업로드 (fetch 사용, 완전 퍼블릭 버킷)
 * @param {File} file - 업로드할 이미지 파일
 * @param {string} userId - 사용자 ID
 * @returns {Promise<{s3Key: string, originalName: string, size: number, mimeType: string, width: number, height: number}>}
 */
export async function uploadProfileImageToS3(file, userId) {
  if (!file) {
    throw new Error('파일이 제공되지 않았습니다.');
  }

  // 환경 변수 검증
  if (!process.env.NEXT_PUBLIC_S3_BUCKET_NAME || !process.env.NEXT_PUBLIC_AWS_REGION) {
    throw new Error('S3 설정이 올바르지 않습니다. 관리자에게 문의하세요.');
  }

  // 이미지 파일 검증
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 업로드할 수 있습니다.');
  }

  // 파일 크기 제한 (5MB)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('파일 크기는 5MB를 초과할 수 없습니다.');
  }

  try {
    // 이미지 리사이징 및 압축 (800x800, 품질 0.85)
    console.log('원본 파일 크기:', (file.size / 1024).toFixed(2), 'KB');
    const { blob, width, height } = await resizeAndCompressImage(file, 800, 800, 0.85);
    console.log('압축 후 크기:', (blob.size / 1024).toFixed(2), 'KB');

    // S3 key 생성: profiles/user-{userId}/{ulid}.webp
    const fileName = `${ulid()}.webp`;
    const s3Key = `profiles/user-${userId}/${fileName}`;

    // S3 URL 생성
    const s3Url = `https://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${s3Key}`;

    // S3에 직접 업로드 (압축된 blob 사용)
    const response = await fetch(s3Url, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': 'image/webp',
      },
    });

    if (!response.ok) {
      throw new Error(`S3 업로드 실패: ${response.status} ${response.statusText}`);
    }

    console.log('S3 업로드 성공:', s3Key);

    // 메타데이터 반환
    return {
      s3Key,
      originalName: file.name,
      size: blob.size,
      mimeType: 'image/webp',
      width,
      height,
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    throw new Error(`S3 업로드 실패: ${error.message}`);
  }
}

/**
 * 이미지 파일의 크기(너비, 높이) 정보 가져오기
 * @param {File} file - 이미지 파일
 * @returns {Promise<{width: number, height: number}>}
 */
function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        width: img.width,
        height: img.height,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('이미지를 로드할 수 없습니다.'));
    };

    img.src = objectUrl;
  });
}

/**
 * 이미지 리사이징 및 압축
 * @param {File} file - 원본 이미지 파일
 * @param {number} maxWidth - 최대 너비 (기본값: 800)
 * @param {number} maxHeight - 최대 높이 (기본값: 800)
 * @param {number} quality - 압축 품질 0-1 (기본값: 0.85)
 * @returns {Promise<{blob: Blob, width: number, height: number}>}
 */
async function resizeAndCompressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // 원본 크기
      let { width, height } = img;

      // 리사이징 비율 계산
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }

      // Canvas로 리사이징
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Blob으로 변환 (WebP 또는 JPEG)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('이미지 압축에 실패했습니다.'));
            return;
          }
          resolve({ blob, width, height });
        },
        'image/webp', // WebP 포맷 사용 (JPEG보다 작음)
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('이미지를 로드할 수 없습니다.'));
    };

    img.src = objectUrl;
  });
}

/**
 * S3에 채팅 파일 업로드 (fetch 사용, 완전 퍼블릭 버킷)
 * @param {File} file - 업로드할 파일
 * @param {string} userId - 사용자 ID
 * @returns {Promise<{s3Key: string, originalName: string, size: number, mimeType: string}>}
 */
export async function uploadChatFileToS3(file, userId) {
  if (!file) {
    throw new Error('파일이 제공되지 않았습니다.');
  }

  // 환경 변수 검증
  if (!process.env.NEXT_PUBLIC_S3_BUCKET_NAME || !process.env.NEXT_PUBLIC_AWS_REGION) {
    throw new Error('S3 설정이 올바르지 않습니다. 관리자에게 문의하세요.');
  }

  // 파일 크기 제한 (50MB)
  if (file.size > 50 * 1024 * 1024) {
    throw new Error('파일 크기는 50MB를 초과할 수 없습니다.');
  }

  // 허용된 파일 타입 검증
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf'
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error('지원하지 않는 파일 형식입니다. 이미지 또는 PDF 파일만 업로드 가능합니다.');
  }

  try {
    // 파일 확장자 추출
    const extension = file.name.split('.').pop().toLowerCase();

    // S3 key 생성: chat-files/user-{userId}/{ulid}.{extension}
    const fileName = `${ulid()}.${extension}`;
    const s3Key = `chat-files/user-${userId}/${fileName}`;

    // S3 URL 생성
    const s3Url = `https://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${s3Key}`;

    // S3에 직접 업로드 (fetch 사용)
    const response = await fetch(s3Url, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    if (!response.ok) {
      throw new Error(`S3 업로드 실패: ${response.status} ${response.statusText}`);
    }

    console.log('S3 업로드 성공:', s3Key);

    // 메타데이터 반환
    return {
      s3Key,
      originalName: file.name,
      size: file.size,
      mimeType: file.type,
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    throw new Error(`S3 업로드 실패: ${error.message}`);
  }
}

/**
 * S3 key로부터 CloudFront URL 생성
 * @param {string} s3Key - S3 객체 key
 * @returns {string} CloudFront URL
 */
export function getS3ImageUrl(s3Key) {
  if (!s3Key) return null;

  // 이전 파일 시스템 경로는 무시 (더 이상 사용되지 않음)
  if (s3Key.includes('/api/files/view/')) {
    return null;
  }

  // 이미 전체 URL인 경우
  if (s3Key.startsWith('http://') || s3Key.startsWith('https://')) {
    return s3Key;
  }

  // CloudFront URL 사용 (설정되지 않은 경우 S3 직접 URL로 폴백)
  const baseUrl = process.env.NEXT_PUBLIC_CLOUDFRONT_URL ||
                  `https://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com`;

  return `${baseUrl}/${s3Key}`;
}
