package com.soundowner.auth.controller.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class UserProfileResponse {
    private String email;
    private String displayName;
    private String avatarUrl;
}
