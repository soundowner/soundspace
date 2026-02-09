package com.soundowner.library.repository;

import com.soundowner.library.entity.Playlist;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface PlaylistRepository extends JpaRepository<Playlist, UUID> {
    List<Playlist> findAllByUserIdOrderByCreatedAtDesc(UUID userId);
}
