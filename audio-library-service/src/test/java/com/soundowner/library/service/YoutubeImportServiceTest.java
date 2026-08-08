package com.soundowner.library.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.soundowner.library.dto.TrackDto;
import com.soundowner.library.dto.YoutubeImportRequestDto;
import com.soundowner.library.mapper.LibraryMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class YoutubeImportServiceTest {

    @Mock
    private RestTemplate restTemplate;

    @Mock
    private ObjectMapper objectMapper;

    @Mock
    private LibraryService libraryService;

    @Mock
    private LibraryMapper libraryMapper;

    @InjectMocks
    private YoutubeImportService youtubeImportService;

    private ObjectMapper realMapper;

    @BeforeEach
    void setUp() {
        realMapper = new ObjectMapper();
        ReflectionTestUtils.setField(youtubeImportService, "qobuzGatewayUrl", "http://qobuz-api-gateway:8082");
    }

    @Test
    void processAndSaveTrackAsync_Fail_NoMatchFound() throws Exception {
        UUID userId = UUID.randomUUID();
        YoutubeImportRequestDto ytDto = new YoutubeImportRequestDto();
        ytDto.setArtist("Moby");
        ytDto.setTitle("Porcelain");

        // Qobuz returns completely different artist/title
        String jsonResponse = "{ \"tracks\": { \"items\": [ { \"id\": 1, \"title\": \"Flowers\", \"performers\": \"Miley Cyrus\" } ] } }";

        when(restTemplate.getForObject(anyString(), eq(String.class), anyString())).thenReturn(jsonResponse);
        when(objectMapper.readTree(anyString())).thenReturn(realMapper.readTree(jsonResponse));

        TrackDto trackDto = new TrackDto();
        trackDto.setId(1L);
        trackDto.setTitle("Flowers");
        trackDto.setPerformers("Miley Cyrus");
        when(objectMapper.treeToValue(any(), eq(TrackDto.class))).thenReturn(trackDto);

        CompletableFuture<Boolean> result = youtubeImportService.processAndSaveTrackAsync(userId, ytDto);

        assertFalse(result.join());
        verify(libraryService, never()).addTrackToLibrary(any(), any());
    }

    @Test
    void processAndSaveTrackAsync_Fail_QobuzTimeout() {
        UUID userId = UUID.randomUUID();
        YoutubeImportRequestDto ytDto = new YoutubeImportRequestDto();
        ytDto.setArtist("Daft Punk");
        ytDto.setTitle("Get Lucky");

        // Simulate RestTemplate throwing an exception (e.g., Timeout or 503)
        when(restTemplate.getForObject(anyString(), eq(String.class), anyString()))
                .thenThrow(new RestClientException("Connection timed out"));

        // Should catch the exception, log it, and return false smoothly
        CompletableFuture<Boolean> result = youtubeImportService.processAndSaveTrackAsync(userId, ytDto);

        assertFalse(result.join());
        verify(libraryService, never()).addTrackToLibrary(any(), any());
    }

    @Test
    void processAndSaveTrackAsync_Fail_MalformedJsonResponse() throws Exception {
        UUID userId = UUID.randomUUID();
        YoutubeImportRequestDto ytDto = new YoutubeImportRequestDto();
        ytDto.setArtist("Daft Punk");
        ytDto.setTitle("Get Lucky");

        String badJson = "{ invalid json";

        when(restTemplate.getForObject(anyString(), eq(String.class), anyString())).thenReturn(badJson);
        // Simulate ObjectMapper throwing JsonParseException
        when(objectMapper.readTree(anyString())).thenThrow(new com.fasterxml.jackson.core.JsonParseException(null, "Bad JSON"));

        CompletableFuture<Boolean> result = youtubeImportService.processAndSaveTrackAsync(userId, ytDto);

        assertFalse(result.join());
        verify(libraryService, never()).addTrackToLibrary(any(), any());
    }
}