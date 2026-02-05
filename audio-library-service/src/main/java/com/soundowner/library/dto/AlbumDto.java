package com.soundowner.library.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

@Data
public class AlbumDto {
    private String id;
    private String title;
    private String version;
    private String subtitle;
    private String upc;
    private String url;
    
    @JsonProperty("qobuz_id")
    private Integer qobuzId;
    
    @JsonProperty("is_official")
    private Boolean isOfficial;
    
    @JsonProperty("tracks_count")
    private Integer tracksCount;
    
    private Integer duration;
    
    @JsonProperty("maximum_bit_depth")
    private Integer maximumBitDepth;
    
    @JsonProperty("maximum_sampling_rate")
    private Float maximumSamplingRate;
    
    @JsonProperty("maximum_technical_specifications")
    private String maximumTechnicalSpecifications;
    
    private Boolean hires;
    
    @JsonProperty("release_date_original")
    private String releaseDateOriginal; // String from JSON, map to LocalDate later
    
    @JsonProperty("release_type")
    private String releaseType;
    
    private Integer popularity;
    private String description;
    
    private ArtistDto.Image image; // Reusing Image class structure
    
    private ArtistDto artist; // Nested Artist
    
    @JsonProperty("genre_id")
    private Integer genreId;
    
    private TracksWrapper tracks;

    @Data
    public static class TracksWrapper {
        private List<TrackDto> items;
    }
}
