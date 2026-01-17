package com.soundowner.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "qobuz")
@Data
public class QobuzProperties {
    private String appId;
    private String appSecret;
    private String qobuzBaseUrl;
    private String userAuthToken;
    private String userAlternativeAuthToken;
}
