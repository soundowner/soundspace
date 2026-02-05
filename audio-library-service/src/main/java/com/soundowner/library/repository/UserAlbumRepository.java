package com.soundowner.library.repository;

import com.soundowner.library.entity.UserAlbum;
import com.soundowner.library.entity.UserAlbumId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface UserAlbumRepository extends JpaRepository<UserAlbum, UserAlbumId> {
    
    @Query("SELECT ua FROM UserAlbum ua JOIN FETCH ua.album a JOIN FETCH a.artist WHERE ua.id.userId = :userId ORDER BY ua.position ASC")
    List<UserAlbum> findAllByUserIdWithAlbums(@Param("userId") UUID userId);

    @Query("SELECT COALESCE(MAX(ua.position), 0) FROM UserAlbum ua WHERE ua.id.userId = :userId")
    int findMaxPositionByUserId(@Param("userId") UUID userId);
}
