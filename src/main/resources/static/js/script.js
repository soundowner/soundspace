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
                                trackEl.dataset.artistId = item.performer?.id || item.artist?.id; // Save Artist ID
                                trackEl.dataset.albumId = item.album?.id;                         // Save Album ID
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
    // Global state for current track context
    let currentArtistId = null;
    let currentAlbumId = null;

    async function handleTrackClick(e) {
        const target = e.currentTarget;
        const trackId = target.dataset.trackId;
        
        // Store context IDs for player navigation
        currentArtistId = target.dataset.artistId;
        currentAlbumId = target.dataset.albumId;

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

                // Переключаемся на панель плеера ТОЛЬКО если мы не там и не в оверлее
                const playerPanel = document.getElementById('player-panel');
                const isPlayerActive = playerPanel.classList.contains('active');
                const isOverlayActive = document.querySelector('.overlay-panel.active');

                if (!isPlayerActive && !isOverlayActive) {
                    const playerNavBtn = document.querySelector('[data-panel="player-panel"]');
                    if (playerNavBtn) playerNavBtn.click();
                }
            }
        } catch (err) {
            console.error("Playback error:", err);
        }
    }

    // --- OPEN/CLOSE LOGIC WITH STACKING ---
    function openOverlay(panelId) {
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.classList.add('active');
            // Hide navbar if opening album panel (Immersive Mode)
            if (panelId === 'album-panel') {
                const navbar = document.querySelector('.bottom-navbar');
                if (navbar) navbar.classList.add('hidden-by-overlay');
            }
        }
    }

    function closeOverlay(panelId) {
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.classList.remove('active');
            // Show navbar back if closing album panel
            if (panelId === 'album-panel') {
                const navbar = document.querySelector('.bottom-navbar');
                if (navbar) navbar.classList.remove('hidden-by-overlay');
            }
        }
    }

    // --- Navigation Handlers (Artist & Album) ---
    const artistContainer = document.getElementById('track-artist-container');
    const albumContainer = document.getElementById('track-album-container');
    
    // Close Buttons - Explicitly select and attach
    const closeArtistBtn = document.getElementById('close-artist-panel');
    const closeAlbumBtn = document.getElementById('album-close-fab'); // New FAB ID

    if (closeArtistBtn) {
        closeArtistBtn.addEventListener('click', (e) => {
            console.log('Close Artist Button Clicked');
            e.stopPropagation(); // Prevent bubbling issues
            closeOverlay('artist-panel');
        });
    } else {
        console.error('Close Artist Button NOT found in DOM');
    }

    if (closeAlbumBtn) {
        closeAlbumBtn.addEventListener('click', (e) => {
            closeOverlay('album-panel');
        });
    }

    artistContainer.addEventListener('click', async () => {
        if (!currentArtistId) return;
        openOverlay('artist-panel'); 
        
        try {
            const response = await fetch(`/data/audio/artist?artistId=${currentArtistId}`);
            const data = await response.json();
            renderArtistPanel(data);
        } catch (err) {
            console.error("Failed to fetch artist:", err);
        }
    });

    albumContainer.addEventListener('click', async () => {
        if (!currentAlbumId) return;
        openOverlay('album-panel');
        
        try {
            const response = await fetch(`/data/audio/album?albumId=${currentAlbumId}`);
            const data = await response.json();
            renderAlbumPanel(data);
        } catch (err) {
            console.error("Failed to fetch album:", err);
        }
    });

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

    // --- RENDERING LOGIC (Safe & Optimized) ---

    const getImg = (obj) => obj.image?.large || obj.image?.medium || obj.image?.small || '';

    // Safe Element Creator Helper
    function createElement(tag, className, text = '', attributes = {}) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text) el.textContent = text;
        for (const [key, value] of Object.entries(attributes)) {
            if (value !== undefined && value !== null) {
                el.dataset[key] = value;
            }
        }
        return el;
    }

    // 1. Render Artist Overlay
    function renderArtistPanel(data) {
        const contentContainer = document.getElementById('artist-content');
        contentContainer.replaceChildren(); // Fast & Safe clear

        const frag = document.createDocumentFragment();

        // --- Header ---
        const header = document.createElement('div');
        header.className = 'artist-header';
        header.style.textAlign = 'center';
        header.style.padding = '20px';

        const img = document.createElement('img');
        img.src = getImg(data);
        Object.assign(img.style, { width: '150px', height: '150px', borderRadius: '50%', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', objectFit: 'cover', marginBottom: '15px' });
        
        const name = document.createElement('h1');
        name.textContent = data.name;
        Object.assign(name.style, { fontSize: '2rem', margin: '0', fontWeight: '700' });

        const bio = document.createElement('p');
        // Strip HTML tags for bio text content
        const rawBio = data.biography?.content || "No biography available.";
        const doc = new DOMParser().parseFromString(rawBio, 'text/html');
        const cleanBio = (doc.body.textContent || "").substring(0, 150) + '...';
        bio.textContent = cleanBio;
        Object.assign(bio.style, { color: 'var(--text-secondary)', marginTop: '10px', fontSize: '0.9em', padding: '0 20px' });

        header.append(img, name, bio);
        frag.appendChild(header);

        // --- Popular Tracks ---
        if (data.tracks?.items?.length) {
            const title = document.createElement('h3');
            title.textContent = 'Popular Tracks';
            Object.assign(title.style, { padding: '0 20px', marginBottom: '10px' });
            frag.appendChild(title);

            const list = document.createElement('div');
            list.className = 'track-list';
            list.style.marginBottom = '30px';

            data.tracks.items.forEach(track => {
                const row = document.createElement('div');
                row.className = 'search-result-track playable-track';
                // Dataset for delegation
                row.dataset.trackId = track.id;
                row.dataset.artistId = data.id;
                row.dataset.albumId = track.album?.id;
                row.dataset.title = track.title;
                row.dataset.artist = data.name;
                row.dataset.album = track.album?.title || '';
                row.dataset.cover = track.album?.image?.large || '';

                const cover = document.createElement('img');
                cover.className = 'search-result-track-cover';
                cover.loading = 'lazy';
                cover.src = track.album?.image?.small || '';

                const info = document.createElement('div');
                info.className = 'track-info';
                
                const tTitle = document.createElement('p');
                tTitle.className = 'track-title';
                tTitle.textContent = track.title;

                const tArtist = document.createElement('p');
                tArtist.className = 'track-artist';
                tArtist.textContent = data.name;

                info.append(tTitle, tArtist);
                row.append(cover, info);
                list.appendChild(row);
            });
            frag.appendChild(list);
        }

        // --- Discography (Split by Type) ---
        if (data.albums?.items?.length) {
            const albums = [];
            const singles = [];

            // Logic: < 5 tracks = Single/EP (Adjust threshold as needed)
            data.albums.items.forEach(a => {
                if ((a.tracks_count && a.tracks_count < 5)) {
                    singles.push(a);
                } else {
                    albums.push(a);
                }
            });

            const renderGrid = (items, label) => {
                if (!items.length) return;
                
                const title = document.createElement('h3');
                title.textContent = label;
                Object.assign(title.style, { padding: '0 20px', marginBottom: '10px' });
                frag.appendChild(title);

                const grid = document.createElement('div');
                grid.className = 'albums-grid';
                Object.assign(grid.style, { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '15px', padding: '0 20px', marginBottom: '30px' });

                items.forEach(album => {
                    const card = document.createElement('div');
                    card.className = 'album-card';
                    card.dataset.albumId = album.id; // Critical for navigation
                    Object.assign(card.style, { display: 'flex', flexDirection: 'column', cursor: 'pointer' });

                    const img = document.createElement('img');
                    img.src = getImg(album);
                    img.loading = 'lazy';
                    Object.assign(img.style, { width: '100%', aspectRatio: '1', borderRadius: '12px', objectFit: 'cover', marginBottom: '8px', background: '#222' });

                    const t = document.createElement('span');
                    t.textContent = album.title;
                    Object.assign(t.style, { fontWeight: '600', fontSize: '0.9em', lineHeight: '1.2', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', webkitLineClamp: '2', webkitBoxOrient: 'vertical' });

                    const year = document.createElement('span');
                    year.textContent = new Date(album.release_date_original * 1000).getFullYear() || '';
                    Object.assign(year.style, { color: 'var(--text-secondary)', fontSize: '0.8em', marginTop: '4px' });

                    card.append(img, t, year);
                    grid.appendChild(card);
                });
                frag.appendChild(grid);
            };

            renderGrid(albums, 'Albums');
            renderGrid(singles, 'Singles & EPs');
        }

        contentContainer.appendChild(frag);
    }

    // 2. Render Album Overlay (Gucci 3D Depth Layout - Compact Header)
    function renderAlbumPanel(data) {
        const contentContainer = document.getElementById('album-content');
        contentContainer.replaceChildren();

        const frag = document.createDocumentFragment();
        const artistName = data.artist?.name || "Unknown Artist";

        // --- 1. Fixed Header (Horizontal Compact) ---
        const header = document.createElement('div');
        header.className = 'album-header-fixed';
        // Flex row layout handled by CSS now

        const img = document.createElement('img');
        img.src = getImg(data);
        // Smaller image for compact header
        Object.assign(img.style, { width: '120px', height: '120px', borderRadius: '12px', boxShadow: '0 5px 20px rgba(0,0,0,0.5)', objectFit: 'cover' });

        const infoDiv = document.createElement('div');
        infoDiv.className = 'album-header-info'; // CSS helper class

        const title = document.createElement('h1');
        title.textContent = data.title;
        title.className = 'neon-text';
        Object.assign(title.style, { fontSize: '1.2rem', margin: '0 0 5px 0', lineHeight: '1.1' });

        const artist = document.createElement('p');
        artist.textContent = artistName;
        Object.assign(artist.style, { color: 'var(--accent-primary)', fontWeight: '600', margin: '0', fontSize: '1em' });

        const meta = document.createElement('p');
        const year = new Date(data.released_at * 1000).getFullYear() || '';
        const genre = data.genre?.name || '';
        meta.textContent = `${genre} • ${year}`;
        Object.assign(meta.style, { color: 'rgba(255,255,255,0.6)', fontSize: '0.8em', marginTop: '5px' });

        infoDiv.append(title, artist, meta);
        header.append(img, infoDiv);
        frag.appendChild(header);

        // --- 2. Scrollable Tracklist (Goes under header) ---
        const scrollArea = document.createElement('div');
        scrollArea.className = 'track-list-scroll';

        if (data.tracks?.items) {
            data.tracks.items.forEach((track, index) => {
                const row = document.createElement('div');
                row.className = 'search-result-track playable-track track-row-3d'; // New 3D row style
                
                // Data for delegation
                row.dataset.trackId = track.id;
                row.dataset.artistId = data.artist?.id;
                row.dataset.albumId = data.id;
                row.dataset.title = track.title;
                row.dataset.artist = artistName;
                row.dataset.album = data.title;
                row.dataset.cover = data.image?.large || ''; 

                const idx = document.createElement('div');
                idx.textContent = index + 1;
                idx.className = 'track-index-neon'; // Neon index
                Object.assign(idx.style, { width: '25px', fontSize: '1em', marginRight: '15px', textAlign: 'center' });

                const info = document.createElement('div');
                info.className = 'track-info';

                const tTitle = document.createElement('p');
                tTitle.className = 'track-title';
                tTitle.style.fontSize = '1em';
                tTitle.style.color = '#fff'; // Bright white
                tTitle.textContent = track.title;

                const dur = document.createElement('p');
                dur.className = 'track-artist';
                dur.textContent = formatTime(track.duration);
                dur.style.opacity = '0.7';

                info.append(tTitle, dur);
                row.append(idx, info);
                scrollArea.appendChild(row);
            });
        }
        frag.appendChild(scrollArea);
        contentContainer.appendChild(frag);
    }

    // --- EVENT DELEGATION (Optimized) ---
    const artistPanel = document.getElementById('artist-panel');
    const albumPanel = document.getElementById('album-panel');

    if (artistPanel) {
        artistPanel.addEventListener('click', async (e) => {
            // 1. Album Click
            const albumCard = e.target.closest('.album-card');
            if (albumCard) {
                const albumId = albumCard.dataset.albumId;
                if (!albumId) return;
                
                openOverlay('album-panel');
                try {
                    const response = await fetch(`/data/audio/album?albumId=${albumId}`);
                    const data = await response.json();
                    renderAlbumPanel(data);
                } catch (err) {
                    console.error(err);
                }
                return;
            }
            // 2. Track Click (Delegate to main handler)
            const trackCard = e.target.closest('.playable-track');
            if (trackCard) {
                handleTrackClick({ currentTarget: trackCard });
            }
        });
    }

    if (albumPanel) {
        albumPanel.addEventListener('click', (e) => {
            const trackCard = e.target.closest('.playable-track');
            if (trackCard) {
                handleTrackClick({ currentTarget: trackCard });
            }
        });
    }

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
