package com.soundowner.library.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "user_albums")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserAlbum {

    @EmbeddedId
    private UserAlbumId id;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("albumId") // Связывает поле id.albumId с этой колонкой
    @JoinColumn(name = "album_id")
    private Album album;

    @Column(nullable = false)
    private Integer position;
}
