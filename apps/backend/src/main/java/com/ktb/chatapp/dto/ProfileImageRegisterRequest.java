package com.ktb.chatapp.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class ProfileImageRegisterRequest {

    @NotBlank(message = "S3 키는 필수입니다")
    private String s3Key;

    private String originalName;

    @NotNull(message = "파일 크기는 필수입니다")
    @Positive(message = "파일 크기는 양수여야 합니다")
    private Long size;

    private String mimeType;

    private Integer width;

    private Integer height;
}
