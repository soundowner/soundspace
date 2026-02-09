package com.soundowner.library.service;

import com.soundowner.library.entity.*;
import com.soundowner.library.repository.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LibraryServiceTest {

    @Mock private ArtistRepository artistRepository;
    @Mock private AlbumRepository albumRepository;
    @Mock private TrackRepository trackRepository;
    @Mock private UserAlbumRepository userAlbumRepository;
    @Mock private PlaylistRepository playlistRepository;
    @Mock private PlaylistTrackRepository playlistTrackRepository;

    @InjectMocks
    private LibraryService libraryService;

    @Test
    void addAlbumToLibrary_ShouldSaveEverything_WhenNothingExists() {
        // Given
        UUID userId = UUID.randomUUID();
        Artist artist = Artist.builder().id(100L).name("Test Artist").build();
        Album album = Album.builder().id("album1").artist(artist).title("Test Album").build();
        Track track = Track.builder().id(10L).title("Test Track").build();
        
        when(artistRepository.findById(100L)).thenReturn(Optional.empty());
        when(artistRepository.save(any())).thenReturn(artist);
        
        when(albumRepository.findById("album1")).thenReturn(Optional.empty());
        when(albumRepository.save(any())).thenReturn(album);
        
        when(trackRepository.findById(10L)).thenReturn(Optional.empty());
        when(trackRepository.save(any())).thenReturn(track);
        
        when(userAlbumRepository.existsById(any(UserAlbumId.class))).thenReturn(false);
        when(userAlbumRepository.findMaxPositionByUserId(userId)).thenReturn(0);

        // When
        libraryService.addAlbumToLibrary(userId, album, List.of(track));

        // Then
        verify(artistRepository).save(any());
        verify(albumRepository).save(any());
        verify(trackRepository).save(any());
        verify(userAlbumRepository).save(any(UserAlbum.class));
    }

    @Test
    void addAlbumToLibrary_ShouldSkipExistingMetadata_AndOnlyLinkUser() {
        // Given
        UUID userId = UUID.randomUUID();
        Artist artist = Artist.builder().id(100L).build();
        Album album = Album.builder().id("album1").artist(artist).build();
        Track track = Track.builder().id(10L).build();

        // Metadata already in DB
        when(artistRepository.findById(100L)).thenReturn(Optional.of(artist));
        when(albumRepository.findById("album1")).thenReturn(Optional.of(album));
        when(trackRepository.findById(10L)).thenReturn(Optional.of(track));
        
        // Link does not exist
        when(userAlbumRepository.existsById(any(UserAlbumId.class))).thenReturn(false);

        // When
        libraryService.addAlbumToLibrary(userId, album, List.of(track));

        // Then
        verify(artistRepository, never()).save(any());
        verify(albumRepository, never()).save(any());
        verify(trackRepository, never()).save(any());
        verify(userAlbumRepository).save(any(UserAlbum.class));
    }

    @Test
    void addTrackToPlaylist_ShouldSaveTrackAndParents_ThenLink() {
        // Given
        UUID playlistId = UUID.randomUUID();
        Playlist playlist = new Playlist();
        
        Artist artist = Artist.builder().id(50L).build();
        Album album = Album.builder().id("alb50").artist(artist).build();
        Track track = Track.builder().id(500L).album(album).build();

        when(playlistRepository.findById(playlistId)).thenReturn(Optional.of(playlist));
        
        // Artist & Album exist
        when(artistRepository.findById(50L)).thenReturn(Optional.of(artist));
        when(albumRepository.findById("alb50")).thenReturn(Optional.of(album));
        // Track is new
        when(trackRepository.findById(500L)).thenReturn(Optional.empty());
        when(trackRepository.save(any())).thenReturn(track);

        // When
        libraryService.addTrackToPlaylist(playlistId, track);

        // Then
        verify(artistRepository, never()).save(any());
        verify(albumRepository, never()).save(any());
        verify(trackRepository).save(any()); 
        verify(playlistTrackRepository).save(any(PlaylistTrack.class));
    }
}