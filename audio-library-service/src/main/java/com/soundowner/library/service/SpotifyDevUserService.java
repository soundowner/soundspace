package com.soundowner.library.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class SpotifyDevUserService {

    private final RestTemplate restTemplate;

    @Value("${spotify.dev.client-id}")
    private String clientId;

    @Value("${spotify.dev.bearer-token}")
    private String bearerToken;

    @Value("${spotify.dev.cookie}")
    private String cookie;

    public boolean registerDevUser(String email) {
        if (email == null || email.trim().isEmpty()) {
            log.warn("Email is required for Spotify Dev User registration");
            return false;
        }

        String targetEmail = email.trim();
        String randomName = "User_" + UUID.randomUUID().toString().substring(0, 8);
        String url = "https://developer.spotify.com/api/ws4d/warp/clients/" + clientId + "/users";

        log.info("Attempting to register user {} ({}) in Spotify Developer Dashboard for client {}", randomName, targetEmail, clientId);

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "Bearer " + bearerToken);
            headers.set("Cookie", cookie);
            headers.set("Origin", "https://developer.spotify.com");
            headers.set("Referer", "https://developer.spotify.com/dashboard/" + clientId + "/users");
            headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36");

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("name", randomName);
            requestBody.put("email", targetEmail);
            requestBody.put("clientId", clientId);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                log.info("Successfully registered user {} in Spotify Developer Dashboard. Response: {}", targetEmail, response.getBody());
                return true;
            } else {
                log.warn("Failed to register user {} in Spotify Developer Dashboard. Status: {}", targetEmail, response.getStatusCode());
            }
        } catch (Exception e) {
            log.error("Exception occurred while registering user {} in Spotify Dev Dashboard: {}", targetEmail, e.getMessage());
        }
        return false;
    }
}
