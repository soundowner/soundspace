package com.soundowner.library.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;

@Entity
@Table(name = "albums")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Album {

    @Id
    @Column(length = 50)
    private String id; // String ID like "os6yu7ptl0krb"

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "artist_id")
    private Artist artist;

    @Column(name = "genre_id")
    private Integer genreId;

    @Column(nullable = false, length = 500)
    private String title;

    private String version;
    private String subtitle;

    @Column(name = "qobuz_id")
    private Integer qobuzId;

    @Column(length = 50)
    private String upc;

    @Column(length = 500)
    private String url;

    @Column(name = "is_official")
    @Builder.Default
    private Boolean isOfficial = true;

    // Stats
    @Column(name = "tracks_count")
    private Integer tracksCount;

    private Integer duration; // seconds

    @Column(name = "maximum_bit_depth")
    private Integer maximumBitDepth;

    @Column(name = "maximum_sampling_rate")
    private Float maximumSamplingRate;

    @Column(name = "maximum_technical_specifications")
    private String maximumTechnicalSpecifications;

    @Builder.Default
    private Boolean hires = false;

    // Dates
    @Column(name = "release_date_original")
    private LocalDate releaseDateOriginal;

    @Column(name = "release_type", length = 50)
    private String releaseType;

    private Integer popularity;

    @Column(columnDefinition = "TEXT")
    private String description;

    // Images
    @Column(name = "image_small", length = 500)
    private String imageSmall;

    @Column(name = "image_thumbnail", length = 500)
    private String imageThumbnail;

    @Column(name = "image_large", length = 500)
    private String imageLarge;
}
