package com.soundowner.library.controller;

import com.soundowner.library.dto.AlbumDto;
import com.soundowner.library.dto.PlaylistDto;
import com.soundowner.library.dto.TrackDto;
import com.soundowner.library.entity.Album;
import com.soundowner.library.entity.Track;
import com.soundowner.library.mapper.LibraryMapper;
import com.soundowner.library.service.LibraryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/library")
@RequiredArgsConstructor
public class LibraryController {

    private final LibraryService libraryService;
    private final LibraryMapper libraryMapper;

    /**
     * Добавить альбом в библиотеку пользователя.
     * Принимает полный JSON альбома (с треками).
     */
    @PostMapping("/albums")
    public ResponseEntity<Void> addAlbumToLibrary(
            @RequestHeader("X-User-Id") UUID userId,
            @RequestBody AlbumDto albumDto) {
        
        // 1. Map DTO -> Entity
        Album album = libraryMapper.toAlbum(albumDto);
        
        // 2. Extract Tracks from DTO and map them
        List<Track> tracks = null;
        if (albumDto.getTracks() != null && albumDto.getTracks().getItems() != null) {
            tracks = albumDto.getTracks().getItems().stream()
                    .map(libraryMapper::toTrack)
                    .collect(Collectors.toList());
        }

        // 3. Delegate to Service
        libraryService.addAlbumToLibrary(userId, album, tracks);

        return ResponseEntity.ok().build();
    }

    /**
     * Добавить трек в плейлист.
     * Принимает полный JSON трека (с вложенным альбомом).
     */
    @PostMapping("/playlists/{playlistId}/tracks")
    public ResponseEntity<Void> addTrackToPlaylist(
            @PathVariable UUID playlistId,
            @RequestBody TrackDto trackDto) {

        // 1. Map DTO -> Entity
        Track track = libraryMapper.toTrack(trackDto);

        // 2. Delegate to Service
        libraryService.addTrackToPlaylist(playlistId, track);

        return ResponseEntity.ok().build();
    }
    
    // TODO: Методы создания плейлистов, получения библиотеки и т.д.
}
