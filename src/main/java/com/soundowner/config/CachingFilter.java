package com.soundowner.config;

import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

@Component
public class CachingFilter implements WebFilter {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();

        // 1. Static Data (Artist, Album) -> 1 Hour Cache
        if (path.startsWith("/data/audio/artist") || path.startsWith("/data/audio/album")) {
            exchange.getResponse().getHeaders().add("Cache-Control", "public, max-age=3600");
        }
        // 2. Streaming (/play) -> No Cache (Optional, usually handled by browser, but good to be explicit)
        else if (path.startsWith("/data/audio/play")) {
            exchange.getResponse().getHeaders().add("Cache-Control", "no-cache, no-store, must-revalidate");
        }

        return chain.filter(exchange);
    }
}
