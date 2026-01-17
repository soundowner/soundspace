package com.soundowner.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * A simple controller to check the health of the application.
 */
@RestController
public class HealthCheckController {

    /**
     * Returns a simple "OK" to indicate that the application is running.
     * @return The health status.
     */
    @GetMapping("/health")
    public String healthCheck() {
        return "OK";
    }
}
