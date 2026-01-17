package com.soundowner.service;

import com.soundowner.config.QobuzProperties;
import okhttp3.HttpUrl;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.io.IOException;
import java.util.Objects;

import static org.junit.jupiter.api.Assertions.*;

class QobuzApiServiceTest {

    private static MockWebServer mockWebServer;
    private QobuzApiService qobuzApiService;
    private QobuzProperties properties;

    @BeforeAll
    static void setUp() throws IOException {
        mockWebServer = new MockWebServer();
        mockWebServer.start();
    }

    @AfterAll
    static void tearDown() throws IOException {
        mockWebServer.shutdown();
    }

    @BeforeEach
    void initialize() {
        String baseUrl = String.format("http://localhost:%s/", mockWebServer.getPort());

        properties = new QobuzProperties();
        properties.setQobuzBaseUrl(baseUrl);
        properties.setAppId("test-app-id");
        properties.setAppSecret("test-secret");
        properties.setUserAuthToken("primary-token");
        properties.setUserAlternativeAuthToken("backup-token");

        WebClient webClient = WebClient.builder().baseUrl(baseUrl).build();
        qobuzApiService = new QobuzApiService(properties, webClient);
    }

    @Test
    void getFileUrl_ShouldIncludeSignatureAndCustomHeader() throws InterruptedException {
        // Arrange
        mockWebServer.enqueue(new MockResponse().setBody("{\"url\": \"http://stream.qobuz.com/123\"}"));

        // Act
        qobuzApiService.getFileUrl(555, 6).block();

        // Assert
        RecordedRequest request = mockWebServer.takeRequest();
        assertNotNull(request);
        String path = request.getPath();
        assertNotNull(path);

        // Проверяем наличие обязательных параметров для этого метода
        assertTrue(path.contains("request_ts="), "Должен быть timestamp");
        assertTrue(path.contains("request_sig="), "Должна быть MD5 подпись");
        assertTrue(path.contains("format_id=6"));

        // Проверяем кастомный заголовок
        assertEquals("primary-token", request.getHeader("X-User-Auth-Token"));
    }

    @Test
    void replaceSearchToken_ShouldEffectivelySwitchTokens() throws InterruptedException {
        // 1. Делаем первый запрос
        mockWebServer.enqueue(new MockResponse().setBody("{}"));
        qobuzApiService.search("q", "tracks").block();

        RecordedRequest request1 = mockWebServer.takeRequest();
        assertNotNull(request1);
        HttpUrl url1 = request1.getRequestUrl();
        assertNotNull(url1, "URL should not be null");
        assertEquals("primary-token", url1.queryParameter("user_auth_token"));

        // 2. Переключаем токен (имитируем реакцию на ошибку)
        qobuzApiService.replaceSearchToken();

        // 3. Делаем второй запрос - токен должен измениться
        mockWebServer.enqueue(new MockResponse().setBody("{}"));
        qobuzApiService.search("q", "tracks").block();

        RecordedRequest request2 = mockWebServer.takeRequest();
        assertNotNull(request2);
        HttpUrl url2 = request2.getRequestUrl();
        assertNotNull(url2, "URL should not be null");
        assertEquals("backup-token", url2.queryParameter("user_auth_token"));
    }

    @Test
    void getAlbumById_ShouldHandleApiError() {
        // Arrange: Эмулируем 500 ошибку от API Qobuz
        mockWebServer.enqueue(new MockResponse().setResponseCode(500));

        // Act
        Mono<String> result = qobuzApiService.getAlbumById("album-123");

        // Assert: Проверяем, что сработал onErrorResume
        StepVerifier.create(result)
                .expectErrorMatches(throwable -> throwable instanceof RuntimeException
                        && throwable.getMessage().contains("Ошибка при вызове Qobuz album/get"))
                .verify();
    }
}