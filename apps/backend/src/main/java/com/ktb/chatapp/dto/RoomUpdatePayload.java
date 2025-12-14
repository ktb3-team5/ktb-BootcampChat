package com.ktb.chatapp.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RoomUpdatePayload {
    private String roomId;
    private RoomResponse roomResponse;
}
