package com.soundowner.library.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "user_artists")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserArtist {

    @EmbeddedId
    private UserArtistId id;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("artistId")
    @JoinColumn(name = "artist_id")
    private Artist artist;

    @Column(nullable = false)
    private Integer position;
}
