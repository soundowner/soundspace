package com.soundowner.auth.service;

import com.soundowner.auth.db.entity.AuthProvider;
import com.soundowner.auth.db.entity.Role;
import com.soundowner.auth.db.entity.User;
import com.soundowner.auth.db.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class CustomOAuth2UserService extends DefaultOAuth2UserService {

    private final UserRepository userRepository;

    @Override
    public OAuth2User loadUser(OAuth2UserRequest userRequest) throws OAuth2AuthenticationException {
        // 1. Spring уже обменял 'code' на токены и теперь загружает профиль
        OAuth2User oAuth2User = super.loadUser(userRequest);
        
        try {
            return processOAuth2User(oAuth2User);
        } catch (Exception ex) {
            log.error("Error processing OAuth2 user", ex);
            throw new OAuth2AuthenticationException(ex.getMessage());
        }
    }

    private OAuth2User processOAuth2User(OAuth2User oAuth2User) {
        String email = oAuth2User.getAttribute("email");
        String name = oAuth2User.getAttribute("name");
        String picture = oAuth2User.getAttribute("picture");
        String sub = oAuth2User.getAttribute("sub"); // Google Unique ID

        Optional<User> userOptional = userRepository.findByEmail(email);
        
        User user;
        if (userOptional.isPresent()) {
            user = userOptional.get();
            log.info("Updating existing user: {}", email);
            user.setDisplayName(name);
            user.setAvatarUrl(picture);
        } else {
            log.info("Creating new user from Google: {}", email);
            user = User.builder()
                    .email(email)
                    .displayName(name)
                    .avatarUrl(picture)
                    .provider(AuthProvider.GOOGLE)
                    .providerId(sub)
                    .role(Role.USER)
                    .build();
        }
        userRepository.save(user);
        
        return oAuth2User;
    }
}
