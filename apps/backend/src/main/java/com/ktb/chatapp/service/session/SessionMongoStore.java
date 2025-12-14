package com.ktb.chatapp.service.session;

import com.ktb.chatapp.model.Session;
import com.ktb.chatapp.repository.SessionRepository;
import java.util.Optional;

import java.util.concurrent.TimeUnit;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.redisson.api.RMapCache;
import org.redisson.api.RedissonClient;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

/**
 * MongoDB implementation of SessionStore.
 * Uses SessionRepository for persistence.
 */
@Component
@Primary
@RequiredArgsConstructor
public class SessionMongoStore implements SessionStore {

    private final RedissonClient redissonClient;
    private static final String SESSION_MAP_KEY = "user_sessions";
    
    @Override
    public Optional<Session> findByUserId(String userId) {
        RMapCache<String, Session> sessionMap = redissonClient.getMapCache(SESSION_MAP_KEY);
        return Optional.ofNullable(sessionMap.get(userId));
    }
    
    @Override
    public Session save(Session session) {
        RMapCache<String, Session> sessionMap = redissonClient.getMapCache(SESSION_MAP_KEY);
        sessionMap.put(session.getUserId(), session, 30, TimeUnit.MINUTES);

         return session;
    }
    
    @Override
    public void delete(String userId, String sessionId) {
        RMapCache<String, Session> sessionMap = redissonClient.getMapCache(SESSION_MAP_KEY);
        Session session = sessionMap.get(userId);
        if (session != null && session.getSessionId().equals(sessionId)) {
            sessionMap.remove(userId);
        }
    }
    
    @Override
    public void deleteAll(String userId) {
        RMapCache<String, Session> sessionMap = redissonClient.getMapCache(SESSION_MAP_KEY);
        sessionMap.remove(userId);
    }
}
