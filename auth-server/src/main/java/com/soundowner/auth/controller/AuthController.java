package com.soundowner.auth.controller;

import com.soundowner.auth.controller.dto.LoginRequest;
import com.soundowner.auth.controller.dto.RegisterRequest;
import com.soundowner.auth.controller.dto.UserProfileResponse;
import com.soundowner.auth.service.AuthService;
import io.jsonwebtoken.io.IOException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping // Gateway strips /auth, so we use root mapping here
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    // ... импорты

    // Добавляем новый метод для обновления токенов
    // Для браузерного потока с редиректами лучше GET, так как 302 редирект всегда делает GET
    @GetMapping("/refresh")
    public void refresh(
            @CookieValue(value = "REFRESH_TOKEN", required = false) String refreshToken,
            HttpServletResponse response,
            HttpServletRequest request
    ) throws IOException, java.io.IOException {

        // 1. Если токена нет — отправляем логиниться
        if (refreshToken == null) {
            response.sendRedirect("http://localhost:8080/login"); // Чистый URL
            return;
        }

        try {
            // 2. Валидация и поход в БД (внутри сервиса)
            String[] newTokens = authService.refreshToken(refreshToken);

            // 3. Установка новых кук
            // Access Token (перезаписываем)
            Cookie accessCookie = new Cookie("ACCESS_TOKEN", newTokens[0]);
            accessCookie.setHttpOnly(true);
            accessCookie.setPath("/");
            accessCookie.setMaxAge(900); // 15 мин
            response.addCookie(accessCookie);

            // Refresh Token (продляем жизнь или меняем)
            Cookie refreshCookie = new Cookie("REFRESH_TOKEN", newTokens[1]);
            refreshCookie.setHttpOnly(true);
            refreshCookie.setPath("/auth/refresh"); // Важно!
            refreshCookie.setMaxAge(604800); // 7 дней
            response.addCookie(refreshCookie);

            // 4. Редирект домой (Clean URL)
            response.sendRedirect("http://localhost:8080/");

        } catch (Exception e) {
            // Если токен невалиден или юзер удален из БД
            // Очищаем куки
            Cookie deleteAccess = new Cookie("ACCESS_TOKEN", null);
            deleteAccess.setPath("/");
            deleteAccess.setMaxAge(0);
            response.addCookie(deleteAccess);

            response.sendRedirect("http://localhost:8080/login");
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
        refreshCookie.setPath("/auth/refresh");
        refreshCookie.setMaxAge(604800);
        response.addCookie(refreshCookie);

        return ResponseEntity.ok("Login successful");
    }

    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> getCurrentUser(@RequestHeader("X-User-Id") String userId) {
        return ResponseEntity.ok(authService.getUserProfile(userId));
    }
}
