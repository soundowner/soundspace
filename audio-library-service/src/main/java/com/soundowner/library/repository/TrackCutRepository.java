package com.soundowner.library.repository;

import com.soundowner.library.entity.TrackCut;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
public interface TrackCutRepository extends JpaRepository<TrackCut, UUID> {
    List<TrackCut> findByUserIdAndTrackIdOrderByStartTimeAsc(UUID userId, String trackId);
    void deleteByUserIdAndTrackId(UUID userId, String trackId);
}
