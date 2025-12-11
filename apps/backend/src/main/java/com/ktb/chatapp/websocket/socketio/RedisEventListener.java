package com.ktb.chatapp.websocket.socketio;

import com.corundumstudio.socketio.SocketIOServer;
import com.ktb.chatapp.dto.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RTopic;
import org.redisson.api.RedissonClient;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.Map;

import static com.ktb.chatapp.websocket.socketio.SocketIOEvents.*;

@Slf4j
@Component
@RequiredArgsConstructor
public class RedisEventListener {

    private final SocketIOServer socketIOServer;
    private final RedissonClient redissonClient;
    private final RedisTopicRouter topicRouter;

    @EventListener(ContextRefreshedEvent.class)
    public void subscribeAllTopics() {

        topicRouter.getAllTopics().forEach(topic -> {
            RTopic rTopic = redissonClient.getTopic(topic);

            rTopic.addListener(EventEnvelope.class, (channel, envelope) -> {
                log.debug("[Redis] Received eventType={} topic={}", envelope.getEventType(), envelope.getTopic());
                route(envelope);
            });
            log.info("Subscribed Redis topic: {}", topic);
        });
    }

    private void route(EventEnvelope<?> envelope) {
        switch (envelope.getEventType()) {
            case MESSAGE -> {
                MessageResponse response = (MessageResponse) envelope.getPayload();
                socketIOServer.getRoomOperations(response.getRoomId())
                        .sendEvent(MESSAGE, response);
            }

            case MESSAGE_REACTION_UPDATE -> {
                MessageReactionResponse response = (MessageReactionResponse) envelope.getPayload();
                socketIOServer.getRoomOperations(response.getRoomId())
                        .sendEvent(SocketIOEvents.MESSAGE_REACTION_UPDATE, response);
            }

            case PARTICIPANTS_UPDATE -> {
                ParticipantsUpdateResponse response = (ParticipantsUpdateResponse) envelope.getPayload();
                socketIOServer.getRoomOperations(response.getRoomId())
                        .sendEvent(PARTICIPANTS_UPDATE, response.getParticipants());
            }

            case USER_LEFT -> {
                UserLeftResponse response = (UserLeftResponse) envelope.getPayload();
                socketIOServer.getRoomOperations(response.getRoomId())
                        .sendEvent(USER_LEFT, Map.of(
                                "userId", response.getUserId(),
                                "userName", response.getUserName()
                        ));
            }

            case MESSAGES_READ -> {
                MessagesReadResponse response = (MessagesReadResponse) envelope.getPayload();
                socketIOServer.getRoomOperations(response.getRoomId())
                        .sendEvent(MESSAGES_READ, response);
            }
        }
    }
}
