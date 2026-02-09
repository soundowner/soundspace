package com.soundowner.library.dto;

import lombok.Data;
import java.util.UUID;

@Data
public class PlaylistDto {
    private UUID id;
    private String title;
    private String description;
    private String coverImage;
    private long trackCount;
}
