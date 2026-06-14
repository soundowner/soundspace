package com.soundowner.library.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class YoutubeImportResponseDto {
    private int found;
    private int total;
}
