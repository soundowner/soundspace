package com.soundowner.library.dto;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class TrackCutDto {
    private BigDecimal startTime;
    private BigDecimal endTime;
}
