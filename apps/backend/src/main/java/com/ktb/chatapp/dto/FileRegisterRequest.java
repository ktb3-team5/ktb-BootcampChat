package com.ktb.chatapp.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

@Data
public class FileRegisterRequest {

    @NotBlank(message = "S3 key는 필수입니다.")
    private String s3Key;

    @NotBlank(message = "원본 파일명은 필수입니다.")
    private String originalName;

    @NotNull(message = "파일 크기는 필수입니다.")
    @Positive(message = "파일 크기는 양수여야 합니다.")
    private Long size;

    @NotBlank(message = "MIME 타입은 필수입니다.")
    private String mimeType;
}
