package com.soundowner.library.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.soundowner.library.dto.TrackDto;
import com.soundowner.library.dto.YoutubeImportRequestDto;
import com.soundowner.library.mapper.LibraryMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
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

    @Value("${qobuz.gateway.url}")
    private String qobuzGatewayUrl;

    private String getEffectiveGatewayUrl() {
        if (qobuzGatewayUrl.contains("qobuz-api-gateway")) {
            try {
                java.net.InetAddress.getByName("qobuz-api-gateway");
                return qobuzGatewayUrl;
            } catch (java.net.UnknownHostException e) {
                log.info("qobuz-api-gateway host is not resolvable (likely running outside Docker). Falling back to http://localhost:8082");
                return "http://localhost:8082";
            }
        }
        return qobuzGatewayUrl;
    }

    @Async("youtubeImportExecutor")
    public CompletableFuture<Boolean> processAndSaveTrackAsync(UUID userId, YoutubeImportRequestDto item) {
        try {
            TrackDto matchedTrack = findBestMatch(item);
            if (matchedTrack != null) {
                libraryService.addTrackToLibrary(userId, libraryMapper.toTrack(matchedTrack));
                log.debug("Successfully imported to library: {} - {}", item.getArtist(), item.getTitle());
                return CompletableFuture.completedFuture(true);
            }
        } catch (Exception e) {
            log.error("Error processing track to library: {} - {}. Reason: {}", item.getArtist(), item.getTitle(), e.getMessage());
        }
        return CompletableFuture.completedFuture(false);
    }

    @Async("youtubeImportExecutor")
    public CompletableFuture<Boolean> processAndAddToPlaylistAsync(UUID playlistId, YoutubeImportRequestDto item) {
        try {
            TrackDto matchedTrack = findBestMatch(item);
            if (matchedTrack != null) {
                libraryService.addTrackToPlaylist(playlistId, libraryMapper.toTrack(matchedTrack));
                log.debug("Successfully added to playlist: {} - {}", item.getArtist(), item.getTitle());
                return CompletableFuture.completedFuture(true);
            }
        } catch (Exception e) {
            log.error("Error adding to playlist: {} - {}. Reason: {}", item.getArtist(), item.getTitle(), e.getMessage());
        }
        return CompletableFuture.completedFuture(false);
    }

    private TrackDto findBestMatch(YoutubeImportRequestDto item) throws Exception {
        String gatewayUrl = getEffectiveGatewayUrl();

        // 1. Try matching by ISRC first if present
        if (item.getIsrc() != null && !item.getIsrc().trim().isEmpty()) {
            String isrcQuery = item.getIsrc().trim();
            String url = gatewayUrl + "/data/audio/search/isrc?isrc={isrc}";
            try {
                log.debug("Searching Qobuz by ISRC: {}", isrcQuery);
                String responseStr = restTemplate.getForObject(url, String.class, isrcQuery);
                JsonNode tracksNode = objectMapper.readTree(responseStr).path("tracks").path("items");

                if (tracksNode.isArray() && tracksNode.size() > 0) {
                    for (JsonNode node : tracksNode) {
                        TrackDto trackDto = objectMapper.treeToValue(node, TrackDto.class);
                        if (trackDto != null && isrcQuery.equalsIgnoreCase(trackDto.getIsrc())) {
                            log.debug("Exact ISRC match found on Qobuz: {}", isrcQuery);
                            return trackDto;
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to find track by ISRC: {}. Error: {}", isrcQuery, e.getMessage());
            }
            log.debug("No exact ISRC match found on Qobuz for {}, falling back to text search.", isrcQuery);
        }

        // 2. Fallback to text-based search
        String query = item.getArtist() + " " + item.getTitle();
        String url = gatewayUrl + "/data/audio/search?query={query}&type=tracks&limit=5";

        String responseStr = restTemplate.getForObject(url, String.class, query);
        JsonNode tracksNode = objectMapper.readTree(responseStr).path("tracks").path("items");

        if (tracksNode.isArray() && tracksNode.size() > 0) {
            for (JsonNode node : tracksNode) {
                TrackDto trackDto = objectMapper.treeToValue(node, TrackDto.class);
                if (isValidMatch(item, trackDto)) {
                    return trackDto;
                }
            }
        }
        return null;
    }

    private boolean isValidMatch(YoutubeImportRequestDto yt, TrackDto qobuz) {
        if (qobuz == null || qobuz.getId() == null) return false;

        // If ISRC matches exactly, it is a valid match!
        if (yt.getIsrc() != null && !yt.getIsrc().trim().isEmpty() && qobuz.getIsrc() != null) {
            if (yt.getIsrc().trim().equalsIgnoreCase(qobuz.getIsrc().trim())) {
                return true;
            }
        }

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
                .replaceAll("\\b(feat|ft|and|with)\\b", "") // Удаляем слова-связки с границами слов
                .replaceAll("[^a-z0-9а-яё]", "") // Удаляем все символы кроме букв и цифр (включая пробелы)
                .trim();
    }
}
