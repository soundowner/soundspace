package com.soundowner.library.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.*;

import java.io.Serializable;
import java.util.UUID;

@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class UserArtistId implements Serializable {

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "artist_id")
    private Long artistId;
}
