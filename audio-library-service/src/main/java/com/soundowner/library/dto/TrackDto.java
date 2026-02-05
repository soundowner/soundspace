package com.soundowner.library.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class TrackDto {
    private Long id;
    private String title;
    private String version;
    private String isrc;
    private Integer duration;
    
    @JsonProperty("track_number")
    private Integer trackNumber;
    
    private String performers; // "Artist A, Artist B"
    
    @JsonProperty("parental_warning")
    private Boolean parentalWarning;
    
    private Boolean hires;
    
    @JsonProperty("maximum_bit_depth")
    private Integer maximumBitDepth;
    
    @JsonProperty("maximum_sampling_rate")
    private Float maximumSamplingRate;
    
    @JsonProperty("maximum_technical_specifications")
    private String maximumTechnicalSpecifications;
    
    @JsonProperty("release_date_original")
    private String releaseDateOriginal;

    private AlbumDto album; // Nested Album context
}
