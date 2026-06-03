package com.soundowner.library.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "user_tracks")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserTrack {

    @EmbeddedId
    private UserTrackId id;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("trackId")
    @JoinColumn(name = "track_id")
    private Track track;

    @Column(nullable = false)
    private Integer position;
}
