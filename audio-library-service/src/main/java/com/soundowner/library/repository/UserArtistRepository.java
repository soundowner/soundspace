package com.soundowner.library.repository;

import com.soundowner.library.entity.UserArtist;
import com.soundowner.library.entity.UserArtistId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface UserArtistRepository extends JpaRepository<UserArtist, UserArtistId> {
    
    @Query("SELECT ua FROM UserArtist ua JOIN FETCH ua.artist WHERE ua.id.userId = :userId ORDER BY ua.position ASC")
    List<UserArtist> findAllByUserIdWithArtists(@Param("userId") UUID userId);

    @Query("SELECT ua.id.artistId FROM UserArtist ua WHERE ua.id.userId = :userId")
    List<Long> findAllArtistIdsByUserId(@Param("userId") UUID userId);

    @Query("SELECT COALESCE(MAX(ua.position), 0) FROM UserArtist ua WHERE ua.id.userId = :userId")
    int findMaxPositionByUserId(@Param("userId") UUID userId);
}
