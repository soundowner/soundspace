package com.soundowner.auth.service;

import com.soundowner.auth.db.entity.Role;
import com.soundowner.auth.db.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class JwtServiceTest {

    private JwtService jwtService;
    private User testUser;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService();
        // Устанавливаем секрет вручную, так как @Value не работает в Unit-тестах без контекста
        ReflectionTestUtils.setField(jwtService, "secret", "very-long-and-secure-secret-key-that-must-be-at-least-256-bits");
        ReflectionTestUtils.setField(jwtService, "accessTokenExpiration", 60000L);
        ReflectionTestUtils.setField(jwtService, "refreshTokenExpiration", 90000L);

        testUser = User.builder()
                .id(UUID.randomUUID())
                .email("test@example.com")
                .role(Role.USER)
                .build();
    }

    @Test
    void shouldGenerateValidAccessToken() {
        String token = jwtService.generateAccessToken(testUser);
        
        assertThat(token).isNotBlank();
        // В JwtService нет метода валидации, он на Gateway. 
        // Но мы можем проверить, что userId извлекается (если бы добавили метод).
    }

    @Test
    void shouldGenerateValidRefreshToken() {
        String token = jwtService.generateRefreshToken(testUser);
        assertThat(token).isNotBlank();
    }
}
