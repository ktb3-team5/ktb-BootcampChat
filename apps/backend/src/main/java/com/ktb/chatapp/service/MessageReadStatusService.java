package com.ktb.chatapp.service;

import com.ktb.chatapp.model.Message;
import com.ktb.chatapp.repository.MessageRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import com.ktb.chatapp.repository.MessageRepositoryCustomImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 메시지 읽음 상태 관리 서비스
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MessageReadStatusService {

    private final MessageRepositoryCustomImpl messageRepositoryCustom;

    /**
     * 메시지 읽음 상태 업데이트
     *
     * @param messageIds 읽음 상태를 업데이트할 메시지 리스트
     * @param userId 읽은 사용자 ID
     */
    public void updateReadStatus(List<String> messageIds, String userId) {
        if (messageIds.isEmpty()) {
            return;
        }
        
        try {
            messageRepositoryCustom.bulkUpdateReadStatus(
                    messageIds,
                    userId,
                    LocalDateTime.now()
            );

        } catch (Exception e) {
            log.error("Read status update error for user {}", userId, e);
        }
    }
}
