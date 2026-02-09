package com.soundowner.library.service;

import com.soundowner.library.entity.*;
import com.soundowner.library.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class LibraryService {

    private final ArtistRepository artistRepository;
    private final AlbumRepository albumRepository;
    private final TrackRepository trackRepository;
    private final PlaylistRepository playlistRepository;
    private final PlaylistTrackRepository playlistTrackRepository;
    private final UserAlbumRepository userAlbumRepository;

    @Transactional
    public void addAlbumToLibrary(UUID userId, Album album, List<Track> tracks) {
        log.debug("Adding album {} to library for user {}", album.getId(), userId);
        
        Artist managedArtist = saveArtistIfNotExist(album.getArtist());
        album.setArtist(managedArtist);
        
        Album managedAlbum = saveAlbumIfNotExist(album);
        
        if (tracks != null) {
            for (Track track : tracks) {
                track.setAlbum(managedAlbum);
                saveTrackIfNotExist(track);
            }
        }

        // Link user to album
        UserAlbumId uaId = new UserAlbumId(userId, managedAlbum.getId());
        if (!userAlbumRepository.existsById(uaId)) {
            int maxPos = userAlbumRepository.findMaxPositionByUserId(userId);
            UserAlbum ua = new UserAlbum();
            ua.setId(uaId);
            ua.setAlbum(managedAlbum);
            ua.setPosition(maxPos + 1);
            userAlbumRepository.save(ua);
        } else {
            log.debug("Album {} already in library for user {}", album.getId(), userId);
        }
    }

    @Transactional
    public void addTrackToPlaylist(UUID playlistId, Track track) {
        Playlist playlist = playlistRepository.findById(playlistId)
                .orElseThrow(() -> new RuntimeException("Playlist not found"));

        // Сначала сохраняем всю иерархию и получаем УПРАВЛЯЕМЫЙ трек
        Track managedTrack = ensureTrackHierarchySaved(track);

        int maxPos = playlistTrackRepository.findMaxPositionByPlaylistId(playlistId);
        
        PlaylistTrack pt = new PlaylistTrack();
        pt.setPlaylist(playlist);
        pt.setTrack(managedTrack);
        pt.setPosition(maxPos + 1);
        
        playlistTrackRepository.save(pt);
    }

    @Transactional
    public Playlist createPlaylist(Playlist playlist) {
        return playlistRepository.save(playlist);
    }

    @Transactional(readOnly = true)
    public List<Playlist> getUserPlaylists(UUID userId) {
        return playlistRepository.findAllByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional(readOnly = true)
    public List<PlaylistTrack> getPlaylistTracks(UUID playlistId) {
        return playlistTrackRepository.findAllByPlaylistIdWithTracks(playlistId);
    }

    @Transactional(readOnly = true)
    public int getPlaylistTracksCount(UUID playlistId) {
        // Use a standard count query or reusing max position if it's reliable
        // Better use count for accuracy
        return (int) playlistTrackRepository.countByPlaylistId(playlistId);
    }

    @Transactional
    public void removeTrackFromPlaylist(UUID playlistId, Long trackId) {
        playlistTrackRepository.deleteByPlaylistIdAndTrackId(playlistId, trackId);
    }

    private Track ensureTrackHierarchySaved(Track track) {
        if (track.getAlbum() != null) {
            if (track.getAlbum().getArtist() != null) {
                Artist managedArtist = saveArtistIfNotExist(track.getAlbum().getArtist());
                track.getAlbum().setArtist(managedArtist);
            }
            Album managedAlbum = saveAlbumIfNotExist(track.getAlbum());
            track.setAlbum(managedAlbum);
        }
        return saveTrackIfNotExist(track);
    }

    private Artist saveArtistIfNotExist(Artist artist) {
        if (artist == null) return null;
        return artistRepository.findById(artist.getId())
                .orElseGet(() -> artistRepository.save(artist));
    }

    private Album saveAlbumIfNotExist(Album album) {
        if (album == null) return null;
        return albumRepository.findById(album.getId())
                .orElseGet(() -> albumRepository.save(album));
    }

    private Track saveTrackIfNotExist(Track track) {
        if (track == null) return null;
        return trackRepository.findById(track.getId())
                .orElseGet(() -> trackRepository.save(track));
    }
}
