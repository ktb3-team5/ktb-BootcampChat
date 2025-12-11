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

  // 이미지 파일 검증
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 업로드할 수 있습니다.');
  }

  // 파일 크기 제한 (5MB)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('파일 크기는 5MB를 초과할 수 없습니다.');
  }

  try {
    // 이미지 크기 정보 가져오기
    const dimensions = await getImageDimensions(file);

    // 파일 확장자 추출
    const extension = file.name.split('.').pop().toLowerCase();

    // S3 key 생성: profiles/user-{userId}/{ulid}.{extension}
    const fileName = `${ulid()}.${extension}`;
    const s3Key = `profiles/user-${userId}/${fileName}`;

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
      width: dimensions.width,
      height: dimensions.height,
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
 * S3 key로부터 CloudFront URL 생성
 * @param {string} s3Key - S3 객체 key
 * @returns {string} CloudFront URL
 */
export function getS3ImageUrl(s3Key) {
  if (!s3Key) return null;

  // 이미 전체 URL인 경우
  if (s3Key.startsWith('http://') || s3Key.startsWith('https://')) {
    return s3Key;
  }

  // CloudFront URL 사용 (설정되지 않은 경우 S3 직접 URL로 폴백)
  const baseUrl = process.env.NEXT_PUBLIC_CLOUDFRONT_URL ||
                  `https://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com`;

  return `${baseUrl}/${s3Key}`;
}
