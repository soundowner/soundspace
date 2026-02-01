package com.soundowner.auth.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.soundowner.auth.controller.dto.LoginRequest;
import com.soundowner.auth.controller.dto.RegisterRequest;
import com.soundowner.auth.service.AuthService;
import com.soundowner.auth.service.CustomOAuth2UserService;
import com.soundowner.auth.config.OAuth2SuccessHandler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthController.class)
class AuthControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private AuthService authService;

    // Мокаем зависимости безопасности, которые нужны для контекста
    @MockBean
    private CustomOAuth2UserService customOAuth2UserService;
    @MockBean
    private OAuth2SuccessHandler oauth2SuccessHandler;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @WithMockUser
    void shouldRegisterNewUser() throws Exception {
        RegisterRequest request = new RegisterRequest();
        request.setEmail("test@test.com");
        request.setPassword("password");
        request.setDisplayName("Test User");

        mockMvc.perform(post("/register")
                .with(csrf()) // Spring Security требует CSRF для POST
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(content().string("User registered successfully"));
    }

    @Test
    @WithMockUser
    void shouldLoginSuccessfully() throws Exception {
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("login@test.com");
        loginRequest.setPassword("password");

        String[] mockTokens = {"access-token", "refresh-token"};
        when(authService.login(anyString(), anyString())).thenReturn(mockTokens);

        mockMvc.perform(post("/login")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andExpect(cookie().exists("ACCESS_TOKEN"))
                .andExpect(cookie().value("ACCESS_TOKEN", "access-token"))
                .andExpect(cookie().exists("REFRESH_TOKEN"));
    }
}