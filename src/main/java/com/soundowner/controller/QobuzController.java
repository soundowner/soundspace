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

    @GetMapping("/artists/{artistId}")
    public Mono<String> getArtistWithAlbums(@PathVariable String artistId) {
        return qobuzApiService.getArtistWithAlbums(artistId);
    }
}
