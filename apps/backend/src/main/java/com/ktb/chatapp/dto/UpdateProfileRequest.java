package com.ktb.chatapp.dto;

import com.ktb.chatapp.validation.ValidName;
import com.ktb.chatapp.validation.ValidPassword;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class UpdateProfileRequest {
    @NotBlank(message = "이름을 입력해주세요.")
    @ValidName
    private String name;
}
