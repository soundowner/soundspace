package com.soundowner.gateway.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpCookie;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import reactor.core.publisher.Mono;

@Configuration
@EnableWebFluxSecurity
@RequiredArgsConstructor
public class GatewaySecurityConfig {

    private final JwtUtils jwtUtils;

    @Bean
    public WebFilter redirectAuthenticatedFilter() {
        return (exchange, chain) -> {
            String path = exchange.getRequest().getPath().value();
            if (path.equals("/login.html") || path.equals("/login")) {
                HttpCookie cookie = exchange.getRequest().getCookies().getFirst("ACCESS_TOKEN");
                if (cookie != null && jwtUtils.isTokenValid(cookie.getValue())) {
                    exchange.getResponse().setStatusCode(HttpStatus.FOUND);
                    exchange.getResponse().getHeaders().set("Location", "/");
                    return exchange.getResponse().setComplete();
                }
            }
            return chain.filter(exchange);
        };
    }

    @Bean
    public SecurityWebFilterChain springSecurityFilterChain(ServerHttpSecurity http) {
        http
            .csrf(ServerHttpSecurity.CsrfSpec::disable)
            .authorizeExchange(exchanges -> exchanges
                // Разрешаем вход и статику для входа
                .pathMatchers("/auth/**", "/login.html", "/tailwindcss.js").permitAll()
                // Всё остальное (статика, API) проверяем вручную через фильтр ниже
                .anyExchange().access((authentication, context) -> {
                    ServerWebExchange exchange = context.getExchange();
                    HttpCookie cookie = exchange.getRequest().getCookies().getFirst("ACCESS_TOKEN");

                    if (cookie != null && jwtUtils.isTokenValid(cookie.getValue())) {
                        return Mono.just(new org.springframework.security.authorization.AuthorizationDecision(true));
                    }
                    return Mono.just(new org.springframework.security.authorization.AuthorizationDecision(false));
                })
            )
            .exceptionHandling(exceptionHandling -> exceptionHandling
                .authenticationEntryPoint((exchange, e) -> {
                    // Если не авторизован и просит статику — редирект на логин
                    if (exchange.getRequest().getPath().value().endsWith(".html") || exchange.getRequest().getPath().value().equals("/")) {
                        exchange.getResponse().setStatusCode(HttpStatus.FOUND);
                        exchange.getResponse().getHeaders().set("Location", "/login.html");
                        return exchange.getResponse().setComplete();
                    }
                    // Если API — просто 401
                    exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                    return exchange.getResponse().setComplete();
                })
            );

        return http.build();
    }
}
