package com.soundowner.library.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "track_cuts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TrackCut {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "track_id", nullable = false)
    private String trackId;

    @Column(name = "start_time", nullable = false, precision = 8, scale = 3)
    private BigDecimal startTime;

    @Column(name = "end_time", nullable = false, precision = 8, scale = 3)
    private BigDecimal endTime;
}
