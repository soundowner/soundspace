package com.soundowner.gateway.config;

import lombok.RequiredArgsConstructor;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpCookie;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
@RequiredArgsConstructor
public class UserIdRelayFilter implements GlobalFilter, Ordered {

    private final JwtUtils jwtUtils;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        HttpCookie cookie = exchange.getRequest().getCookies().getFirst("ACCESS_TOKEN");

        if (cookie != null && jwtUtils.isTokenValid(cookie.getValue())) {
            String userId = jwtUtils.extractUserId(cookie.getValue());
            
            // Мутируем запрос, добавляя заголовок X-User-Id
            ServerWebExchange modifiedExchange = exchange.mutate()
                    .request(r -> r.header("X-User-Id", userId))
                    .build();
            
            return chain.filter(modifiedExchange);
        }

        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        // Должен выполниться ПОСЛЕ фильтров безопасности, но ДО отправки запроса
        return Ordered.HIGHEST_PRECEDENCE + 10;
    }
}
