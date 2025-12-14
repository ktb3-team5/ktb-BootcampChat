package com.ktb.chatapp.websocket.socketio;

import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.Map;

@Component
public class RedisTopicRouter {

    private final Map<String, String> topicMap = Map.of(
            SocketIOEvents.MESSAGE,                 "chat:message",
            SocketIOEvents.MESSAGE_REACTION_UPDATE, "chat:reaction",
            SocketIOEvents.PARTICIPANTS_UPDATE,     "chat:participants",
            SocketIOEvents.USER_LEFT,               "chat:room",
            SocketIOEvents.MESSAGES_READ,           "chat:read",
            SocketIOEvents.ROOM_CREATED,            "chat:room-list",
            SocketIOEvents.ROOM_UPDATE,             "chat:room-update",
            SocketIOEvents.SESSION_ENDED,           "chat:session"
    );

    public String resolve(String eventType) {
        return topicMap.getOrDefault(eventType, "chat:default");
    }

    public Collection<String> getAllTopics() {
        return topicMap.values();
    }
}
