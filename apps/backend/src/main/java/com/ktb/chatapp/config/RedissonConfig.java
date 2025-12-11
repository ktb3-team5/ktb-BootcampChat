package com.ktb.chatapp.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.codec.JsonJacksonCodec;
import org.redisson.config.Config;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Slf4j
@Configuration
public class RedissonConfig {

    @Value("${spring.data.redis.host}")
    private String redisHost;

    @Value("${spring.data.redis.port}")
    private int redisPort;

    @Bean
    public RedissonClient redissonClient(ObjectMapper objectMapper) {
        Config config = new Config();
        config.setCodec(new JsonJacksonCodec(objectMapper));

        config.useSingleServer()
                .setAddress("redis://" + redisHost + ":" + redisPort)
                .setConnectionPoolSize(16)
                .setConnectionMinimumIdleSize(4);

        log.info("RedissonClient initialized. Redis = {}:{}", redisHost, redisPort);

        return Redisson.create(config);
    }
}
