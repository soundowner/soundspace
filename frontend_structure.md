# 🗺️ SoundSpace Frontend Structure

Этот технический атлас описывает фронтенд SoundSpace, расположенный в статическом каталоге шлюза Qobuz ([static](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/qobuz-data-gateway/src/main/resources/static)).

---

## 📂 Файловая структура фронтенда

Все файлы фронтенда расположены в [static-каталоге](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/qobuz-data-gateway/src/main/resources/static):

* [index.html](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/qobuz-data-gateway/src/main/resources/static/index.html) — Главный интерфейс плеера (Search, Player Panel, Library, Overlays).
* [login.html](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/qobuz-data-gateway/src/main/resources/static/login.html) — Экран входа/регистрации (включая выбор Google OAuth2).
* [script.js](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/qobuz-data-gateway/src/main/resources/static/script.js) — Основная логика работы с API, управление DOM и воспроизведением.
* [style.css](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/qobuz-data-gateway/src/main/resources/static/style.css) — Стили интерфейса (анимации, кастомный скроллбар, темный неоновый дизайн).
* [tailwindcss.js](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/qobuz-data-gateway/src/main/resources/static/tailwindcss.js) — Локальная копия Tailwind CSS для обеспечения автономности без интернета.
* [STRUCTURE.md](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/qobuz-data-gateway/src/main/resources/static/STRUCTURE.md) — Исходный технический атлас фронтенда.

---

## 🏗️ DOM Tree & Elements (`els` object)

В [script.js](file:///C:/Users/THESoundowner/Desktop/soundspace/soundspace/qobuz-data-gateway/src/main/resources/static/script.js) все ключевые элементы кэшируются в глобальный объект `els` при событии `DOMContentLoaded`:

### 📂 Контейнеры и разметка (Containers & Layout)
* `#parent-container` (`els.parentContainer`) — Корневой контейнер UI.
* `.bottom-navbar` (`els.bottomNavbar`) — Главная навигация (переключение экранов).
* `.panel` — Общий класс для всех полноэкранных окон.

### 🔍 Поиск (Search)
* `#top-search-panel` (`els.topSearchPanel`) — Панель ввода (выезжает сверху).
* `#search-input` (`els.searchInput`) — Поле ввода поиска.
* `#search-results-container` (`els.searchResults`) — Список результатов поиска треков.

### 🎵 Панель плеера (Player Panel - `#player-panel`)
* `#player-controls-container` (`els.playerControls`) — Блок управления воспроизведением (Play/Next/Prev).
* `#play-button-container` (`els.playBtnContainer`) — Кнопка Play/Pause.
* `#timebar-progress-container` (`els.timeBarContainer`) — Контейнер прогресс-бара.
* `#timebar-progress` (`els.timeBarProgress`) — Полоса прогресса.
* `#track-title`, `#track-artist-label`, `#track-album-label` — Метаданные текущего трека.
* `#now_play_bottom_panel_part` (`els.playBottomPart`) — Расширяемая (нижняя) часть плеера.

### 📚 Медиатека (Library - `#library-panel`)
* `#library_wrapper` — Обертка всей библиотеки.
* `#tracks-lib-container` (`els.tracksLibContainer`) — Контейнер для вкладки лайкнутых треков.
* `#playlists-grid-ss`, `#artists-lib-container`, `#albums-lib-container` — Контейнеры для вкладок плейлистов, артистов и альбомов.
* `.lib-nav` (`els.libNavBtns`) — Кнопки переключения табов (Tracks / Playlists / Albums / Artists).

### 🖼️ Оверлеи (Overlays / Dynamic Content)
* `#artist-panel` (`#artist-content`) — Оверлей с карточкой артиста.
* `#album-panel` (`#album-content`) — Оверлей просмотра альбома.
* `#playlist-panel` (`#playlist-content-ss`) — Оверлей деталей плейлиста.

---

## 🧠 Управление состоянием (State Management)

### 1. `playerState` (Proxy)
Реактивно отслеживает изменения состояния плеера и вызывает UI-обновления:
* `isPlaying` (boolean) $\rightarrow$ триггерит функцию `updatePlayPauseUI()`.
* `currentTrack` (object) $\rightarrow$ триггерит функцию `updatePlayerUI(track)`.
* `currentTime` (number) $\rightarrow$ обновляет текстовое время и позицию полосы прогресса.
* `duration` (number) $\rightarrow$ обновляет максимальную длину трека в UI.
* `queue` (array) — текущая очередь воспроизведения.
* `currentIndex` (number) — индекс воспроизводимого трека в очереди.

### 2. `libraryState`
Локальный кэш состояния медиатеки:
* `playlists` (array) — кэш плейлистов пользователя (из localStorage/БД).
* `artists` (array) / `albums` (array) — загруженные списки артистов и альбомов.
* `likedTracks` (array) — кэш лайкнутых пользователем треков (из localStorage).
* `artistIds` (Set) / `albumIds` (Set) — наборы ID для быстрой `O(1)` проверки.
* `likedTrackIds` (Set) — набор ID лайкнутых треков для быстрой `O(1)` проверки.
* `needsArtistsSync` / `needsAlbumsSync` (boolean) — флаги инвалидации кэша.

---

## ⚙️ Карта функций и логика (Function Map)

### 🔄 Синхронизация данных (Data & Sync)
* `syncLibraryIds()` — Первичная и периодическая синхронизация ID лайков для артистов/альбомов.
* `fetchArtistsSS()` / `fetchAlbumsSS()` — Запросы к бэкенду для подгрузки списков.
* `renderLikedTracksSS()` — Локальный рендеринг лайкнутых треков из `libraryState.likedTracks` во вкладку медиатеки.
* `toggleLikeTrack(track, buttonEl)` — Добавление/удаление трека в любимые, сохранение в localStorage и обновление состояния сердечек на всех панелях.
* `mapToArtistDto()` / `mapToAlbumDto()` / `mapToTrackDto()` — Маппинг Qobuz API JSON в DTO-формат.

### 🎧 Логика воспроизведения (Playback Flow)
* `handleTrackClick(el, isAutoPlay)` — Главный обработчик клика на трек.
* `playAdjacent(direction)` — Переключение треков в очереди вперед (`1`) или назад (`-1`).

### 🔘 Интерфейс (UI Interactions)
* `setActiveLibraryTab(tabName)` — Переключение вкладок библиотеки (включая `tracks`) и ленивая подгрузка.
* `openOverlay(id)` / `closeOverlay(id)` — Анимированное открытие и закрытие оверлеев.
* `initSwipeForTrackList(container)` — Жесты свайпа влево/вправо для добавления в плейлисты или удаления.

---

## 🔗 Цепочка событий (Event Listeners Chain)

1. **`DOMContentLoaded`** $\rightarrow$ Инициализация элементов `els`, запуск `syncLibraryIds()` и главного лупа `loop()`.
2. **`els.searchInput`** $\rightarrow$ Запрос к `/data/audio/search` $\rightarrow$ Рендеринг результатов.
3. **`els.bottomNavbar` (клик)** $\rightarrow$ Переключение разделов.
4. **`els.libNavBtns` (клик)** $\rightarrow$ Вызов `setActiveLibraryTab()`.
5. **`.slide-btn.btn-like-track` (клик)** $\rightarrow$ Вызов `toggleLikeTrack()` для сохранения трека в любимые.
