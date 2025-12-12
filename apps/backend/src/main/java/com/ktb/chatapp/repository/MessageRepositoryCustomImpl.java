package com.ktb.chatapp.repository;

import com.ktb.chatapp.model.Message;
import lombok.RequiredArgsConstructor;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@RequiredArgsConstructor
@Repository
public class MessageRepositoryCustomImpl {

    private final MongoTemplate mongoTemplate;

    public void bulkUpdateReadStatus(
            List<String> messageIds,
            String userId,
            LocalDateTime readAt
    ) {
        Query query = new Query(
                Criteria.where("_id").in(messageIds)
        );

        Update update = new Update()
                .set("readers." + userId, readAt);

        mongoTemplate.updateMulti(query, update, Message.class);
    }
}
