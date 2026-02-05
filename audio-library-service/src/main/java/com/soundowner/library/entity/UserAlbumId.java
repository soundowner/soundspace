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
public class UserAlbumId implements Serializable {

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "album_id")
    private String albumId;
}
