package com.soundowner.library.dto;

import lombok.Data;
import java.util.List;

@Data
public class YoutubePlaylistImportRequestDto {
    private String playlistTitle;
    private List<YoutubeImportRequestDto> tracks;
}
