package com.soundowner.library.service;

import com.soundowner.library.entity.*;
import com.soundowner.library.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class LibraryService {

    private final ArtistRepository artistRepository;
    private final AlbumRepository albumRepository;
    private final TrackRepository trackRepository;
    private final UserAlbumRepository userAlbumRepository;
    private final PlaylistRepository playlistRepository;
    private final PlaylistTrackRepository playlistTrackRepository;

    @Transactional
    public void addAlbumToLibrary(UUID userId, Album album, List<Track> tracks) {
        // 1. Проверяем и сохраняем Артиста и Альбом (данные пришли с клиента)
        saveAlbumAndTracksMetadata(album, tracks);

        // 2. Проверяем дубликат связи с пользователем
        UserAlbumId userAlbumId = new UserAlbumId(userId, album.getId());
        if (userAlbumRepository.existsById(userAlbumId)) {
            throw new IllegalArgumentException("Album is already in your library");
        }

        // 3. Вычисляем позицию для сортировки
        int nextPos = userAlbumRepository.findMaxPositionByUserId(userId) + 1;
        
        // 4. Создаем связь
        UserAlbum userAlbum = UserAlbum.builder()
                .id(userAlbumId)
                .album(album)
                .position(nextPos)
                .build();
        
        userAlbumRepository.save(userAlbum);
    }

    @Transactional
    public void addTrackToPlaylist(UUID playlistId, Track track) {
        Playlist playlist = playlistRepository.findById(playlistId)
                .orElseThrow(() -> new IllegalArgumentException("Playlist not found"));

        // 1. Гарантируем, что метаданные трека (и его альбома/артиста) есть в БД
        saveTrackMetadata(track);

        // 2. Добавляем в плейлист
        int nextPos = playlistTrackRepository.findMaxPositionByPlaylistId(playlistId) + 1;
        
        PlaylistTrack pt = PlaylistTrack.builder()
                .playlist(playlist)
                .track(track)
                .position(nextPos)
                .build();

        playlistTrackRepository.save(pt);
    }

    /**
     * Вспомогательный метод: Сохраняет структуру Альбома и всех Треков, если их нет в БД.
     */
    private void saveAlbumAndTracksMetadata(Album album, List<Track> tracks) {
        // Artist
        if (album.getArtist() != null) {
            if (!artistRepository.existsById(album.getArtist().getId())) {
                artistRepository.save(album.getArtist());
            }
        }
        
        // Album
        if (!albumRepository.existsById(album.getId())) {
            albumRepository.save(album);
        }
        
        // Tracks
        if (tracks != null && !tracks.isEmpty()) {
            tracks.forEach(track -> {
                track.setAlbum(album); // Привязываем к альбому
                if (!trackRepository.existsById(track.getId())) {
                    trackRepository.save(track);
                }
            });
        }
    }

    /**
     * Вспомогательный метод: Сохраняет структуру одного Трека (Artist -> Album -> Track).
     */
    private void saveTrackMetadata(Track track) {
        Album album = track.getAlbum();
        if (album != null) {
            // Artist
            if (album.getArtist() != null && !artistRepository.existsById(album.getArtist().getId())) {
                artistRepository.save(album.getArtist());
            }
            // Album (сохраняем "контейнер" альбома)
            if (!albumRepository.existsById(album.getId())) {
                albumRepository.save(album);
            }
        }

        // Track
        if (!trackRepository.existsById(track.getId())) {
            trackRepository.save(track);
        }
    }
}
