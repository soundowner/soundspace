package com.soundowner.library.repository;

import com.soundowner.library.entity.UserTrack;
import com.soundowner.library.entity.UserTrackId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface UserTrackRepository extends JpaRepository<UserTrack, UserTrackId> {
    
    @Query("SELECT ut FROM UserTrack ut JOIN FETCH ut.track t LEFT JOIN FETCH t.album a LEFT JOIN FETCH a.artist WHERE ut.id.userId = :userId ORDER BY ut.position ASC")
    List<UserTrack> findAllByUserIdWithTracks(@Param("userId") UUID userId);

    @Query("SELECT ut.id.trackId FROM UserTrack ut WHERE ut.id.userId = :userId")
    List<Long> findAllTrackIdsByUserId(@Param("userId") UUID userId);

    @Query("SELECT COALESCE(MAX(ut.position), 0) FROM UserTrack ut WHERE ut.id.userId = :userId")
    int findMaxPositionByUserId(@Param("userId") UUID userId);
}
