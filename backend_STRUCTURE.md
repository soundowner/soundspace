# 🗺️ SoundSpace Backend Structure

Этот технический атлас описывает архитектуру бэкенда SoundSpace, состав микросервисов, схемы БД, конфигурацию шлюзов и ключевые классы/точки расширения.

---

## 🏗️ Микросервисная архитектура и порты

Проект состоит из 4 основных сервисов, координируемых через Docker Compose:

| Сервис | Порт | Описание | Основные технологии |
| :--- | :---: | :--- | :--- |
| [soundspace-gateway](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/soundspace-gateway) | **8080** | Входная точка (API Gateway). Проверяет JWT, перенаправляет трафик, передает `X-User-Id` | Spring Cloud Gateway, WebFlux, Spring Security |
| [auth-server](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/auth-server) | **8081** | Сервис аутентификации. Регистрация, Login, Google OAuth2, генерация JWT | Spring Boot, JPA, Flyway, PostgreSQL (`soundspace_db`) |
| [qobuz-data-gateway](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/qobuz-data-gateway) | **8082** | Прокси-шлюз к API Qobuz. Кэширует запросы, отдает статический фронтенд | Spring Boot, WebFlux (WebClient), Caffeine Cache (в фильтре) |
| [audio-library-service](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/audio-library-service) | **8083** | Управление медиатекой пользователя (плейлисты, любимые треки, альбомы, артисты) | Spring Boot, JPA, Flyway, PostgreSQL (`soundspace_library`) |

---

## 🔒 Безопасность и Маршрутизация

### 1. API Gateway Routing
Маршруты настроены в [application.yml](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/soundspace-gateway/src/main/resources/application.yml):
* `/auth/**` $\rightarrow$ `auth-server:8081` (префикс срезается).
* `/login` / `/register` $\rightarrow$ `auth-server:8081` (маппинг на статические страницы `.html` через `SetPath`).
* `/data/audio/**` $\rightarrow$ `qobuz-api-gateway:8082`.
* `/library/**` $\rightarrow$ `audio-library-service:8083`.
* `/` и статика $\rightarrow$ `qobuz-api-gateway:8082` (корень отдает `/index.html`).

### 2. Токен-фильтрация
* [GatewaySecurityConfig](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/soundspace-gateway/src/main/java/com/soundowner/gateway/config/GatewaySecurityConfig.java) проверяет наличие куки `ACCESS_TOKEN`. Если кука невалидна и запрос идет на `.html`/корень — редиректит на `/login.html`.
* [UserIdRelayFilter](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/soundspace-gateway/src/main/java/com/soundowner/gateway/config/UserIdRelayFilter.java) декодирует валидный JWT и прокидывает заголовок `X-User-Id` во внутренние микросервисы.

---

## 📦 Детали микросервисов

### 🔑 [auth-server](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/auth-server)
* **Точки входа:** [AuthController](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/auth-server/src/main/java/com/soundowner/auth/controller/AuthController.java) (`/register`, `/login`, `/refresh`, `/logout`, `/me`).
* **OAuth2:** [OAuth2SuccessHandler](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/auth-server/src/main/java/com/soundowner/auth/config/OAuth2SuccessHandler.java) и [CustomOAuth2UserService](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/auth-server/src/main/java/com/soundowner/auth/service/CustomOAuth2UserService.java) обрабатывают вход через Google, сохраняют пользователя в БД и выдают куки с JWT.
* **Бизнес-логика:** [AuthService](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/auth-server/src/main/java/com/soundowner/auth/service/AuthService.java), [JwtService](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/auth-server/src/main/java/com/soundowner/auth/service/JwtService.java).
* **БД:** Таблица `users`. Сущность [User](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/auth-server/src/main/java/com/soundowner/auth/db/entity/User.java). Миграция [V1__init_users_table.sql](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/auth-server/src/main/resources/db/migration/V1__init_users_table.sql).

### 🌐 [qobuz-data-gateway](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/qobuz-data-gateway)
* **Контроллер:** [QobuzController](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/qobuz-data-gateway/src/main/java/com/soundowner/controller/QobuzController.java) (`/data/audio/**`).
  * `/search` — Поиск треков/альбомов/артистов.
  * `/track/{id}` / `/album/{id}` / `/artist/{id}` — Детальная информация.
  * `/file-url` — Получение URL стриминга аудиофайла (Qobuz `track/getFileUrl`).
* **Логика запросов к Qobuz:** [QobuzApiService](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/qobuz-data-gateway/src/main/java/com/soundowner/service/QobuzApiService.java) подписывает запросы с помощью таймштампов и хэшей ([HashUtils](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/qobuz-data-gateway/src/main/java/com/soundowner/util/HashUtils.java)).
* **Оптимизация:** [CachingFilter](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/qobuz-data-gateway/src/main/java/com/soundowner/config/CachingFilter.java) локально кэширует ответы Qobuz API в оперативной памяти (Caffeine), чтобы снизить нагрузку и избежать лимитов API.

### 📚 [audio-library-service](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/audio-library-service)
* **Точки входа:** [LibraryController](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/audio-library-service/src/main/java/com/soundowner/library/controller/LibraryController.java) (`/library/**`).
  * `/library/tracks` — Добавление/Удаление/Получение любимых треков.
  * `/library/albums` — Добавление/Удаление/Получение любимых альбомов.
  * `/library/artists` — Добавление/Удаление/Получение любимых артистов.
  * `/library/playlists` — Создание, редактирование, удаление плейлистов и добавление треков в них.
* **Бизнес-логика:** [LibraryService](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/audio-library-service/src/main/java/com/soundowner/library/service/LibraryService.java).
* **БД:** Сущности [Track](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/audio-library-service/src/main/java/com/soundowner/library/entity/Track.java), [Album](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/audio-library-service/src/main/java/com/soundowner/library/entity/Album.java), [Artist](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/audio-library-service/src/main/java/com/soundowner/library/entity/Artist.java), [Playlist](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/audio-library-service/src/main/java/com/soundowner/library/entity/Playlist.java).

---

## 🛠️ Схемы Баз Данных

1. **`soundspace_db` (Auth):**
   * `users` (`id` UUID, `email` VARCHAR, `password` VARCHAR, `provider` VARCHAR, `provider_id` VARCHAR).

2. **`soundspace_library` (Library):**
   * `tracks` (хранит метаданные треков Qobuz).
   * `albums` (метаданные альбомов).
   * `artists` (метаданные артистов).
   * `playlists` (пользовательские плейлисты).
   * `playlist_tracks` (связующая таблица плейлист-трек с порядком `track_order`).
   * `user_tracks`, `user_albums`, `user_artists` (таблицы связей пользователя с сущностями медиатеки).
