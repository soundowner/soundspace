package com.soundowner.gateway.config;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;

class JwtUtilsTest {

    private JwtUtils jwtUtils;
    private final String SECRET = "very-long-and-secure-secret-key-that-must-be-at-least-256-bits";

    @BeforeEach
    void setUp() {
        jwtUtils = new JwtUtils();
        ReflectionTestUtils.setField(jwtUtils, "secret", SECRET);
    }

    @Test
    void isTokenValid_ShouldReturnTrue_ForValidToken() {
        String token = createToken("user-123", 1000 * 60); // 1 min
        assertThat(jwtUtils.isTokenValid(token)).isTrue();
    }

    @Test
    void isTokenValid_ShouldReturnFalse_ForExpiredToken() {
        String token = createToken("user-123", -1000); // Expired 1 sec ago
        assertThat(jwtUtils.isTokenValid(token)).isFalse();
    }

    @Test
    void extractUserId_ShouldReturnCorrectId() {
        String token = createToken("user-999", 1000 * 60);
        assertThat(jwtUtils.extractUserId(token)).isEqualTo("user-999");
    }

    private String createToken(String subject, long expirationMs) {
        byte[] keyBytes = SECRET.getBytes(StandardCharsets.UTF_8);
        SecretKey key = Keys.hmacShaKeyFor(keyBytes);

        return Jwts.builder()
                .setSubject(subject)
                .setExpiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(key, SignatureAlgorithm.HS256)
                .compact();
    }
}
