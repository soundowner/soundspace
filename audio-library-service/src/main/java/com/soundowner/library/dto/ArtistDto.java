package com.soundowner.library.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;

@Data
public class ArtistDto {
    private Long id;
    private String name;
    private String slug;
    
    @JsonProperty("albums_count")
    private Integer albumsCount;
    
    private Image image;
    private Biography biography;
    
    @JsonProperty("similar_artist_ids")
    private List<Long> similarArtistIds;

    @Data
    public static class Image {
        private String small;
        private String medium;
        private String large;
    }

    @Data
    public static class Biography {
        private String content;
        private String summary;
    }
}
