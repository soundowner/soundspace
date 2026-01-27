document.addEventListener('DOMContentLoaded', () => {

    // --- 0. STATE MANAGEMENT (PROXY) ---
    const playerState = new Proxy({
        isPlaying: false,
        currentTrack: null,
        currentTime: 0,
        duration: 0
    }, {
        set(target, prop, value) {
            target[prop] = value;
            if (prop === 'isPlaying') updatePlayPauseUI(value);
            if (prop === 'currentTrack') updatePlayerUI(value);
            return true;
        }
    });

    const player = new Audio();
    
    // --- ELEMENTS ---
    const els = {
        parentContainer: document.querySelector('.parent-container'),
        topSearchPanel: document.getElementById('top-search-panel'),
        searchInput: document.getElementById('search-input'),
        searchResults: document.getElementById('search-results-container'),
        
        playerPanel: document.getElementById('player-panel'),
        playerControls: document.getElementById('player-controls-container'), 
        playBtnContainer: document.getElementById('play-button-container'),
        forwardBtn: document.getElementById('forward-button-container'),
        backwardBtn: document.getElementById('backward-button-container'),
        
        timeBarProgress: document.getElementById('timebar-progress'),
        timeBarContainer: document.getElementById('timebar-progress-container'),
        timeCurrent: document.getElementById('current-time'),
        timeDuration: document.getElementById('duration'),
        
        trackTitle: document.getElementById('track-title'),
        trackArtist: document.getElementById('track-artist-label'),
        trackAlbum: document.getElementById('track-album-label'),
        trackCover: document.getElementById('track-cover'),
        trackArtistContainer: document.getElementById('track-artist-container'), 
        trackAlbumContainer: document.getElementById('track-album-container'),   
        
        bgImage: document.querySelector('#player-panel-container-bg-container img'),
        playingBars: document.getElementById('playing-bars'),
        
        artistContent: document.getElementById('artist-content'),
        albumContent: document.getElementById('album-content'),
        
        bottomNavbar: document.querySelector('.bottom-navbar')
    };

    // --- 1. CORE PLAYER LOGIC ---
    function updatePlayerUI(track) {
        if (!track) return;
        if (els.trackTitle) els.trackTitle.textContent = track.title;
        if (els.trackArtist) els.trackArtist.textContent = track.artist;
        if (els.trackAlbum) els.trackAlbum.textContent = track.album;

        if (track.cover) {
            if (els.trackCover) els.trackCover.src = track.cover;
            if (els.bgImage) els.bgImage.src = track.cover;
        }

        if (els.playerPanel && !els.playerPanel.classList.contains('active') && !document.querySelector('.overlay-panel.active')) {
            const openBtn = document.querySelector('[data-panel="player-panel"]');
            if (openBtn) openBtn.click(); 
        }
    }

    function updatePlayPauseUI(isPlaying) {
        if (!els.playBtnContainer) return;
        els.playBtnContainer.innerHTML = '';
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
        els.playBtnContainer.appendChild(icon);
        if (window.lucide) window.lucide.createIcons();
        if (els.playingBars) isPlaying ? els.playingBars.classList.add('active') : els.playingBars.classList.remove('active');
    }

    async function handleTrackClick(el, isAutoPlay = false) {
        // Управление классами UI
        document.querySelectorAll('.search-result-track').forEach(n => {
            n.classList.remove('playing');
            n.classList.remove('show-actions'); // Clear buttons from all tracks
        });
        
        el.classList.add('playing');
        
        // Показываем кнопки только если кликнул человек (isAutoPlay === false)
        if (isAutoPlay === false) {
            requestAnimationFrame(() => {
                el.classList.add('show-actions');
            });
        }

        const meta = {
            id: el.dataset.trackId,
            title: el.dataset.title,
            artist: el.dataset.artist,
            album: el.dataset.album,
            cover: el.dataset.cover,
            artistId: el.dataset.artistId,
            albumId: el.dataset.albumId
        };

        playerState.currentTrack = meta;
        playerState.isPlaying = true;

        try {
            const res = await fetch(`/data/audio/play?trackId=${meta.id}&formatId=6`);
            const data = await res.json();
            if (data.url) {
                player.src = data.url;
                const playPromise = player.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        if (error.name !== 'AbortError') console.error('Playback error:', error);
                    });
                }
            }
        } catch (e) {
            console.error(e);
            playerState.isPlaying = false;
        }
    }

    function playAdjacent(direction) {
        const current = document.querySelector('.search-result-track.playing');
        if (!current) return;
        
        const sibling = direction === 'next' ? current.nextElementSibling : current.previousElementSibling;
        if (sibling && sibling.classList.contains('search-result-track')) {
            handleTrackClick(sibling, true); // Auto-play = true
        }
    }

    // --- 2. SEARCH & NAVIGATION LOGIC ---
    function dismissSearch() {
        if (els.topSearchPanel.classList.contains('active')) {
            els.topSearchPanel.classList.remove('active');
            els.searchInput.blur();
        }
    }

    els.searchInput.addEventListener('search', async (e) => {
        const query = e.target.value.trim();
        dismissSearch();
        if (query.length < 2) return;
        try {
            const res = await fetch(`/data/audio/search?query=${encodeURIComponent(query)}&type=tracks`);
            const data = await res.json();
            renderResults(data.tracks?.items || []);
        } catch (err) { console.error(err); }
    });

    els.parentContainer.addEventListener('touchstart', (e) => {
        if (!els.topSearchPanel.contains(e.target) && els.topSearchPanel.classList.contains('active')) {
            dismissSearch();
        }
    }, { passive: true });

    els.bottomNavbar.addEventListener('click', (e) => {
        const navBtn = e.target.closest('.nav-button');
        if (!navBtn) return;
        const panelId = navBtn.dataset.panel;
        if (panelId === 'close-panel') {
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            els.parentContainer.classList.remove('content-scaled');
            dismissSearch();
            return;
        }
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(panelId);
        if (target) {
            target.classList.add('active');
            els.parentContainer.classList.add('content-scaled');
            if (panelId === 'search-panel') {
                els.topSearchPanel.classList.add('active');
                els.searchInput.focus();
            }
        }
    });

    document.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('.back-btn, .close-fab, #close-artist-panel, #album-close-fab');
        if (closeBtn) {
            const panel = closeBtn.closest('.panel');
            if (panel) closeOverlay(panel.id);
        }
        const actionBtn = e.target.closest('.action-btn');
        if (actionBtn) {
            actionBtn.classList.toggle('active');
            e.stopPropagation();
        }
    });

    // --- 3. CONTAINER-SPECIFIC EVENT LISTENERS (DELEGATION) ---
    if (els.searchResults) {
        els.searchResults.addEventListener('click', (e) => {
            const trackCard = e.target.closest('.search-result-track');
            // If user clicked the slide buttons themselves, don't re-trigger track click
            if (trackCard && !e.target.closest('.track-actions-slide')) {
                handleTrackClick(trackCard, false); // false = manual click, buttons will slide out
            }
        });
    }

    if (els.artistContent) {
        els.artistContent.addEventListener('click', (e) => {
            const trackRow = e.target.closest('.playable-track');
            if (trackRow && !e.target.closest('.track-actions-slide')) {
                handleTrackClick(trackRow, false); // Manual click
                return;
            }
            const albumCard = e.target.closest('.album-card');
            if (albumCard) {
                const id = albumCard.dataset.albumId;
                openOverlay('album-panel');
                loadAlbum(id);
            }
        });
    }

    if (els.albumContent) {
        els.albumContent.addEventListener('click', (e) => {
            const trackRow = e.target.closest('.playable-track');
            if (trackRow && !e.target.closest('.track-actions-slide')) {
                handleTrackClick(trackRow, false); // Manual click
            }
        });
    }

    // --- 4. PLAYER CONTROLS LISTENERS ---
    if (els.playBtnContainer) {
        els.playBtnContainer.addEventListener('click', () => {
            player.paused ? player.play() : player.pause();
        });
    }
    if (els.forwardBtn) els.forwardBtn.addEventListener('click', () => playAdjacent('next'));
    if (els.backwardBtn) els.backwardBtn.addEventListener('click', () => playAdjacent('prev'));

    if (els.timeBarContainer) {
        els.timeBarContainer.addEventListener('click', (e) => {
            const width = els.timeBarContainer.offsetWidth;
            const clickX = e.offsetX;
            if (player.duration) player.currentTime = (clickX / width) * player.duration;
        });
    }

    if (els.trackArtistContainer) {
        els.trackArtistContainer.addEventListener('click', () => {
            if (playerState.currentTrack?.artistId) {
                 openOverlay('artist-panel');
                 loadArtist(playerState.currentTrack.artistId);
            }
        });
    }

    if (els.trackAlbumContainer) {
        els.trackAlbumContainer.addEventListener('click', () => {
            if (playerState.currentTrack?.albumId) {
                 openOverlay('album-panel');
                 loadAlbum(playerState.currentTrack.albumId);
            }
        });
    }

    // --- 5. RENDERERS & FETCHERS ---
    function renderResults(items) {
        els.searchResults.innerHTML = items.map(item => `
            <div class="search-result-track"
                 data-track-id="${item.id}"
                 data-artist-id="${item.performer?.id || item.artist?.id}"
                 data-album-id="${item.album?.id}"
                 data-title="${escapeHtml(item.title)}"
                 data-artist="${escapeHtml(item.performer?.name || item.artist?.name)}"
                 data-album="${escapeHtml(item.album?.title)}"
                 data-cover="${item.album?.image?.large || item.image?.large || ''}">
                <img src="${item.album?.image?.small || item.image?.small}" class="search-result-track-cover" loading="lazy">
                <div class="track-info">
                    <p class="track-title">${escapeHtml(item.title)}</p>
                    <p class="track-artist">${escapeHtml(item.performer?.name || item.artist?.name)}</p>
                </div>
                <div class="track-actions-slide" onclick="event.stopPropagation()">
                    <button class="slide-btn"><i data-lucide="heart"></i></button>
                    <button class="slide-btn"><i data-lucide="plus"></i></button>
                </div>
            </div>
        `).join('');
        if(window.lucide) lucide.createIcons();
    }

    async function loadArtist(id) {
        if (els.artistContent.dataset.loadedId === id) return;
        els.artistContent.dataset.loadedId = id;
        els.artistContent.innerHTML = '<div style="padding:40px; text-align:center">Loading Frequency...</div>';
        try {
            const res = await fetch(`/data/audio/artist?artistId=${id}`);
            const data = await res.json();
            renderArtistPanel(data);
        } catch (e) { console.error(e); }
    }

    async function loadAlbum(id) {
        if (els.albumContent.dataset.loadedId === id) return;
        els.albumContent.dataset.loadedId = id;
        els.albumContent.innerHTML = '<div style="padding:40px; text-align:center">Loading Geometry...</div>';
        try {
            const res = await fetch(`/data/audio/album?albumId=${id}`);
            const data = await res.json();
            renderAlbumPanel(data);
        } catch (e) { console.error(e); }
    }

    function renderArtistPanel(data) {
        const content = els.artistContent;
        content.replaceChildren();
        content.className = 'relative bg-black overflow-hidden font-sans';
        content.style.height = '90%';

        const imgUrl = getImg(data);
        const trackList = data.tracks?.items || [];

        const bgContainer = document.createElement('div');
        bgContainer.className = 'absolute inset-0 z-0 pointer-events-none';
        bgContainer.innerHTML = `<div class="absolute inset-0 bg-cover bg-center transition-opacity duration-700 opacity-0" style="background-image: url('${imgUrl}'); opacity: 0.2;"></div>`;
        requestAnimationFrame(() => bgContainer.firstElementChild?.classList.remove('opacity-0'));
        content.appendChild(bgContainer);

        const header = document.createElement('div');
        header.className = 'absolute top-0 left-0 w-full h-[20dvh] z-20 flex flex-col justify-end px-6 pb-4 pointer-events-none select-none';
        header.innerHTML = `
            <p class="text-[coral] text-[10px] font-extrabold tracking-[0.3em] mb-0.5 leading-none uppercase">ARTIST</p>
            <h1 class="text-white text-[2.5rem] font-normal uppercase tracking-tighter leading-[0.85] m-0 line-clamp-2 text-ellipsis overflow-hidden">${escapeHtml(data.name)}</h1>
        `;
        content.appendChild(header);

        const scrollArea = document.createElement('div');
        scrollArea.className = 'absolute left-0 right-0 bottom-0 z-10 overflow-y-auto no-scrollbar pt-2 pb-32 px-4';
        scrollArea.style.top = '25%';

        const list = document.createElement('div');
        list.className = 'flex flex-col w-full space-y-2 mb-12';

        trackList.forEach((t) => {
            const row = document.createElement('div');
            row.className = 'group flex items-center justify-between py-4 px-6 border-b border-white/5 active:bg-white/10 transition-colors cursor-pointer playable-track search-result-track';
            row.dataset.trackId = t.id;
            row.dataset.artistId = data.id;
            row.dataset.albumId = t.album?.id;
            row.dataset.title = escapeHtml(t.title);
            row.dataset.artist = escapeHtml(data.name);
            row.dataset.album = escapeHtml(t.album?.title);
            row.dataset.cover = getImg(t.album);

            row.innerHTML = `
                <div class="flex-1 min-w-0 mr-4">
                    <h4 class="text-white font-medium text-[20px] truncate leading-tight group-hover:text-white/90">${escapeHtml(t.title)}</h4>
                </div>
                <div class="text-neutral-500 text-[13px] font-medium whitespace-nowrap">${formatTime(t.duration)}</div>
                <div class="track-actions-slide" onclick="event.stopPropagation()">
                    <button class="slide-btn"><i data-lucide="heart"></i></button>
                    <button class="slide-btn"><i data-lucide="plus"></i></button>
                </div>
            `;
            list.appendChild(row);
        });
        scrollArea.appendChild(list);

        if (data.albums?.items?.length) {
            const grid = document.createElement('div');
            grid.className = 'grid grid-cols-2 gap-4 pb-12';
            data.albums.items.forEach(album => {
                const card = document.createElement('div');
                card.className = 'relative aspect-square w-full overflow-hidden rounded-xl bg-white/5 cursor-pointer active:scale-95 transition-transform album-card';
                card.dataset.albumId = album.id;
                card.innerHTML = `
                    <img src="${getImg(album)}" class="w-full h-full object-cover" loading="lazy" />
                    <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent"></div>
                    <div class="absolute bottom-0 left-0 p-3 w-full"><p class="text-[coral] text-sm font-bold truncate leading-tight drop-shadow-md">${escapeHtml(album.title)}</p></div>
                `;
                grid.appendChild(card);
            });
            scrollArea.appendChild(grid);
        }
        content.appendChild(scrollArea);
        if(window.lucide) lucide.createIcons();
    }

    function renderAlbumPanel(data) {
        const content = els.albumContent;
        content.replaceChildren();
        const header = document.createElement('div');
        header.className = 'album-header-fixed';
        header.style.cssText = 'display:flex; flex-direction:row; align-items:flex-end; padding:40px 20px 20px; background:linear-gradient(180deg, #1e1e1e 0%, #0f0f0f 100%); gap:20px;';
        header.innerHTML = `
            <img src="${getImg(data)}" style="width:120px; height:120px; border-radius:12px; box-shadow:0 5px 20px rgba(0,0,0,0.5); object-fit:cover">
            <div class="album-header-info">
                <h1 class="neon-text" style="font-size:1.2rem; margin:0 0 5px 0; lineHeight:1.1; color:#fff; text-shadow:0 0 12px rgba(255,255,255,0.5); font-weight:700;">${escapeHtml(data.title)}</h1>
                <p style="color:coral; font-weight:600; margin:0">${escapeHtml(data.artist?.name)}</p>
                <p style="color:rgba(255,255,255,0.6); font-size:0.8em; margin-top:5px">${new Date(data.released_at * 1000).getFullYear()} • ${escapeHtml(data.genre?.name || 'Music')}</p>
            </div>
        `;
        const scroll = document.createElement('div');
        scroll.className = 'track-list-scroll';
        if (data.tracks?.items) {
            data.tracks.items.forEach((t, i) => {
                const row = document.createElement('div');
                row.className = 'search-result-track playable-track track-row-3d';
                row.dataset.trackId = t.id;
                row.dataset.artistId = data.artist?.id;
                row.dataset.albumId = data.id;
                row.dataset.title = escapeHtml(t.title);
                row.dataset.artist = escapeHtml(data.artist?.name);
                row.dataset.album = escapeHtml(data.title);
                row.dataset.cover = getImg(data);
                row.innerHTML = `
                     <div class="track-index-neon" style="width:25px; text-align:center; margin-right:15px; color:coral; font-weight:bold">${i+1}</div>
                     <div class="track-info">
                        <p class="track-title" style="color:#fff">${escapeHtml(t.title)}</p>
                        <p class="track-artist" style="opacity:0.7">${formatTime(t.duration)}</p>
                     </div>
                     <div class="track-actions-slide" onclick="event.stopPropagation()">
                        <button class="slide-btn"><i data-lucide="heart"></i></button>
                        <button class="slide-btn"><i data-lucide="plus"></i></button>
                     </div>
                `;
                scroll.appendChild(row);
            });
        }
        content.appendChild(header);
        content.appendChild(scroll);
        if(window.lucide) lucide.createIcons();
    }

    function openOverlay(id) {
        document.getElementById(id).classList.add('active');
        if(id === 'album-panel') document.querySelector('.bottom-navbar').classList.add('hidden-by-overlay');
    }
    function closeOverlay(id) {
        document.getElementById(id).classList.remove('active');
        if(id === 'album-panel') document.querySelector('.bottom-navbar').classList.remove('hidden-by-overlay');
    }
    function formatTime(s) {
        if (!s) return '0:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
    }
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
    function getImg(item) {
        if (!item) return '';
        if (item.image) return item.image.large || item.image.medium || item.image.small || '';
        if (item.album && item.album.image) return item.album.image.large || item.album.image.medium || item.album.image.small || '';
        return '';
    }

    function loop() {
        if (!player.paused && player.duration) {
            const pct = (player.currentTime / player.duration) * 100;
            els.timeBarProgress.style.width = `${pct}%`;
            els.timeCurrent.textContent = formatTime(player.currentTime);
        }
        requestAnimationFrame(loop);
    }
    loop();

    player.addEventListener('loadedmetadata', () => {
        playerState.duration = player.duration;
        els.timeDuration.textContent = formatTime(player.duration);
    });
    player.addEventListener('ended', () => playAdjacent('next'));
    if(window.lucide) window.lucide.createIcons();
});
