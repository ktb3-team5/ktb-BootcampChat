package com.ktb.chatapp.service;

import jakarta.annotation.PostConstruct;
import java.time.Duration;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RRateLimiter;
import org.redisson.api.RateIntervalUnit;
import org.redisson.api.RateType;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import static java.net.InetAddress.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class RateLimitService {

    private final RedissonClient redissonClient;

    @Value("${HOSTNAME:''}")
    private String hostName;
    
    @PostConstruct
    public void init() {
        if (!hostName.isEmpty()) {
            return;
        }
        hostName = generateHostname();
    }
    
    private String generateHostname() {
        try {
            return getLocalHost().getHostName();
        } catch (Exception e) {
            return "unknown-" + java.util.UUID.randomUUID().toString().substring(0, 8);
        }
    }

    public RateLimitCheckResult checkRateLimit(String _clientId, int maxRequests, Duration window) {
        String actualClientId = hostName + ":" + _clientId;
        long windowSeconds = Math.max(1L, window.getSeconds());

        RRateLimiter limiter = redissonClient.getRateLimiter(actualClientId);

        limiter.trySetRate(RateType.OVERALL, maxRequests, windowSeconds, RateIntervalUnit.SECONDS);

        // 메모리 누수 방지용 만료 시간 설정
        limiter.expire(Duration.ofSeconds(windowSeconds * 2));

        boolean allowed = limiter.tryAcquire(1);

        long nowEpochSecond = Instant.now().getEpochSecond();
        long resetEpochSecond = nowEpochSecond + windowSeconds;

        if (allowed) {
            return RateLimitCheckResult.allowed(
                    maxRequests, (int) limiter.availablePermits(), windowSeconds, resetEpochSecond, 0);
        } else {
            return RateLimitCheckResult.rejected(
                    maxRequests, windowSeconds, resetEpochSecond, windowSeconds);
        }
    }
}
