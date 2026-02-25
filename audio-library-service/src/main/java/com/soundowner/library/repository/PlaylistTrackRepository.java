package com.soundowner.library.repository;

import com.soundowner.library.entity.PlaylistTrack;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface PlaylistTrackRepository extends JpaRepository<PlaylistTrack, UUID> {
    
    @Query("SELECT pt FROM PlaylistTrack pt " +
           "JOIN FETCH pt.track t " +
           "LEFT JOIN FETCH t.album a " +
           "LEFT JOIN FETCH a.artist " +
           "WHERE pt.playlist.id = :playlistId " +
           "ORDER BY pt.position ASC")
    List<PlaylistTrack> findAllByPlaylistIdWithTracks(@Param("playlistId") UUID playlistId);

    @Query("SELECT COALESCE(MAX(pt.position), 0) FROM PlaylistTrack pt WHERE pt.playlist.id = :playlistId")
    int findMaxPositionByPlaylistId(@Param("playlistId") UUID playlistId);

    long countByPlaylistId(UUID playlistId);

    @Modifying
    @Query("DELETE FROM PlaylistTrack pt WHERE pt.playlist.id = :playlistId AND pt.track.id = :trackId")
    void deleteByPlaylistIdAndTrackId(@Param("playlistId") UUID playlistId, @Param("trackId") Long trackId);
}
