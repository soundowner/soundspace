package com.soundowner.library.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;

@Entity
@Table(name = "tracks")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Track {

    @Id
    private Long id; // Qobuz Track ID

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "album_id")
    private Album album;

    @Column(nullable = false, length = 500)
    private String title;

    private String version;

    @Column(length = 50)
    private String isrc;

    private Integer duration;

    @Column(name = "track_number")
    private Integer trackNumber;

    @Column(columnDefinition = "TEXT")
    private String performers;

    @Column(name = "parental_warning")
    @Builder.Default
    private Boolean parentalWarning = false;

    // Technical
    @Builder.Default
    private Boolean hires = false;

    @Column(name = "maximum_bit_depth")
    private Integer maximumBitDepth;

    @Column(name = "maximum_sampling_rate")
    private Float maximumSamplingRate;

    @Column(name = "maximum_technical_specifications")
    private String maximumTechnicalSpecifications;

    @Column(name = "release_date_original")
    private LocalDate releaseDateOriginal;
}
