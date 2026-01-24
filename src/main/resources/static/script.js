document.addEventListener('DOMContentLoaded', () => {
    // --- ИНИЦИАЛИЗАЦИЯ ---
    const player = new Audio();
    const navButtons = document.querySelectorAll('.nav-button');
    const panels = document.querySelectorAll('.panel');
    const parentContainer = document.querySelector('.parent-container');
    const topSearchPanel = document.getElementById('top-search-panel');
    const searchInput = document.getElementById('search-input');
    const searchResultsContainer = document.getElementById('search-results-container');

    // Элементы плеера
    const timebarProgress = document.getElementById('timebar-progress');
    const timebarProgressContainer = document.getElementById('timebar-progress-container'); // NEW
    const playButton = document.getElementById('play-button-container');
    const trackCover = document.getElementById('track-cover');
    const bgImage = document.querySelector('#player-panel-container-bg-container img');
    const trackTitleLabel = document.getElementById('track-title');
    const trackArtistLabel = document = document.getElementById('track-artist-label');
    const trackAlbumLabel = document.getElementById('track-album-label');
    const currentTimeEl = document.getElementById('current-time');
    const durationEl = document.getElementById('duration');

    // Настройка GPU-ускорения для таймбара
    if (timebarProgress) {
        timebarProgress.style.cssText = 'width: 0%;';
    }

    // Добавляем обработчик клика для перемотки
    if (timebarProgressContainer) {
        timebarProgressContainer.addEventListener('click', (e) => {
            const progressBarWidth = timebarProgressContainer.offsetWidth;
            const clickX = e.offsetX;
            const seekTime = (clickX / progressBarWidth) * player.duration;
            if (player.duration) { // Убедиться, что длительность доступна
                player.currentTime = seekTime;
            }
        });
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    // --- Централизованные функции управления UI ---
    function dismissSearch() {
        if (topSearchPanel.classList.contains('active')) {
            topSearchPanel.classList.remove('active');
            searchInput.value = '';
            searchInput.blur();
        }
    }

    function closeAllPanels() {
        panels.forEach(p => p.classList.remove('active'));
        parentContainer.classList.remove('content-scaled');
        dismissSearch(); // Также убираем поиск, если он был активен
    }

    // --- ЛОГИКА ПАНЕЛЕЙ (UI) ---
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const panelId = button.getAttribute('data-panel');

            if (panelId === 'close-panel') {
                closeAllPanels();
                return;
            }

            const targetPanel = document.getElementById(panelId);
            
            // Always close all panels first to ensure a clean state,
            // including dismissing the search UI if active.
            closeAllPanels(); 

            if (targetPanel) {
                targetPanel.classList.add('active');
                parentContainer.classList.add('content-scaled');
                // Always activate search input if the search panel is the target
                if (panelId === 'search-panel') {
                    topSearchPanel.classList.add('active');
                    searchInput.focus(); // Focus and bring up keyboard
                }
            }
        });
    });

    // --- Логика скрытия клавиатуры при касании вне поля ввода ---
    parentContainer.addEventListener('touchstart', (e) => {
        // Не закрывать, если касание было внутри верхнего поискового бара
        if (!topSearchPanel.contains(e.target)) {
            dismissSearch();
        }
    }, { passive: true });


    // --- ПОИСК (срабатывает при нажатии "поиск" на клавиатуре) ---
    searchInput.addEventListener('search', async (e) => {
        const query = e.target.value.trim();
        
        dismissSearch(); // Немедленно убираем клавиатуру и инпут

        if (query.length < 2) return;

        try {
            const response = await fetch(`/data/audio/search?query=${encodeURIComponent(query)}&type=tracks`);
            const data = await response.json();
            renderResults(data.tracks?.items || []);
        } catch (err) {
            console.error("Search error:", err);
        }
    });

    function renderResults(items) {
        searchResultsContainer.innerHTML = '';
        const fragment = document.createDocumentFragment();

        items.forEach((item) => {
            const trackEl = document.createElement('div');
            trackEl.className = 'search-result-track';

            // СОХРАНЯЕМ ID И ДАННЫЕ В DATA-АТРИБУТЫ
            trackEl.dataset.trackId = item.id;
            trackEl.dataset.title = item.title;
            trackEl.dataset.artist = item.performer?.name || item.artist?.name || "Unknown Artist";
            trackEl.dataset.album = item.album?.title || "Unknown Album";
            trackEl.dataset.cover = item.album?.image?.large || item.image?.large || "";

            // Создаем контент (без innerHTML для безопасности)
            const img = document.createElement('img');
            img.className = 'search-result-track-cover';
            img.src = item.album?.image?.small || item.image?.small || "";
            img.loading = 'lazy';

            const infoDiv = document.createElement('div');
            infoDiv.className = 'track-info';

            const titleP = document.createElement('p');
            titleP.className = 'track-title';
            titleP.textContent = item.title;

            const artistP = document.createElement('p');
            artistP.className = 'track-artist';
            artistP.textContent = trackEl.dataset.artist;

            infoDiv.append(titleP, artistP);
            trackEl.append(img, infoDiv);

            // Навешиваем событие клика
            trackEl.addEventListener('click', handleTrackClick);
            fragment.appendChild(trackEl);
        });

        searchResultsContainer.appendChild(fragment);
    }

    // --- ОБРАБОТКА КЛИКА И ВЫЗОВ /PLAY ---
    async function handleTrackClick(e) {
        const target = e.currentTarget;
        const trackId = target.dataset.trackId;

        // Управление классом 'playing'
        const currentlyPlaying = document.querySelector('.search-result-track.playing');
        if (currentlyPlaying) {
            currentlyPlaying.classList.remove('playing');
        }
        target.classList.add('playing');

        // Визуальный фидбек (опционально)
        console.log("Loading track ID:", trackId);

        try {
            // ПОДСТАВЛЯЕМ ID В ЗАПРОС
            const response = await fetch(`/data/audio/play?trackId=${trackId}&formatId=6`);
            const data = await response.json();

            if (data.url) {
                player.src = data.url;
                player.play();

                // Обновляем плеер данными из дата-атрибутов
                trackTitleLabel.textContent = target.dataset.title;
                trackArtistLabel.textContent = target.dataset.artist;
                trackAlbumLabel.textContent = target.dataset.album;
                trackCover.src = target.dataset.cover;
                bgImage.src = target.dataset.cover;

                // Переключаемся на панель плеера
                const playerNavBtn = document.querySelector('[data-panel="player-panel"]');
                if (playerNavBtn) playerNavBtn.click();
            }
        } catch (err) {
            console.error("Playback error:", err);
        }
    }

    // --- ACTIONS LOGIC (Static) ---
    const actionBtns = document.querySelectorAll('.actions-view-static .action-btn');

    // Handle Action Buttons (Radio Logic)
    actionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Remove active class from all others
            actionBtns.forEach(b => b.classList.remove('active'));
            
            // Add active class to clicked
            btn.classList.add('active');
            
            console.log('Action active:', btn.id);
        });
    });

    // --- ТАЙМБАР (Плавный цикл через requestAnimationFrame) ---
    function updateProgressLoop() {
        if (!player.paused && player.duration) {
            const progress = player.currentTime / player.duration;
            timebarProgress.style.width = `${progress * 100}%`;
            currentTimeEl.textContent = formatTime(player.currentTime);
        }
        requestAnimationFrame(updateProgressLoop);
    }
    requestAnimationFrame(updateProgressLoop);

    // --- Управление иконками Play/Pause (Lucide) и Барами ---
    const playingBars = document.getElementById('playing-bars');

    function switchPlayPauseIcon(state) {
        playButton.innerHTML = ''; // Очищаем кнопку
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', state === 'play' ? 'play' : 'pause');
        playButton.appendChild(icon);
        lucide.createIcons(); // Перерисовываем иконку
        
        // Toggle Bars
        if (state === 'pause') { // Playing
            playingBars.classList.add('active');
        } else {
            playingBars.classList.remove('active');
        }
    }

    player.addEventListener('play', () => {
        switchPlayPauseIcon('pause');
    });

    player.addEventListener('pause', () => {
        switchPlayPauseIcon('play');
    });

    player.addEventListener('loadedmetadata', () => {
        durationEl.textContent = formatTime(player.duration);
    });

    playButton.addEventListener('click', () => {
        player.paused ? player.play() : player.pause();
    });

    // --- Logic for forward/backward buttons ---
    const backwardButton = document.getElementById('backward-button-container');
    const forwardButton = document.getElementById('forward-button-container');

    function playAdjacentTrack(direction) {
        const currentlyPlaying = document.querySelector('.search-result-track.playing');
        if (!currentlyPlaying) return;

        const sibling = direction === 'next' ? currentlyPlaying.nextElementSibling : currentlyPlaying.previousElementSibling;

        if (sibling && sibling.classList.contains('search-result-track')) {
            sibling.click();
        }
    }

    forwardButton.addEventListener('click', () => playAdjacentTrack('next'));
    backwardButton.addEventListener('click', () => playAdjacentTrack('previous'));
    // --- End Logic for forward/backward buttons ---

    // Автоматическое воспроизведение следующего трека
    player.addEventListener('ended', () => {
        const currentlyPlaying = document.querySelector('.search-result-track.playing');
        if (currentlyPlaying) {
            const nextTrack = currentlyPlaying.nextElementSibling;
            if (nextTrack && nextTrack.classList.contains('search-result-track')) {
                nextTrack.click();
            }
        }
    });

    // Первичная отрисовка иконок Lucide
    lucide.createIcons();
});
