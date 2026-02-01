package com.soundowner.auth.service;

import com.soundowner.auth.controller.dto.RegisterRequest;
import com.soundowner.auth.controller.dto.UserProfileResponse;
import com.soundowner.auth.db.entity.AuthProvider;
import com.soundowner.auth.db.entity.Role;
import com.soundowner.auth.db.entity.User;
import com.soundowner.auth.db.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public UserProfileResponse getUserProfile(String userId) {
        User user = userRepository.findById(java.util.UUID.fromString(userId))
                .orElseThrow(() -> new RuntimeException("User not found"));
        
        return new UserProfileResponse(user.getEmail(), user.getDisplayName(), user.getAvatarUrl());
    }

    public String[] login(String email, String password) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Invalid email or password"));

        if (!passwordEncoder.matches(password, user.getPassword())) {
            throw new RuntimeException("Invalid email or password");
        }

        return new String[]{
            jwtService.generateAccessToken(user),
            jwtService.generateRefreshToken(user)
        };
    }

    @Transactional
    public void register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new RuntimeException("User with this email already exists");
        }

        User user = User.builder()
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .displayName(request.getDisplayName())
                .provider(AuthProvider.LOCAL)
                .role(Role.USER)
                .build();

        userRepository.save(user);
    }
}