package com.soundowner.library.dto;

import lombok.Data;
import java.util.List;

@Data
public class SpotifyPlaylistImportRequestDto {
    private String playlistTitle;
    private List<SpotifyImportRequestDto> tracks;
}
