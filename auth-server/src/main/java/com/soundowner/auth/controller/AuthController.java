package com.soundowner.auth.controller;

import com.soundowner.auth.controller.dto.LoginRequest;
import com.soundowner.auth.controller.dto.RegisterRequest;
import com.soundowner.auth.controller.dto.UserProfileResponse;
import com.soundowner.auth.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping // Gateway strips /auth, so we use root mapping here
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

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
