package com.soundowner.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

public class HashUtils {

    private HashUtils() {
        // Приватный конструктор, чтобы предотвратить создание экземпляров утилитного класса
    }

    /**
     * Вычисляет MD5-хэш для заданной строки.
     *
     * @param input входная строка
     * @return      строка хэша в шестнадцатеричном виде
     * @throws RuntimeException если алгоритм MD5 недоступен в JVM
     */
    public static String calculateMD5(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e){
            throw new RuntimeException("Error calculating MD5", e);
        }
    }
}
