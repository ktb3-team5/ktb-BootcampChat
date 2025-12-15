package com.ktb.chatapp.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateRoomRequest {

    @NotBlank
    @Size(min = 2, max = 100)
    private String name;

    @Size(min = 4, max = 100)
    private String password;

    @Size(max = 500)
    private String description;

    private List<String> participants;
}
