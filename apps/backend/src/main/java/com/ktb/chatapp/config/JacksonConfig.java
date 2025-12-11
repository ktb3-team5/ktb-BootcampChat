package com.ktb.chatapp.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
public class JacksonConfig {

    @Bean
    @Primary
    public ObjectMapper objectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        // Java 8 date/time 모듈 등록
        mapper.registerModule(new JavaTimeModule());
        // LocalDateTime을 ISO-8601 형식 문자열로 직렬화 (타임스탬프 대신)
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        // 모든 Jackson 모듈 자동 검색 및 등록
        mapper.findAndRegisterModules();
        return mapper;
    }
}
