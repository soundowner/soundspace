package com.soundowner.service;

import com.soundowner.config.QobuzProperties;
import com.soundowner.util.HashUtils; // Импорт нового утилитного класса
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.time.Instant;

@Service
@Slf4j
public class QobuzApiService {
    private final QobuzProperties properties;
    private final WebClient webClient;
    @Setter
    private volatile String validSearchToken;
    @Setter
    private volatile String validFileUrlToken;

    /**
     * Конструктор сервиса Qobuz API.
     *
     * @param properties  конфигурация поиска и API ключей
     * @param webClient   настроенный экземпляр {@link WebClient} для запросов к Qobuz
     */
    public QobuzApiService(QobuzProperties properties, WebClient webClient) {
        this.properties = properties;
        this.webClient = webClient;
        this.validSearchToken = properties.getUserAuthToken();
        this.validFileUrlToken = properties.getUserAuthToken();
    }

    /**
     * Переключает токен поиска между основным и дополнительным.
     * Используется при ошибках или ограничениях на текущий токен.
     */
    public void replaceSearchToken(){
        if(validSearchToken.equals(properties.getUserAuthToken())){
            this.validSearchToken = properties.getUserAlternativeAuthToken();
        }else {
            this.validSearchToken = properties.getUserAuthToken();
        }
        log.info("search token replaced");
    }

    /**
     * Переключает токен для получения файлов между основным и дополнительным.
     * Используется при ошибках получения URL.
     */
    public void replaceFileUrlToken(){
        if(validFileUrlToken.equals(properties.getUserAuthToken())){
            this.validFileUrlToken = properties.getUserAlternativeAuthToken();
        }else {
            this.validFileUrlToken = properties.getUserAuthToken();
        }
        log.info("fileUrl token replaced");
    }

    /**
     * Выполняет поиск по каталогу Qobuz.
     *
     * @param query поисковый запрос (например, имя исполнителя или название трека)
     * @param type  тип поиска (tracks, albums, artists и пр.), если null или пусто — используется "tracks"
     * @return      Mono с JSON-строкой ответа от API Qobuz
     */
    public Mono<String> search(String query, String type) {
        java.net.URI uri = UriComponentsBuilder.fromUriString(properties.getQobuzBaseUrl() + "catalog/search")
                .queryParam("app_id", properties.getAppId())
                .queryParam("query", query)
                .queryParam("type", type !=null && !type.isEmpty() ? type : "tracks")
                .queryParam("extra", "albums") // Added to get alphanumeric IDs
                .queryParam("user_auth_token", validSearchToken)
                .build()
                .toUri();

        log.info("Requesting Catalog Search URL: {}", uri.toString()); // Логирование URL для отладки

        return webClient.get()
                .uri(uri)
                .retrieve()
                .bodyToMono(String.class)
                .doOnNext(res -> log.debug("Qobuz search success for query: {}", query))
                .doOnError(e -> log.error("Qobuz search failed for query: {}. Error: {}", query, e.getMessage()))
                .log()// Логирование всех событий Mono
                .timeout(Duration.ofSeconds(5));
    }

    /**
     * Получает URL для стриминга или загрузки файла трека.
     *
     * @param trackId  ID трека в каталоге Qobuz
     * @param formatId ID формата файла (например, 6 для FLAC 16-bit)
     * @return         Mono с JSON-строкой ответа от API Qobuz (ссылка и параметры файла)
     */
    public Mono<String> getFileUrl(int trackId, Integer formatId) {
        long timestamp = Instant.now().getEpochSecond();
        String signatureRaw = String.format("trackgetFileUrlformat_id%sintentstreamtrack_id%s%s%s",
                formatId, trackId, timestamp, properties.getAppSecret());

        String signature = HashUtils.calculateMD5(signatureRaw); // Использование утилитарного класса

        java.net.URI uri = UriComponentsBuilder.fromUriString(properties.getQobuzBaseUrl() + "track/getFileUrl")
                .queryParam("app_id", properties.getAppId())
                .queryParam("track_id", trackId)
                .queryParam("format_id", formatId != null ? formatId : 27)
                .queryParam("intent", "stream")
                .queryParam("request_ts", timestamp)
                .queryParam("request_sig", signature)
                .queryParam("user_auth_token", validFileUrlToken)
                .build()
                .toUri();


        return webClient.get()
                .uri(uri)
                .header("X-User-Auth-Token", validFileUrlToken) // добавляем заголовок
                .retrieve()
                .bodyToMono(String.class)
                .onErrorResume(e -> Mono.error(new RuntimeException("Ошибка при вызове Qobuz getFileUrl", e)));
    }


    public Mono<String> getArtistWithAlbums(String artistId) {
        java.net.URI uri = UriComponentsBuilder.fromUriString(properties.getQobuzBaseUrl() + "artist/get")
                .queryParam("app_id", properties.getAppId())
                .queryParam("artist_id", artistId)
                //.queryParam("type", "artists") // Removed redundant type
                .queryParam("extra", "albums,tracks") // Added tracks for top tracks
                .queryParam("limit", 15)
                .queryParam("user_auth_token", validSearchToken)
                .build()
                .toUri();

        return webClient.get()
                .uri(uri)
                .retrieve()
                .bodyToMono(String.class)
                .onErrorResume(e -> Mono.error(new RuntimeException("Ошибка при вызове Qobuz artist/get", e)));
    }

    public Mono<String> getAlbumById(String albumId) {
        java.net.URI uri = UriComponentsBuilder.fromUriString(properties.getQobuzBaseUrl() + "album/get")
                .queryParam("app_id", properties.getAppId())
                .queryParam("album_id", albumId)
                .queryParam("user_auth_token", validSearchToken)
                .build()
                .toUri();

        return webClient.get()
                .uri(uri)
                .retrieve()
                .bodyToMono(String.class)
                .onErrorResume(e -> Mono.error(new RuntimeException("Ошибка при вызове Qobuz album/get", e)));
    }
}