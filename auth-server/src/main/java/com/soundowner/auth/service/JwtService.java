package com.soundowner.auth.service;

import com.soundowner.auth.db.entity.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

@Service
public class JwtService {

    @Value("${jwt.secret:very-long-and-secure-secret-key-that-must-be-at-least-256-bits}")
    private String secret;

    @Value("${jwt.access-token-expiration:900000}") // 15 mins
    private long accessTokenExpiration;

    @Value("${jwt.refresh-token-expiration:604800000}") // 7 days
    private long refreshTokenExpiration;

    // --- ГЕНЕРАЦИЯ ---

    public String generateAccessToken(User user) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", user.getRole().name());
        claims.put("email", user.getEmail()); // Кладем email в claim

        // Subject = ID пользователя (UUID)
        return buildToken(claims, user.getId().toString(), accessTokenExpiration);
    }

    public String generateRefreshToken(User user) {
        // ВАЖНО: Добавляем email и в Refresh токен тоже, иначе extractEmail вернет null
        Map<String, Object> claims = new HashMap<>();
        claims.put("email", user.getEmail());

        return buildToken(claims, user.getId().toString(), refreshTokenExpiration);
    }

    private String buildToken(Map<String, Object> extraClaims, String subject, long expiration) {
        return Jwts.builder()
                .claims(extraClaims)
                .subject(subject)
                .issuedAt(new Date(System.currentTimeMillis()))
                .expiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(getSigningKey(), Jwts.SIG.HS256) // Используем новый синтаксис JJWT (или SignatureAlgorithm.HS256 для старых версий)
                .compact();
    }

    // --- ВАЛИДАЦИЯ И ЧТЕНИЕ (Новые методы) ---

    public boolean isTokenValid(String token) {
        try {
            return !isTokenExpired(token);
        } catch (Exception e) {
            // Если подпись неверна или токен битый, parser кинет исключение
            return false;
        }
    }

    public String extractEmail(String token) {
        // Мы клали email в кастомный claim "email", а не в subject (там UUID)
        return extractClaim(token, claims -> claims.get("email", String.class));
    }

    // Если вдруг понадобится ID пользователя
    public String extractUserId(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    private boolean isTokenExpired(String token) {
        return extractExpiration(token).before(new Date());
    }

    private Date extractExpiration(String token) {
        return extractClaim(token, Claims::getExpiration);
    }

    private <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = extractAllClaims(token);
        return claimsResolver.apply(claims);
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private SecretKey getSigningKey() {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        return Keys.hmacShaKeyFor(keyBytes);
    }
}