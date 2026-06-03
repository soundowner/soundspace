# 🗺️ SoundSpace Static Structure (Map)

Этот файл является техническим атласом фронтенда `qobuz-data-gateway`. Обновляется при каждом изменении статики.

## 🏗️ DOM Tree & Elements (`els` object)

### 📂 Containers & Layout
- `#parent-container` (`els.parentContainer`) — Корневой контейнер UI.
- `.bottom-navbar` (`els.bottomNavbar`) — Главная навигация.
- `.panel` — Общий класс для всех полноэкранных окон.

### 🔍 Search
- `#top-search-panel` (`els.topSearchPanel`) — Панель ввода (выезжает сверху).
- `#search-input` (`els.searchInput`) — Поле ввода поиска.
- `#search-results-container` (`els.searchResults`) — Список результатов поиска треков.

### 🎵 Player Panel (`#player-panel`)
- `#player-controls-container` (`els.playerControls`) — Блок управления (Play/Next/Prev).
- `#play-button-container` (`els.playBtnContainer`) — Кнопка Play/Pause.
- `#timebar-progress-container` (`els.timeBarContainer`) — Контейнер прогресс-бара.
- `#timebar-progress` (`els.timeBarProgress`) — Полоса прогресса.
- `#track-title`, `#track-artist-label`, `#track-album-label` — Метаданные текущего трека.
- `#now_play_bottom_panel_part` (`els.playBottomPart`) — Расширяемая часть плеера.

### 📚 Library (`#library-panel`)
- `#library_wrapper` — Обертка всей библиотеки.
- `#playlists-grid-ss`, `#artists-lib-container`, `#albums-lib-container` — Контейнеры для вкладок.
- `.lib-nav` (`els.libNavBtns`) — Кнопки переключения табов (Playlists/Albums/Artists).

### 🖼️ Overlays (Dynamic Content)
- `#artist-panel` (`#artist-content`) — Оверлей артиста.
- `#album-panel` (`#album-content`) — Оверлей альбома.
- `#playlist-panel` (`#playlist-content-ss`) — Оверлей деталей плейлиста.

---

## 🧠 State Management

### `playerState` (Proxy)
- `isPlaying`: boolean (триггерит `updatePlayPauseUI`)
- `currentTrack`: object (триггерит `updatePlayerUI`)
- `currentTime`, `duration`: number

### `libraryState`
- `playlists`: array (кэш из localStorage)
- `artists`, `albums`: array (кэш из БД)
- `artistIds`, `albumIds`: Set (для быстрой проверки "в библиотеке ли?")
- `needsArtistsSync`, `needsAlbumsSync`: boolean (флаги инвалидации кэша)

---

## ⚙️ Function Map & Logic Branches

### 🔄 Data & Sync
- `syncLibraryIds()` — Синхронизация ID для UI-индикаторов.
- `fetchArtistsSS() / fetchAlbumsSS()` — Подгрузка полных списков.
- `mapToArtistDto() / mapToAlbumDto() / mapToTrackDto()` — Трансформация Qobuz JSON -> Backend DTO.

### 🎧 Playback Flow
- `handleTrackClick(el, isAutoPlay)` — Главный вход для воспроизведения.
  - `buildQueueFromNode(node)` — Строит очередь из текущего контекста (поиск/альбом/плейлист).
  - `updatePlayerUI(track)` — Обновляет метаданные и открывает панель.
- `playAdjacent(direction)` — Переключение треков в очереди.

### 🔘 UI Interactions
- `setActiveLibraryTab(tabName)` — Переключение вкладок библиотеки.
- `openOverlay(id) / closeOverlay(id)` — Управление видимостью панелей.
- `initSwipeForTrackList(container)` — Инициализация свайпов для треков.

---

## 🔗 Event Listeners Chain
1. `DOMContentLoaded` -> Инициализация `els`, `syncLibraryIds()`, `loop()`.
2. `els.searchInput` ('search') -> Вызов API поиска -> `renderResults()`.
3. `els.bottomNavbar` ('click') -> Переключение `.panel.active`.
4. `els.libNavBtns` ('click') -> `setActiveLibraryTab()`.
5. `document` ('click') -> Делегирование для `.back-btn`, `.playlist-card-ss`, `.slide-btn`.

---
*Created by NEXUS PRO for surgical precision editing.*