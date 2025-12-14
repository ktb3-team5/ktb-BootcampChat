package com.ktb.chatapp.service;

import com.ktb.chatapp.model.Session;
import com.ktb.chatapp.service.session.SessionStore;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.boot.convert.DurationStyle;
import org.springframework.stereotype.Service;

import static com.ktb.chatapp.model.Session.SESSION_TTL;

@Slf4j
@Service
@RequiredArgsConstructor
public class SessionService {

    private final SessionStore sessionStore;
    private final RedissonClient redissonClient;
    public static final long SESSION_TTL_SEC = DurationStyle.detectAndParse(SESSION_TTL).getSeconds();
    private static final long SESSION_TIMEOUT = SESSION_TTL_SEC * 1000;
    private static final long SESSION_UPDATE_INTERVAL_MS = 60000L;

    private String generateSessionId() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    private SessionData toSessionData(Session session) {
        return SessionData.builder()
                .userId(session.getUserId())
                .sessionId(session.getSessionId())
                .createdAt(session.getCreatedAt())
                .lastActivity(session.getLastActivity())
                .metadata(session.getMetadata())
                .build();
    }

    public SessionCreationResult createSession(String userId, SessionMetadata metadata) {
        // 분산 락을 사용하여 멀티 서버 환경에서 동시 세션 생성 방지
        String lockKey = "session:create:lock:" + userId;
        RLock lock = redissonClient.getLock(lockKey);
        boolean lockAcquired = false;

        try {
            // 최대 5초 대기, 10초 후 자동 해제
            lockAcquired = lock.tryLock(5, 10, TimeUnit.SECONDS);
            if (!lockAcquired) {
                log.warn("Failed to acquire session creation lock for userId: {}", userId);
                throw new RuntimeException("세션 생성 중입니다. 잠시 후 다시 시도해주세요.");
            }

            // Remove all existing user sessions
            removeAllUserSessions(userId);

            String sessionId = generateSessionId();
            long now = Instant.now().toEpochMilli();

            Session session = Session.builder()
                    .userId(userId)
                    .sessionId(sessionId)
                    .createdAt(now)
                    .lastActivity(now)
                    .metadata(metadata)
                    .expiresAt(Instant.now().plusSeconds(SESSION_TTL_SEC))
                    .build();

            session = sessionStore.save(session);

            SessionData sessionData = toSessionData(session);

            log.info("Session created successfully for userId: {} with sessionId: {}", userId, sessionId);

            return SessionCreationResult.builder()
                    .sessionId(sessionId)
                    .expiresIn(SESSION_TTL_SEC)
                    .sessionData(sessionData)
                    .build();

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("Session creation interrupted for userId: {}", userId, e);
            throw new RuntimeException("세션 생성이 중단되었습니다.", e);
        } catch (Exception e) {
            log.error("Session creation error for userId: {}", userId, e);
            throw new RuntimeException("세션 생성 중 오류가 발생했습니다.", e);
        } finally {
            // 락을 획득했고 현재 스레드가 보유 중일 때만 해제
            if (lockAcquired && lock.isHeldByCurrentThread()) {
                try {
                    lock.unlock();
                    log.debug("Session creation lock released for userId: {}", userId);
                } catch (Exception e) {
                    log.error("Failed to unlock session creation lock for userId: {}", userId, e);
                }
            }
        }
    }

    public SessionValidationResult validateSession(String userId, String sessionId) {
        try {
            if (userId == null || sessionId == null) {
                log.warn("validateSession called with null parameters: userId={}, sessionId={}", userId, sessionId);
                return SessionValidationResult.invalid("INVALID_PARAMETERS", "유효하지 않은 세션 파라미터");
            }

            Session session = sessionStore.findByUserId(userId).orElse(null);
            
            if (session == null) {
                log.warn("No session found for userId: {}", userId);
                return SessionValidationResult.invalid("INVALID_SESSION", "세션을 찾을 수 없습니다.");
            }

            if (!sessionId.equals(session.getSessionId())) {
                log.warn("Session ID mismatch for userId: {}. Provided: {}, Expected: {}", userId, sessionId, session.getSessionId());
                return SessionValidationResult.invalid("INVALID_SESSION", "잘못된 세션 ID입니다.");
            }

            // Check if session has timed out
            long now = Instant.now().toEpochMilli();
            if (now - session.getLastActivity() > SESSION_TIMEOUT) {
                log.warn("Session timed out for userId: {}, sessionId: {}", userId, sessionId);
                removeSession(userId, sessionId);
                return SessionValidationResult.invalid("SESSION_EXPIRED", "세션이 만료되었습니다.");
            }

            // Update DB after 1 min over form access
            long lastUpdateDiff = now - session.getLastActivity();
            if (lastUpdateDiff > SESSION_UPDATE_INTERVAL_MS) {
                session.setLastActivity(now);
                session.setExpiresAt(Instant.now().plusSeconds(SESSION_TTL_SEC));
                session = sessionStore.save(session);
            }

            SessionData sessionData = toSessionData(session);
            return SessionValidationResult.valid(sessionData);

        } catch (Exception e) {
            log.error("Session validation error for userId: {}, sessionId: {}", userId, sessionId, e);
            return SessionValidationResult.invalid("VALIDATION_ERROR", "세션 검증 중 오류가 발생했습니다.");
        }
    }

    // FIXME: 과도한 업데이트 쿼리
    public void updateLastActivity(String userId) {
        try {
            if (userId == null) {
                log.warn("updateLastActivity called with null userId");
                return;
            }

            Session session = sessionStore.findByUserId(userId).orElse(null);
            if (session == null) {
                log.debug("No session found to update last activity for user: {}", userId);
                return;
            }

            long now = Instant.now().toEpochMilli();
            if(now - session.getLastActivity() > SESSION_UPDATE_INTERVAL_MS) {
                session.setLastActivity(now);
                session.setExpiresAt(Instant.now().plusSeconds(SESSION_TTL_SEC));
                sessionStore.save(session);
            }
            
        } catch (Exception e) {
            log.error("Failed to update session activity for user: {}", userId, e);
        }
    }

    public void removeSession(String userId, String sessionId) {
        try {
            if (sessionId != null) {
                sessionStore.delete(userId, sessionId);
            } else {
                sessionStore.deleteAll(userId);
            }
        } catch (Exception e) {
            log.error("Session removal error for userId: {}, sessionId: {}", userId, sessionId, e);
            throw new RuntimeException("세션 삭제 중 오류가 발생했습니다.", e);
        }
    }

    public void removeAllUserSessions(String userId) {
        try {
            sessionStore.deleteAll(userId);
        } catch (Exception e) {
            log.error("Remove all sessions error for userId: {}", userId, e);
            throw new RuntimeException("모든 세션 삭제 중 오류가 발생했습니다.", e);
        }
    }
    
    void removeSession(String userId) {
        removeSession(userId, null);
    }

    SessionData getActiveSession(String userId) {
        try {
            Session session = sessionStore.findByUserId(userId).orElse(null);
            
            if (session == null) {
                return null;
            }

            return toSessionData(session);
        } catch (Exception e) {
            log.error("Get active session error for userId: {}", userId, e);
            return null;
        }
    }
    
}
