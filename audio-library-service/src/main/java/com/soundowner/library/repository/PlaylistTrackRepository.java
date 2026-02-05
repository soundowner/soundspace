package com.soundowner.library.repository;

import com.soundowner.library.entity.PlaylistTrack;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface PlaylistTrackRepository extends JpaRepository<PlaylistTrack, UUID> {
    
    @Query("SELECT pt FROM PlaylistTrack pt JOIN FETCH pt.track WHERE pt.playlist.id = :playlistId ORDER BY pt.position ASC")
    List<PlaylistTrack> findAllByPlaylistIdWithTracks(@Param("playlistId") UUID playlistId);

    @Query("SELECT COALESCE(MAX(pt.position), 0) FROM PlaylistTrack pt WHERE pt.playlist.id = :playlistId")
    int findMaxPositionByPlaylistId(@Param("playlistId") UUID playlistId);

    void deleteByPlaylistIdAndTrackId(UUID playlistId, Long trackId);
}
