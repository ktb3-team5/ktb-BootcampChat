package com.ktb.chatapp.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class EventEnvelope<T> {
    private String eventType;
    private String topic;
    private T payload;
}
