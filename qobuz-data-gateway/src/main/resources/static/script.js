// --- FETCH INTERCEPTOR FOR AUTO-REFRESH ---
const originalFetch = window.fetch;
window.fetch = async (url, options) => {
    let response = await originalFetch(url, options);

    if (response.status === 401) {
        try {
            const refreshRes = await originalFetch('/auth/refresh');
            if (refreshRes.ok) {
                response = await originalFetch(url, options);
            } else {
                window.location.href = '/login.html';
            }
        } catch (err) {
            window.location.href = '/login.html';
        }
    }
    return response;
};

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
    const trackCache = new Map();
    
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
        
        bottomNavbar: document.querySelector('.bottom-navbar'),

        // Library Elements
        libraryPanel: document.getElementById('library-panel'),
        playlistsContainer: document.getElementById('playlists-grid-ss'),
        createPlaylistBtn: document.getElementById('create_playlist_btn'),
        createPlaylistModal: document.getElementById('create-playlist-modal'),
        createPlaylistConfirm: document.getElementById('create-playlist-confirm'),
        createPlaylistCancel: document.getElementById('create-playlist-cancel'),
        playlistTitleInput: document.getElementById('playlist_title'),
        playlistDescInput: document.getElementById('playlist_description'),

        // Playlist Detail
        playlistPanel: document.getElementById('playlist-panel'),
        playlistContent: document.getElementById('playlist-content-ss'),
        playlistCloseFab: document.getElementById('playlist-close-fab'),

        // Add to Playlist Modal
        addToPlaylistModal: document.getElementById('add-to-playlist-modal'),
        selectPlaylistList: document.getElementById('select-playlist-list'),
        addToPlaylistCancel: document.getElementById('add-to-playlist-cancel')
    };

    let libraryState = {
        playlists: JSON.parse(localStorage.getItem('ss_playlists') || '[]'),
        lastUpdated: localStorage.getItem('ss_library_updated')
    };

    // --- MAPPING HELPERS ---
    
    function mapQobuzImageToDto(qobuzImg) {
        if (!qobuzImg) return null;
        return {
            small: qobuzImg.small,
            medium: qobuzImg.thumbnail || qobuzImg.medium, // Qobuz uses 'thumbnail' for albums, 'medium' for artists
            large: qobuzImg.large
        };
    }

    function mapToTrackDto(qobuzTrack) {
        if (!qobuzTrack) return null;
        
        // Deep copy to avoid mutating cache
        const t = JSON.parse(JSON.stringify(qobuzTrack));
        
        // Ensure album structure
        if (t.album) {
            t.album.image = mapQobuzImageToDto(t.album.image);
            if (t.album.artist) {
                t.album.artist.image = mapQobuzImageToDto(t.album.artist.image);
            }
        }
        
        // Ensure performers string (Backend uses this field)
        if (!t.performers && t.performer) {
            t.performers = t.performer.name;
        } else if (!t.performers && t.artist) {
            t.performers = t.artist.name;
        }

        // Return object matching TrackDto.java
        return {
            id: Number(t.id),
            title: t.title,
            version: t.version,
            isrc: t.isrc,
            duration: t.duration,
            track_number: t.track_number || t.position,
            performers: t.performers,
            parental_warning: t.parental_warning,
            hires: t.hires,
            maximum_bit_depth: t.maximum_bit_depth,
            maximum_sampling_rate: t.maximum_sampling_rate,
            maximum_technical_specifications: t.maximum_technical_specifications,
            release_date_original: t.release_date_original,
            album: t.album ? {
                id: String(t.album.id),
                title: t.album.title,
                version: t.album.version,
                subtitle: t.album.subtitle,
                upc: t.album.upc,
                url: t.album.url,
                qobuz_id: t.album.qobuz_id,
                is_official: t.album.is_official,
                tracks_count: t.album.tracks_count,
                duration: t.album.duration,
                maximum_bit_depth: t.album.maximum_bit_depth,
                maximum_sampling_rate: t.album.maximum_sampling_rate,
                maximum_technical_specifications: t.album.maximum_technical_specifications,
                hires: t.album.hires,
                release_date_original: t.album.release_date_original,
                release_type: t.album.release_type,
                popularity: t.album.popularity,
                description: t.album.description,
                image: t.album.image, // Already mapped
                artist: t.album.artist ? {
                    id: Number(t.album.artist.id),
                    name: t.album.artist.name,
                    slug: t.album.artist.slug,
                    albums_count: t.album.artist.albums_count,
                    image: t.album.artist.image // Already mapped
                } : null
            } : null
        };
    }

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
        document.querySelectorAll('.search-result-track').forEach(n => {
            n.classList.remove('playing');
            n.classList.remove('show-actions');
        });
        
        el.classList.add('playing');
        
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
            handleTrackClick(sibling, true);
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
            if (panelId === 'library-panel') {
                fetchPlaylistsSS();
            }
        }
    });

    // --- LIBRARY LOGIC ---
    function saveLibraryToLocal() {
        localStorage.setItem('ss_playlists', JSON.stringify(libraryState.playlists));
        localStorage.setItem('ss_library_updated', new Date().toISOString());
    }

    async function fetchPlaylistsSS() {
        if (!els.playlistsContainer) return;
        renderPlaylistsSS(libraryState.playlists);

        try {
            const res = await fetch('/library/playlists');
            if (res.ok) {
                const playlists = await res.json();
                libraryState.playlists = playlists.map(newPl => {
                    const existing = libraryState.playlists.find(p => p.id === newPl.id);
                    return existing ? { ...newPl, tracks: existing.tracks } : newPl;
                });
                saveLibraryToLocal();
                renderPlaylistsSS(libraryState.playlists);
            }
        } catch (e) { console.error('Library sync failed', e); }
    }

    function renderPlaylistsSS(playlists) {
        if (!playlists || playlists.length === 0) {
            els.playlistsContainer.innerHTML = '<div class="empty-state-ss">No playlists yet</div>';
            return;
        }
        
        els.playlistsContainer.innerHTML = playlists.map(pl => `
            <div class="playlist-card-ss" data-id="${pl.id}">
                <div class="playlist-cover-ss">
                    ${pl.coverImage ? `<img src="${pl.coverImage}" loading="lazy">` : '<span class="material-symbols-outlined" style="font-size:2rem; color:rgba(255,255,255,0.1)">music_note</span>'}
                </div>
                <div class="playlist-info-ss">
                    <h4>${escapeHtml(pl.title)}</h4>
                    <p>${pl.trackCount || pl.tracks?.length || 0} tracks</p>
                </div>
                <div class="ss-playlist-arrow">
                    <span class="material-symbols-outlined">chevron_right</span>
                </div>
            </div>
        `).join('');
    }

    async function handlePlaylistClickSS(id) {
        openOverlay('playlist-panel');
        els.playlistContent.innerHTML = '<div style="padding:40px; text-align:center">Loading Spirits...</div>';

        try {
            const res = await fetch(`/library/playlists/${id}/tracks`);
            if (res.ok) {
                const tracks = await res.json();
                const pl = libraryState.playlists.find(p => p.id === id);
                if (pl) {
                    pl.tracks = tracks;
                    saveLibraryToLocal();
                }
                renderPlaylistDetailSS(pl || { title: 'Playlist', tracks });
            }
        } catch (e) { console.error(e); }
    }

    function renderPlaylistDetailSS(playlist) {
        const content = els.playlistContent;
        content.replaceChildren();
        content.className = 'ss-playlist-view'; 
        
        const coverUrl = playlist.coverImage || (playlist.tracks?.length ? getImg(playlist.tracks[0]) : '');
        
        const headerWrapper = document.createElement('div');
        headerWrapper.className = 'ss-playlist-header-wrapper';
        headerWrapper.innerHTML = `
            <div class="ss-label-header">PLAYLIST</div>
            <div class="ss-playlist-header">
                <div class="ss-cover-container">
                    ${coverUrl ? `<img src="${coverUrl}" class="ss-main-cover-mini">` : '<div class="ss-main-cover-mini" style="background:#222; display:flex; align-items:center; justify-content:center;"><span class="material-symbols-outlined" style="font-size:3rem; color:#444">music_note</span></div>'}
                    <button class="ss-play-mini-btn">
                        <span class="material-symbols-outlined">play_arrow</span>
                    </button>
                </div>
                <div class="ss-header-text-block">
                    <h1 class="ss-title-huge">${escapeHtml(playlist.title)}</h1>
                    <div class="ss-label-header" style="margin-top:8px; color:rgba(255,255,255,0.2);">${playlist.trackCount || playlist.tracks?.length || 0} TRACKS</div>
                </div>
            </div>
        `;

        const trackList = document.createElement('div');
        trackList.className = 'ss-acid-list no-scrollbar';
        
        if (playlist.tracks) {
            playlist.tracks.forEach((t) => {
                const row = document.createElement('div');
                row.className = 'ss-acid-row search-result-track'; 
                
                row.innerHTML = `
                    <div class="ss-acid-row-content playable-track" 
                         data-track-id="${t.id}"
                         data-title="${escapeHtml(t.title)}"
                         data-artist="${escapeHtml(t.performers || t.album?.artist?.name || 'Unknown')}"
                         data-artist-id="${t.album?.artist?.id || ''}"
                         data-album="${escapeHtml(t.album?.title || '')}"
                         data-album-id="${t.album?.id || ''}"
                         data-cover="${getImg(t)}">
                        <div class="ss-acid-title">${escapeHtml(t.title)}</div>
                        <div class="ss-acid-time">${formatTime(t.duration)}</div>
                    </div>
                    <button class="ss-delete-track-btn">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                `;

                // Long Press Logic
                let pressTimer;
                const startPress = () => {
                    pressTimer = setTimeout(() => {
                        row.classList.add('show-delete');
                    }, 600);
                };
                const endPress = () => clearTimeout(pressTimer);

                row.addEventListener('mousedown', startPress);
                row.addEventListener('touchstart', startPress, { passive: true });
                row.addEventListener('mouseup', endPress);
                row.addEventListener('mouseleave', endPress);
                row.addEventListener('touchend', endPress);

                // Delete Logic
                row.querySelector('.ss-delete-track-btn').onclick = async (e) => {
                    e.stopPropagation();
                    try {
                        const res = await fetch(`/library/playlists/${playlist.id}/tracks/${t.id}`, { method: 'DELETE' });
                        if (res.ok) {
                            row.style.opacity = '0';
                            row.style.transform = 'scale(0.9)';
                            setTimeout(() => row.remove(), 300);
                            
                            const pl = libraryState.playlists.find(p => p.id === playlist.id);
                            if (pl && pl.tracks) {
                                pl.tracks = pl.tracks.filter(track => track.id !== t.id);
                                pl.trackCount = Math.max(0, pl.trackCount - 1);
                                saveLibraryToLocal();
                                
                                const countEl = headerWrapper.querySelector('.ss-label-header[style*="margin-top:8px"]');
                                if (countEl) countEl.textContent = `${pl.trackCount} TRACKS`;
                                renderPlaylistsSS(libraryState.playlists);
                            }
                        }
                    } catch (err) { console.error(err); }
                };

                trackList.appendChild(row);
            });
        }

        content.appendChild(headerWrapper);
        content.appendChild(trackList);

        // Play All Logic
        headerWrapper.querySelector('.ss-play-mini-btn').onclick = () => {
            const first = trackList.querySelector('.playable-track');
            if (first) handleTrackClick(first, false);
        };
    }

    if (els.createPlaylistBtn) {
        els.createPlaylistBtn.addEventListener('click', () => {
            els.createPlaylistModal.classList.remove('hidden');
            els.playlistTitleInput.focus();
        });
    }

    if (els.createPlaylistCancel) {
        els.createPlaylistCancel.addEventListener('click', () => {
            els.createPlaylistModal.classList.add('hidden');
        });
    }

    if (els.createPlaylistConfirm) {
        els.createPlaylistConfirm.addEventListener('click', async () => {
            const title = els.playlistTitleInput.value.trim();
            const desc = els.playlistDescInput.value.trim();
            if (!title) return;

            try {
                const res = await fetch('/library/playlists', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, description: desc })
                });
                
                if (res.ok) {
                    const newPl = await res.json();
                    libraryState.playlists.unshift(newPl);
                    saveLibraryToLocal();
                    els.createPlaylistModal.classList.add('hidden');
                    els.playlistTitleInput.value = '';
                    els.playlistDescInput.value = '';
                    renderPlaylistsSS(libraryState.playlists);
                }
            } catch (e) { console.error(e); }
        });
    }

    // --- ADD TRACK TO PLAYLIST LOGIC ---
    let trackToAdd = null;

    function openAddToPlaylistModal(trackData) {
        trackToAdd = trackData;
        els.addToPlaylistModal.classList.remove('hidden');
        els.selectPlaylistList.innerHTML = libraryState.playlists.map(pl => `
            <div class="ss-playlist-select-item" data-id="${pl.id}">
                <div class="ss-playlist-select-cover">
                    ${pl.coverImage ? `<img src="${pl.coverImage}">` : '<i class="fa-solid fa-music"></i>'}
                </div>
                <div class="ss-playlist-select-info">
                    <h4>${escapeHtml(pl.title)}</h4>
                    <p>${pl.tracks?.length || 0} tracks</p>
                </div>
            </div>
        `).join('');
    }

    if (els.addToPlaylistCancel) {
        els.addToPlaylistCancel.addEventListener('click', () => {
            els.addToPlaylistModal.classList.add('hidden');
            trackToAdd = null;
        });
    }

    if (els.selectPlaylistList) {
        els.selectPlaylistList.addEventListener('click', async (e) => {
            const item = e.target.closest('.ss-playlist-select-item');
            if (!item || !trackToAdd) return;
            const playlistId = item.dataset.id;
            
            // Map full cached object to Backend DTO
            const trackPayload = mapToTrackDto(trackToAdd);

            try {
                const res = await fetch(`/library/playlists/${playlistId}/tracks`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(trackPayload)
                });
                if (res.ok) {
                    els.addToPlaylistModal.classList.add('hidden');
                    
                    // Update local state and UI immediately
                    const pl = libraryState.playlists.find(p => p.id === playlistId);
                    if (pl) {
                        if (!pl.tracks) pl.tracks = [];
                        pl.tracks.push(trackPayload);
                        pl.trackCount = (pl.trackCount || 0) + 1; // Increment count
                        saveLibraryToLocal();
                        renderPlaylistsSS(libraryState.playlists);
                    }
                }
            } catch (e) { console.error(e); }
        });
    }

    document.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('.back-btn, .close-fab, #close-artist-panel, #album-close-fab, #playlist-close-fab');
        if (closeBtn) {
            const panel = closeBtn.closest('.panel');
            if (panel) closeOverlay(panel.id);
        }
        
        const actionBtn = e.target.closest('.action-btn');
        if (actionBtn) {
            actionBtn.classList.toggle('active');
            e.stopPropagation();
        }

        const playlistCard = e.target.closest('.playlist-card-ss');
        if (playlistCard) {
            handlePlaylistClickSS(playlistCard.dataset.id);
        }

        const addBtn = e.target.closest('.slide-btn');
        if (addBtn && addBtn.innerHTML.includes('plus')) {
            const trackRow = addBtn.closest('.search-result-track');
            if (trackRow) {
                const trackId = trackRow.dataset.trackId;
                const fullData = trackCache.get(String(trackId));
                if (fullData) {
                    openAddToPlaylistModal(fullData);
                }
            }
            e.stopPropagation();
        }
    });

    if (els.searchResults) {
        els.searchResults.addEventListener('click', (e) => {
            const trackCard = e.target.closest('.search-result-track');
            if (trackCard && !e.target.closest('.track-actions-slide')) {
                handleTrackClick(trackCard, false);
            }
        });
    }

    if (els.artistContent) {
        els.artistContent.addEventListener('click', (e) => {
            const trackRow = e.target.closest('.playable-track');
            if (trackRow && !e.target.closest('.track-actions-slide')) {
                handleTrackClick(trackRow, false);
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
            const addBtn = e.target.closest('.btn-add');
            if (addBtn) {
                const trackRow = addBtn.closest('.search-result-track');
                if (trackRow) {
                    openAddToPlaylistModal(trackCache.get(String(trackRow.dataset.trackId)));
                }
                e.stopPropagation();
                return;
            }
            const trackRow = e.target.closest('.playable-track');
            if (trackRow && !e.target.closest('.track-actions-slide')) {
                handleTrackClick(trackRow, false); 
            }
        });
    }

    if (els.playlistContent) {
        els.playlistContent.addEventListener('click', (e) => {
            const trackRow = e.target.closest('.playable-track');
            if (trackRow) {
                handleTrackClick(trackRow, false);
            }
        });
    }

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

    function renderResults(items) {
        items.forEach(item => trackCache.set(String(item.id), item));
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
                <div class="track-actions-slide">
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
        
        trackList.forEach(t => {
            // Enrich with artist info for cache
            if (!t.artist) t.artist = { id: data.id, name: data.name, slug: data.slug, image: data.image };
            trackCache.set(String(t.id), t);
        });

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
                <div class="track-actions-slide">
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
                // Enrich with album and artist info for cache
                t.album = JSON.parse(JSON.stringify(data));
                delete t.album.tracks; // Avoid circular/heavy structure
                if (!t.artist) t.artist = data.artist;
                trackCache.set(String(t.id), t);

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
                     <div class="track-actions-slide">
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
    }
    function closeOverlay(id) {
        document.getElementById(id).classList.remove('active');
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
