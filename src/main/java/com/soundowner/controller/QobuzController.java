package com.soundowner.controller;

import com.soundowner.service.QobuzApiService;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/data/audio")
public class QobuzController {

    private final QobuzApiService qobuzApiService;

    public QobuzController(QobuzApiService qobuzApiService) {
        this.qobuzApiService = qobuzApiService;
    }

    @GetMapping("/search")
    public Mono<String> search(@RequestParam String query, @RequestParam(required = false) String type) {
        return qobuzApiService.search(query, type);
    }

    @GetMapping("/artist")
    public Mono<String> getArtistWithAlbums(@RequestParam String artistId) {
        return qobuzApiService.getArtistWithAlbums(artistId);
    }

    @GetMapping("/album")
    public Mono<String> getAlbumById(@RequestParam String albumId) {
        return qobuzApiService.getAlbumById(albumId);
    }

    @GetMapping("/play")
    public Mono<String>getHlsStreamUrl(Integer trackId, @RequestParam(required=false) Integer formatId) {
        return qobuzApiService.getFileUrl(trackId,formatId);
    }
}
