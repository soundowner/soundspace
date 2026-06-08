package com.soundowner.library.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;
import java.util.UUID;

@Data
public class PlaylistDto {
    private UUID id;
    private String title;
    private String description;
    private String coverImage;
    private long trackCount;

    @JsonProperty("track_covers")
    private List<String> trackCovers;
}
