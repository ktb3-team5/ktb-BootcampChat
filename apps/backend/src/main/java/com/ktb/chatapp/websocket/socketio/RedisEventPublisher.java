package com.ktb.chatapp.websocket.socketio;

import com.ktb.chatapp.dto.EventEnvelope;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Component;

@Slf4j
@RequiredArgsConstructor
@Component
public class RedisEventPublisher {
    private final RedissonClient redissonClient;
    private final RedisTopicRouter topicRouter;

    public <T> void publish(String eventType, T payload) {

        String topic = topicRouter.resolve(eventType);

        EventEnvelope<T> envelope = new EventEnvelope<>(eventType, topic, payload);

        redissonClient.getTopic(topic).publish(envelope);

        log.debug("[Redis] Published: eventType={}, topic={}, payload={}",
                eventType, topic, payload);
    }
}

