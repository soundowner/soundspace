package com.soundowner.library.controller;

import com.soundowner.library.dto.*;
import com.soundowner.library.entity.*;
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

    @GetMapping("/artists/ids")
    public ResponseEntity<List<Long>> getMyArtistIds(
            @RequestHeader("X-User-Id") UUID userId) {
        return ResponseEntity.ok(libraryService.getUserArtistIds(userId));
    }

    @GetMapping("/albums/ids")
    public ResponseEntity<List<String>> getMyAlbumIds(
            @RequestHeader("X-User-Id") UUID userId) {
        return ResponseEntity.ok(libraryService.getUserAlbumIds(userId));
    }

    @GetMapping("/artists")
    public ResponseEntity<List<ArtistDto>> getMyArtists(
            @RequestHeader("X-User-Id") UUID userId) {
        var entities = libraryService.getUserArtists(userId);
        var dtos = entities.stream()
                .map(ua -> libraryMapper.toArtistDto(ua.getArtist()))
                .collect(Collectors.toList());
        return ResponseEntity.ok(dtos);
    }
    @GetMapping("/albums")
    public ResponseEntity<List<AlbumDto>> getMyAlbums(
            @RequestHeader("X-User-Id") UUID userId) {
        var entities = libraryService.getUserAlbums(userId);
        var dtos = entities.stream()
                .map(ua -> libraryMapper.toAlbumDto(ua.getAlbum()))
                .collect(Collectors.toList());
        return ResponseEntity.ok(dtos);
    }

    @GetMapping("/tracks/ids")
    public ResponseEntity<List<Long>> getMyTrackIds(
            @RequestHeader("X-User-Id") UUID userId) {
        return ResponseEntity.ok(libraryService.getUserTrackIds(userId));
    }

    @GetMapping("/tracks")
    public ResponseEntity<List<TrackDto>> getMyTracks(
            @RequestHeader("X-User-Id") UUID userId) {
        var entities = libraryService.getUserTracks(userId);
        var dtos = entities.stream()
                .map(ut -> libraryMapper.toTrack(ut.getTrack()))
                .collect(Collectors.toList());
        return ResponseEntity.ok(dtos);
    }
    /**
     * Добавить артиста в библиотеку пользователя.
     */
    @PostMapping("/artists")
    public ResponseEntity<Void> addArtistToLibrary(
            @RequestHeader("X-User-Id") UUID userId,
            @RequestBody ArtistDto artistDto) {

        Artist artist = libraryMapper.toArtist(artistDto);
        libraryService.addArtistToLibrary(userId, artist);

        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/artists/{artistId}")
    public ResponseEntity<Void> removeArtistFromLibrary(
            @RequestHeader("X-User-Id") UUID userId,
            @PathVariable Long artistId) {
        
        libraryService.removeArtistFromLibrary(userId, artistId);
        return ResponseEntity.ok().build();
    }

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

    @DeleteMapping("/albums/{albumId}")
    public ResponseEntity<Void> removeAlbumFromLibrary(
            @RequestHeader("X-User-Id") UUID userId,
            @PathVariable String albumId) {
        
        libraryService.removeAlbumFromLibrary(userId, albumId);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/tracks")
    public ResponseEntity<Void> addTrackToLibrary(
            @RequestHeader("X-User-Id") UUID userId,
            @RequestBody TrackDto trackDto) {
        
        Track track = libraryMapper.toTrack(trackDto);
        libraryService.addTrackToLibrary(userId, track);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/tracks/{trackId}")
    public ResponseEntity<Void> removeTrackFromLibrary(
            @RequestHeader("X-User-Id") UUID userId,
            @PathVariable Long trackId) {
        
        libraryService.removeTrackFromLibrary(userId, trackId);
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

    @PostMapping("/playlists")
    public ResponseEntity<PlaylistDto> createPlaylist(
            @RequestHeader("X-User-Id") UUID userId,
            @RequestBody PlaylistDto dto) {
        
        Playlist playlist = new Playlist();
        playlist.setUserId(userId);
        playlist.setTitle(dto.getTitle());
        playlist.setDescription(dto.getDescription());
        
        Playlist created = libraryService.createPlaylist(playlist);
        return ResponseEntity.ok(libraryMapper.toPlaylistDto(created));
    }

    @GetMapping("/playlists")
    public ResponseEntity<List<PlaylistDto>> getMyPlaylists(
            @RequestHeader("X-User-Id") UUID userId) {
        
        var playlists = libraryService.getUserPlaylists(userId);
        var dtos = libraryMapper.toPlaylistDtoList(playlists);
        
        // Populate trackCount and trackCovers for each DTO
        for (var dto : dtos) {
            int count = libraryService.getPlaylistTracksCount(dto.getId());
            dto.setTrackCount(count);
            var covers = libraryService.getFirst4TrackCovers(dto.getId());
            dto.setTrackCovers(covers);
        }
        
        return ResponseEntity.ok(dtos);
    }

    @GetMapping("/playlists/{playlistId}/tracks")
    public ResponseEntity<List<TrackDto>> getPlaylistTracks(@PathVariable UUID playlistId) {
        var playlistTracks = libraryService.getPlaylistTracks(playlistId);
        
        // Map List<PlaylistTrack> -> List<TrackDto>
        List<TrackDto> tracks = playlistTracks.stream()
                .map(pt -> libraryMapper.toTrack(pt.getTrack()))
                .collect(Collectors.toList());
                
        return ResponseEntity.ok(tracks);
    }

    @DeleteMapping("/playlists/{playlistId}/tracks/{trackId}")
    public ResponseEntity<Void> removeTrackFromPlaylist(
            @PathVariable UUID playlistId,
            @PathVariable Long trackId) {
        
        libraryService.removeTrackFromPlaylist(playlistId, trackId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/cuts")
    public ResponseEntity<List<TrackCutDto>> getTrackCuts(
            @RequestHeader("X-User-Id") UUID userId,
            @RequestParam("trackId") String trackId) {
        var entities = libraryService.getTrackCuts(userId, trackId);
        var dtos = entities.stream()
                .map(entity -> {
                    TrackCutDto dto = new TrackCutDto();
                    dto.setStartTime(entity.getStartTime());
                    dto.setEndTime(entity.getEndTime());
                    return dto;
                })
                .collect(Collectors.toList());
        return ResponseEntity.ok(dtos);
    }

    @PostMapping("/cuts")
    public ResponseEntity<Void> saveTrackCuts(
            @RequestHeader("X-User-Id") UUID userId,
            @RequestParam("trackId") String trackId,
            @RequestBody List<TrackCutDto> dtos) {
        var entities = dtos.stream()
                .map(dto -> TrackCut.builder()
                        .startTime(dto.getStartTime())
                        .endTime(dto.getEndTime())
                        .build())
                .collect(Collectors.toList());
        libraryService.saveTrackCuts(userId, trackId, entities);
        return ResponseEntity.ok().build();
    }
}