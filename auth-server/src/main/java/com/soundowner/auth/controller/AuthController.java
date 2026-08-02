package com.soundowner.auth.controller;

import com.soundowner.auth.controller.dto.LoginRequest;
import com.soundowner.auth.controller.dto.RegisterRequest;
import com.soundowner.auth.controller.dto.UserProfileResponse;
import com.soundowner.auth.controller.dto.SpotifyConfigResponse;
import com.soundowner.auth.service.AuthService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.HttpEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import java.util.Base64;
import java.util.Map;
import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping // Gateway strips /auth, so we use root mapping here
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @Value("${SPOTIFY_CLIENT_ID:}")
    private String spotifyClientId;

    @Value("${SPOTIFY_CLIENT_SECRET:}")
    private String spotifyClientSecret;

    @GetMapping("/config/spotify")
    public ResponseEntity<SpotifyConfigResponse> getSpotifyConfig() {
        return ResponseEntity.ok(new SpotifyConfigResponse(spotifyClientId));
    }

    @GetMapping("/config/spotify/token")
    public ResponseEntity<Map<String, Object>> getSpotifyToken() {
        if (spotifyClientId == null || spotifyClientId.isEmpty() ||
            spotifyClientSecret == null || spotifyClientSecret.isEmpty()) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Spotify credentials are not configured on the server."));
        }
        try {
            RestTemplate restTemplate = new RestTemplate();
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            String auth = spotifyClientId + ":" + spotifyClientSecret;
            String encodedAuth = Base64.getEncoder().encodeToString(auth.getBytes(StandardCharsets.UTF_8));
            headers.set("Authorization", "Basic " + encodedAuth);

            MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
            body.add("grant_type", "client_credentials");

            HttpEntity<MultiValueMap<String, String>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.postForEntity("https://accounts.spotify.com/api/token", entity, Map.class);
            
            @SuppressWarnings("unchecked")
            Map<String, Object> responseBody = (Map<String, Object>) response.getBody();
            return ResponseEntity.ok(responseBody);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "Failed to retrieve token from Spotify: " + e.getMessage()));
        }
    }

    @GetMapping("/refresh")
    public ResponseEntity<Void> refresh(
            @CookieValue(value = "REFRESH_TOKEN", required = false) String refreshToken,
            HttpServletResponse response,
            HttpServletRequest request
    ) {

        if (refreshToken == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        try {
            String[] newTokens = authService.refreshToken(refreshToken);

            boolean isSecure = request.isSecure();

            Cookie accessCookie = new Cookie("ACCESS_TOKEN", newTokens[0]);
            accessCookie.setHttpOnly(true);
            accessCookie.setPath("/");
            accessCookie.setMaxAge(900);
            accessCookie.setSecure(isSecure);
            response.addCookie(accessCookie);

            Cookie refreshCookie = new Cookie("REFRESH_TOKEN", newTokens[1]);
            refreshCookie.setHttpOnly(true);
            refreshCookie.setPath("/");
            refreshCookie.setMaxAge(604800);
            refreshCookie.setSecure(isSecure);
            response.addCookie(refreshCookie);

            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            System.err.println("Refresh failed: " + e.getMessage());

            Cookie deleteAccess = new Cookie("ACCESS_TOKEN", null);
            deleteAccess.setPath("/");
            deleteAccess.setMaxAge(0);
            response.addCookie(deleteAccess);

            Cookie deleteRefresh = new Cookie("REFRESH_TOKEN", null);
            deleteRefresh.setPath("/");
            deleteRefresh.setMaxAge(0);
            response.addCookie(deleteRefresh);

            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
    }

    @PostMapping("/register")
    public ResponseEntity<String> register(@Valid @RequestBody RegisterRequest request) {
        authService.register(request);
        return ResponseEntity.ok("User registered successfully");
    }

    @PostMapping("/login")
    public ResponseEntity<String> login(@Valid @RequestBody LoginRequest request, jakarta.servlet.http.HttpServletResponse response) {
        String[] tokens = authService.login(request.getEmail(), request.getPassword());

        jakarta.servlet.http.Cookie accessCookie = new jakarta.servlet.http.Cookie("ACCESS_TOKEN", tokens[0]);
        accessCookie.setHttpOnly(true);
        accessCookie.setPath("/");
        accessCookie.setMaxAge(900);
        response.addCookie(accessCookie);

        jakarta.servlet.http.Cookie refreshCookie = new jakarta.servlet.http.Cookie("REFRESH_TOKEN", tokens[1]);
        refreshCookie.setHttpOnly(true);
        refreshCookie.setPath("/"); // Устанавливаем корень
        refreshCookie.setMaxAge(604800);
        response.addCookie(refreshCookie);

        return ResponseEntity.ok("Login successful");
    }

    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> getCurrentUser(@RequestHeader("X-User-Id") String userId) {
        return ResponseEntity.ok(authService.getUserProfile(userId));
    }
}
