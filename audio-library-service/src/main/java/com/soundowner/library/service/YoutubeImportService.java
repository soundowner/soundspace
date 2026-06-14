package com.soundowner.library.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.soundowner.library.dto.TrackDto;
import com.soundowner.library.dto.YoutubeImportRequestDto;
import com.soundowner.library.mapper.LibraryMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@Slf4j
@Service
@RequiredArgsConstructor
public class YoutubeImportService {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final LibraryService libraryService;
    private final LibraryMapper libraryMapper;

    @Async("youtubeImportExecutor")
    public CompletableFuture<Boolean> processAndSaveTrackAsync(UUID userId, YoutubeImportRequestDto item) {
        try {
            String query = item.getArtist() + " " + item.getTitle();
            String url = "http://qobuz-api-gateway:8082/data/audio/search?query=" + URLEncoder.encode(query, StandardCharsets.UTF_8) + "&type=tracks&limit=5";

            String responseStr = restTemplate.getForObject(url, String.class);
            JsonNode tracksNode = objectMapper.readTree(responseStr).path("tracks").path("items");

            if (tracksNode.isArray() && tracksNode.size() > 0) {
                for (JsonNode node : tracksNode) {
                    TrackDto trackDto = objectMapper.treeToValue(node, TrackDto.class);
                    if (isValidMatch(item, trackDto)) {
                        libraryService.addTrackToLibrary(userId, libraryMapper.toTrack(trackDto));
                        log.debug("Successfully imported: {} - {}", item.getArtist(), item.getTitle());
                        return CompletableFuture.completedFuture(true);
                    }
                }
                log.warn("No valid match found for: {} - {}", item.getArtist(), item.getTitle());
            } else {
                log.warn("Qobuz returned 0 results for: {} - {}", item.getArtist(), item.getTitle());
            }
        } catch (Exception e) {
            log.error("Error processing track: {} - {}. Reason: {}", item.getArtist(), item.getTitle(), e.getMessage());
        }
        return CompletableFuture.completedFuture(false);
    }

    private boolean isValidMatch(YoutubeImportRequestDto yt, TrackDto qobuz) {
        if (qobuz == null || qobuz.getId() == null) return false;

        String ytArtist = normalize(yt.getArtist());
        String ytTitle = normalize(yt.getTitle());

        String qobuzArtist = normalize(qobuz.getPerformers());
        String qobuzTitle = normalize(qobuz.getTitle());

        // Базовая логика: 
        // 1. Либо артист из Qobuz содержит имя из YouTube (или наоборот)
        // 2. И название трека из Qobuz содержит название из YouTube (или наоборот)
        boolean artistMatch = qobuzArtist.contains(ytArtist) || ytArtist.contains(qobuzArtist);
        boolean titleMatch = qobuzTitle.contains(ytTitle) || ytTitle.contains(qobuzTitle);

        return artistMatch && titleMatch;
    }

    private String normalize(String input) {
        if (input == null) return "";
        return input.toLowerCase()
                .replaceAll("\\(.*?\\)", "") // Удаляем все в скобках (Official Video, Remastered)
                .replaceAll("\\[.*?\\]", "") // Удаляем все в квадратных скобках
                .replaceAll("[^a-z0-9а-яё]", "") // Удаляем все символы кроме букв и цифр (включая пробелы)
                .trim();
    }
}
