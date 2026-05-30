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
    let currentTrackId = null;
    let currentQueue = [];
    let currentQueueIndex = -1;
    const cutMarkersByTrack = new Map();
    let qualitySetting = { label: 'FLAC', formatId: 27, qualityCode: '9.0' };
    
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

        // Playlist Detail
        playlistPanel: document.getElementById('playlist-panel'),
        playlistContent: document.getElementById('playlist-content-ss'),
        playlistCloseFab: document.getElementById('playlist-close-fab'),

        // Add to Playlist Modal
        addToPlaylistModal: document.getElementById('add-to-playlist-modal'),
        selectPlaylistList: document.getElementById('select-playlist-list'),
        addToPlaylistCancel: document.getElementById('add-to-playlist-cancel'),
        
        // New elements for expansion
        playBottomPart: document.getElementById('now_play_bottom_panel_part'),
        playBottomEdge: document.getElementById('now_play_bottom_panel_edge'),

        // Library Add Buttons (Overlays)
        addArtistToLibBtn: document.getElementById('add-artist-to-lib'),
        addAlbumToLibBtn: document.getElementById('add-album-to-lib'),

        // New Library Containers
        artistsLibContainer: document.getElementById('artists-lib-container'),
        albumsLibContainer: document.getElementById('albums-lib-container'),
        playlistsContainer: document.getElementById('playlists-grid-ss'),
        libNavBtns: document.querySelectorAll('.lib-nav')
    };

    let currentArtistData = null;
    let currentAlbumData = null;

    // --- EXPANSION LOGIC ---
    if (els.playerPanel) {
        els.playerPanel.addEventListener('transitionend', (e) => {
            // Срабатывает только когда панель закончила выезжать (transform)
            if (e.propertyName === 'transform' && els.playerPanel.classList.contains('active')) {
                els.playBottomPart.classList.add('expanded');
                // Небольшая задержка для последовательности, как вы просили
                setTimeout(() => {
                    els.playBottomEdge.classList.add('expanded');
                }, 100);
            }
        });
    }

    let libraryState = {
        playlists: JSON.parse(localStorage.getItem('ss_playlists') || '[]'),
        artists: [],
        albums: [],
        artistIds: new Set(),
        albumIds: new Set(),
        lastUpdated: localStorage.getItem('ss_library_updated'),
        needsArtistsSync: true,
        needsAlbumsSync: true,
        needsPlaylistsSync: true
    };

    async function syncLibraryIds() {
        try {
            const [artRes, albRes] = await Promise.all([
                fetch('/library/artists/ids'),
                fetch('/library/albums/ids')
            ]);
            if (artRes.ok) {
                const ids = await artRes.json();
                libraryState.artistIds = new Set(ids.map(id => Number(id)));
            }
            if (albRes.ok) {
                const ids = await albRes.json();
                libraryState.albumIds = new Set(ids.map(id => String(id)));
            }
        } catch (e) { console.error('ID sync failed', e); }
    }

    async function fetchArtistsSS() {
        if (!els.artistsLibContainer) return;
        if (!libraryState.needsArtistsSync && libraryState.artists.length > 0) return;

        try {
            const res = await fetch('/library/artists');
            if (res.ok) {
                libraryState.artists = await res.json();
                renderArtistsSS(libraryState.artists);
                libraryState.needsArtistsSync = false;
            }
        } catch (e) { console.error('Artists sync failed', e); }
    }

    async function fetchAlbumsSS() {
        if (!els.albumsLibContainer) return;
        if (!libraryState.needsAlbumsSync && libraryState.albums.length > 0) return;

        try {
            const res = await fetch('/library/albums');
            if (res.ok) {
                libraryState.albums = await res.json();
                renderAlbumsSS(libraryState.albums);
                libraryState.needsAlbumsSync = false;
            }
        } catch (e) { console.error('Albums sync failed', e); }
    }

    function renderArtistsSS(artists) {
        if (!els.artistsLibContainer) return;
        if (!artists || artists.length === 0) {
            els.artistsLibContainer.innerHTML = '<div class="empty-state-ss">No artists yet</div>';
            return;
        }
        els.artistsLibContainer.innerHTML = artists.map(art => {
            const imgUrl = getImg(art);
            const initial = escapeHtml((art.name || '?').trim().charAt(0).toUpperCase() || '?');
            return `
                <div class="playlist-card-ss artist-card-lib" data-id="${art.id}">
                    <div class="artist-card-lib__avatar">
                        ${imgUrl ? `<img src="${imgUrl}" alt="${escapeHtml(art.name)}">` : `<span class="artist-card-lib__initial">${initial}</span>`}
                    </div>
                    <div class="artist-card-lib__body">
                        <h4>${escapeHtml(art.name)}</h4>
                        <p>Artist Library</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderAlbumsSS(albums) {
        if (!els.albumsLibContainer) return;
        if (!albums || albums.length === 0) {
            els.albumsLibContainer.innerHTML = '<div class="empty-state-ss">No albums yet</div>';
            return;
        }
        els.albumsLibContainer.innerHTML = albums.map(alb => `
            <div class="playlist-card-ss album-card-lib" data-id="${alb.id}">
                <div class="playlist-cover-ss">
                    ${alb.image?.small ? `<img src="${alb.image.small}">` : '<span class="material-symbols-outlined">album</span>'}
                </div>
                <div class="playlist-info-ss">
                    <h4>${escapeHtml(alb.title)}</h4>
                    <p>${escapeHtml(alb.artist?.name || 'Unknown')}</p>
                </div>
            </div>
        `).join('');
    }

    function setActiveLibraryTab(tabName) {
        const containers = {
            artists: els.artistsLibContainer,
            albums: els.albumsLibContainer,
            playlists: els.playlistsContainer
        };

        Object.values(containers).forEach(c => c && c.classList.remove('active-lib-tab'));
        if (els.libNavBtns) els.libNavBtns.forEach(b => b.classList.remove('active'));

        if (tabName === 'artists' && containers.artists) {
            containers.artists.classList.add('active-lib-tab');
            fetchArtistsSS();
        } else if (tabName === 'albums' && containers.albums) {
            containers.albums.classList.add('active-lib-tab');
            fetchAlbumsSS();
        } else {
            containers.playlists && containers.playlists.classList.add('active-lib-tab');
            fetchPlaylistsSS();
            tabName = 'playlists';
        }

        if (els.libNavBtns) {
            const activeBtn = Array.from(els.libNavBtns).find(btn => btn.dataset.libTab === tabName);
            if (activeBtn) activeBtn.classList.add('active');
        }

        if (els.createPlaylistBtn) {
            els.createPlaylistBtn.style.display = tabName === 'playlists' ? 'flex' : 'none';
        }
    }

    // Tab switching logic for Library
    if (els.libNavBtns) {
        els.libNavBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                setActiveLibraryTab(btn.dataset.libTab || 'playlists');
            });
        });
    }
    // Initial sync
    syncLibraryIds();

    // --- MAPPING HELPERS ---
    
    function mapQobuzImageToDto(qobuzImg) {
        if (!qobuzImg) return null;
        const largeImg = qobuzImg.large || qobuzImg.medium || qobuzImg.small;
        return {
            small: qobuzImg.small,
            medium: qobuzImg.thumbnail || qobuzImg.medium,
            large: largeImg
        };
    }

    function mapToArtistDto(qobuzArtist) {
        if (!qobuzArtist) return null;
        return {
            id: Number(qobuzArtist.id),
            name: qobuzArtist.name,
            slug: qobuzArtist.slug,
            albums_count: qobuzArtist.albums_count,
            image: mapQobuzImageToDto(qobuzArtist.image),
            biography: qobuzArtist.biography ? { content: qobuzArtist.biography.content } : null
        };
    }

    function mapToAlbumDto(qobuzAlbum) {
        if (!qobuzAlbum) return null;
        return {
            id: String(qobuzAlbum.id),
            title: qobuzAlbum.title,
            version: qobuzAlbum.version,
            subtitle: qobuzAlbum.subtitle,
            upc: qobuzAlbum.upc,
            url: qobuzAlbum.url,
            qobuz_id: qobuzAlbum.qobuz_id,
            is_official: qobuzAlbum.is_official,
            tracks_count: qobuzAlbum.tracks_count,
            duration: qobuzAlbum.duration,
            maximum_bit_depth: qobuzAlbum.maximum_bit_depth,
            maximum_sampling_rate: qobuzAlbum.maximum_sampling_rate,
            maximum_technical_specifications: qobuzAlbum.maximum_technical_specifications,
            hires: qobuzAlbum.hires,
            release_date_original: qobuzAlbum.release_date_original ? (typeof qobuzAlbum.release_date_original === 'number' ? new Date(qobuzAlbum.release_date_original * 1000).toISOString().split('T')[0] : qobuzAlbum.release_date_original) : null,
            release_type: qobuzAlbum.release_type,
            popularity: qobuzAlbum.popularity,
            description: qobuzAlbum.description,
            image: mapQobuzImageToDto(qobuzAlbum.image),
            artist: mapToArtistDto(qobuzAlbum.artist),
            tracks: qobuzAlbum.tracks
        };
    }

    function mapToTrackDto(qobuzTrack) {
        if (!qobuzTrack) return null;
        
        // Ensure performers string (Backend uses this field)
        let performers = qobuzTrack.performers;
        if (!performers && qobuzTrack.performer) {
            performers = qobuzTrack.performer.name;
        } else if (!performers && qobuzTrack.artist) {
            performers = qobuzTrack.artist.name;
        }

        // Return object matching TrackDto.java
        return {
            id: Number(qobuzTrack.id),
            title: qobuzTrack.title,
            version: qobuzTrack.version,
            isrc: qobuzTrack.isrc,
            duration: qobuzTrack.duration,
            track_number: qobuzTrack.track_number || qobuzTrack.position,
            performers: performers,
            parental_warning: qobuzTrack.parental_warning,
            hires: qobuzTrack.hires,
            maximum_bit_depth: qobuzTrack.maximum_bit_depth,
            maximum_sampling_rate: qobuzTrack.maximum_sampling_rate,
            maximum_technical_specifications: qobuzTrack.maximum_technical_specifications,
            release_date_original: qobuzTrack.release_date_original ? (typeof qobuzTrack.release_date_original === 'number' ? new Date(qobuzTrack.release_date_original * 1000).toISOString().split('T')[0] : qobuzTrack.release_date_original) : null,
            album: mapToAlbumDto(qobuzTrack.album)
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

    function getTrackNodesFromContext(context) {
        const scope = {
            search: els.searchResults,
            artist: els.artistContent,
            album: els.albumContent,
            playlist: els.playlistContent
        }[context];
        if (!scope) return [];
        return Array.from(scope.querySelectorAll('.search-result-track'));
    }

    function buildQueueFromNode(node) {
        const contextRoot = node.closest('#search-results-container, #artist-content, #album-content, #playlist-content-ss');
        const context = contextRoot?.id === 'artist-content' ? 'artist'
            : contextRoot?.id === 'album-content' ? 'album'
            : contextRoot?.id === 'playlist-content-ss' ? 'playlist'
            : 'search';
        const nodes = getTrackNodesFromContext(context);
        currentQueue = nodes;
        currentQueueIndex = nodes.findIndex(n => n.dataset.trackId === node.dataset.trackId);
    }

    function findCurrentTrackNodeInDom() {
        if (!currentTrackId) return null;
        const selectors = [
            '#playlist-content-ss .search-result-track[data-track-id]',
            '#album-content .search-result-track[data-track-id]',
            '#artist-content .search-result-track[data-track-id]',
            '#search-results-container .search-result-track[data-track-id]'
        ];
        for (const selector of selectors) {
            const nodes = Array.from(document.querySelectorAll(selector));
            const found = nodes.find(n => n.dataset.trackId === String(currentTrackId));
            if (found) return found;
        }
        return null;
    }

    function syncPlayingHighlights() {
        document.querySelectorAll('.search-result-track').forEach(n => {
            const isCurrent = currentTrackId && n.dataset.trackId === String(currentTrackId);
            n.classList.toggle('playing', Boolean(isCurrent));
        });
    }

    async function handleTrackClick(el, isAutoPlay = false) {
        document.querySelectorAll('.search-result-track').forEach(n => n.classList.remove('show-actions'));
        currentTrackId = el.dataset.trackId;
        buildQueueFromNode(el);
        syncPlayingHighlights();
        
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
        renderCutMarkers();

        try {
            const res = await fetch(`/data/audio/play?trackId=${meta.id}&formatId=${qualitySetting.formatId}&qualityCode=${encodeURIComponent(qualitySetting.qualityCode)}`);
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
        if (!currentQueue.length || currentQueueIndex < 0 || !currentQueue[currentQueueIndex]?.isConnected) {
            const currentNode = findCurrentTrackNodeInDom();
            if (currentNode) {
                buildQueueFromNode(currentNode);
            }
        }
        if (!currentQueue.length || currentQueueIndex < 0) return;
        const nextIndex = direction === 'next' ? currentQueueIndex + 1 : currentQueueIndex - 1;
        const nextNode = currentQueue[nextIndex];
        if (!nextNode) return;
        currentQueueIndex = nextIndex;
        handleTrackClick(nextNode, true);
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
        e.target.value = ''; // Clear text after search starts
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

        // Сбрасываем расширение плеера при любом переключении/закрытии
        els.playBottomPart.classList.remove('expanded');
        els.playBottomEdge.classList.remove('expanded');

        if (panelId === 'close-panel') {
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            els.parentContainer.classList.remove('content-scaled');
            dismissSearch();
            return;
        }
        const target = document.getElementById(panelId);
        if (target) {
            const isAlreadyActive = target.classList.contains('active');
            
            // Clear other panels but keep overlays if needed (or just clear all main panels)
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            
            target.classList.add('active');

            
            if (panelId === 'search-panel') {
                const hasResults = els.searchResults.children.length > 0;
                
                if (isAlreadyActive) {
                    // Stage 2: Clicked while search was already active -> show input & focus
                    els.topSearchPanel.classList.add('active');
                    els.searchInput.focus();
                } else {
                    // Stage 1: Switched to search from another tab
                    if (hasResults) {
                        els.topSearchPanel.classList.remove('active');
                    } else {
                        els.topSearchPanel.classList.add('active');
                        els.searchInput.focus();
                    }
                }
            }
            if (panelId === 'library-panel') {
                setActiveLibraryTab('playlists');
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

        if (!libraryState.needsPlaylistsSync && libraryState.playlists.length > 0) return;

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
                libraryState.needsPlaylistsSync = false;
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

                // Swipe Left Logic (replaces long touch)
                let startX = 0;
                let swiping = false;
                let pointerDown = false;
                const applySwipe = (clientX) => {
                    const deltaX = clientX - startX;
                    if (deltaX < -40) {
                        row.classList.add('show-delete');
                    } else if (deltaX > -10) {
                        row.classList.remove('show-delete');
                    }
                };
                row.addEventListener('touchstart', (ev) => {
                    startX = ev.touches[0].clientX;
                    swiping = true;
                }, { passive: true });
                row.addEventListener('touchmove', (ev) => {
                    if (!swiping) return;
                    applySwipe(ev.touches[0].clientX);
                }, { passive: true });
                row.addEventListener('touchend', () => {
                    swiping = false;
                });
                row.addEventListener('pointerdown', (ev) => {
                    pointerDown = true;
                    startX = ev.clientX;
                });
                row.addEventListener('pointermove', (ev) => {
                    if (!pointerDown) return;
                    applySwipe(ev.clientX);
                });
                row.addEventListener('pointerup', () => {
                    pointerDown = false;
                });
                row.addEventListener('pointercancel', () => {
                    pointerDown = false;
                });

                // Delete Logic
                row.querySelector('.ss-delete-track-btn').onclick = async (e) => {
                    e.stopPropagation();
                    try {
                        const res = await fetch(`/library/playlists/${playlist.id}/tracks/${t.id}`, { method: 'DELETE' });
                        if (res.ok) {
                            const rowHeight = row.offsetHeight;
                            row.style.maxHeight = `${rowHeight}px`;
                            row.classList.add('is-removing');
                            requestAnimationFrame(() => {
                                row.style.maxHeight = '0px';
                            });
                            setTimeout(() => row.remove(), 360);
                            
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
        syncPlayingHighlights();
    }

    if (els.addAlbumToLibBtn) {
        els.addAlbumToLibBtn.addEventListener('click', async () => {
            if (!currentAlbumData) return;
            const albumId = String(currentAlbumData.id);
            const isInLib = libraryState.albumIds.has(albumId);

            if (isInLib) {
                // Remove
                try {
                    const res = await fetch(`/library/albums/${albumId}`, { method: 'DELETE' });
                    if (res.ok) {
                        libraryState.albumIds.delete(albumId);
                        libraryState.albums = libraryState.albums.filter(a => String(a.id) !== albumId);
                        renderAlbumsSS(libraryState.albums);
                        libraryState.needsAlbumsSync = true; // Mark as dirty
                        els.addAlbumToLibBtn.innerHTML = '<i data-lucide="plus"></i>';
                        if (window.lucide) lucide.createIcons();
                    }
                } catch (e) { console.error(e); }
            } else {
                // Add
                const payload = mapToAlbumDto(currentAlbumData);
                try {
                    const res = await fetch('/library/albums', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (res.ok) {
                        libraryState.albumIds.add(albumId);
                        libraryState.albums.unshift(payload);
                        renderAlbumsSS(libraryState.albums);
                        libraryState.needsAlbumsSync = true; // Mark as dirty
                        els.addAlbumToLibBtn.innerHTML = '<i data-lucide="check"></i>';
                        if (window.lucide) lucide.createIcons();
                    }
                } catch (e) { console.error(e); }
            }
        });
    }

    if (els.addArtistToLibBtn) {
        els.addArtistToLibBtn.addEventListener('click', async () => {
            if (!currentArtistData) return;
            const artistId = Number(currentArtistData.id);
            const isInLib = libraryState.artistIds.has(artistId);

            if (isInLib) {
                // Remove
                try {
                    const res = await fetch(`/library/artists/${artistId}`, { method: 'DELETE' });
                    if (res.ok) {
                        libraryState.artistIds.delete(artistId);
                        libraryState.artists = libraryState.artists.filter(a => Number(a.id) !== artistId);
                        renderArtistsSS(libraryState.artists);
                        libraryState.needsArtistsSync = true;
                        els.addArtistToLibBtn.innerHTML = '<i data-lucide="plus"></i>';
                        if (window.lucide) lucide.createIcons();
                    }
                } catch (e) { console.error(e); }
            } else {
                // Add
                const payload = mapToArtistDto(currentArtistData);
                try {
                    const res = await fetch('/library/artists', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (res.ok) {
                        libraryState.artistIds.add(artistId);
                        libraryState.artists.unshift(payload);
                        renderArtistsSS(libraryState.artists);
                        libraryState.needsArtistsSync = true;
                        els.addArtistToLibBtn.innerHTML = '<i data-lucide="check"></i>';
                        if (window.lucide) lucide.createIcons();
                    }
                } catch (e) { console.error(e); }
            }
        });
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
            if (!title) return;

            try {
                const res = await fetch('/library/playlists', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title })
                });
                
                if (res.ok) {
                    const newPl = await res.json();
                    libraryState.playlists.unshift(newPl);
                    saveLibraryToLocal();
                    els.createPlaylistModal.classList.add('hidden');
                    els.playlistTitleInput.value = '';
                    renderPlaylistsSS(libraryState.playlists);
                }
            } catch (e) { console.error(e); }
        });
    }

    // --- ADD TRACK TO PLAYLIST LOGIC ---
    let trackToAdd = null;

    function openAddToPlaylistModal(trackData) {
        trackToAdd = trackData;
        if (!trackToAdd) return;
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
            if (playlistCard.classList.contains('artist-card-lib')) {
                openOverlay('artist-panel');
                loadArtist(playlistCard.dataset.id);
            } else if (playlistCard.classList.contains('album-card-lib')) {
                openOverlay('album-panel');
                loadAlbum(playlistCard.dataset.id);
            } else {
                handlePlaylistClickSS(playlistCard.dataset.id);
            }
        }

        const addBtn = e.target.closest('.slide-btn');
        if (addBtn) {
            const trackRow = addBtn.closest('.search-result-track');
            if (!trackRow) return;
            const trackId = trackRow.dataset.trackId;
            const fullData = trackCache.get(String(trackId));
            if (!fullData) return;

            if (addBtn.classList.contains('btn-add-artist-search')) {
                const artistId = Number(trackRow.dataset.artistId);
                const isInLib = libraryState.artistIds.has(artistId);
                if (!isInLib) {
                    // Fetch full artist data to get all images and biography
                    fetch(`/data/audio/artist?artistId=${artistId}`)
                        .then(res => res.json())
                        .then(fullArtistData => {
                            const payload = mapToArtistDto(fullArtistData);
                            return fetch('/library/artists', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                        })
                        .then(res => {
                            if (res.ok) {
                                libraryState.artistIds.add(artistId);
                                libraryState.needsArtistsSync = true;
                                renderResults(Array.from(trackCache.values()).filter(t => els.searchResults.querySelector(`[data-track-id="${t.id}"]`)));
                            }
                        })
                        .catch(err => console.error('Failed to add artist from search', err));
                }
            } else if (addBtn.classList.contains('btn-add-album-search')) {
                const albumId = String(trackRow.dataset.albumId);
                const isInLib = libraryState.albumIds.has(albumId);
                if (!isInLib) {
                    // Fetch full album data to get correct image URLs and metadata
                    fetch(`/data/audio/album?albumId=${albumId}`)
                        .then(res => res.json())
                        .then(fullAlbumData => {
                            const payload = mapToAlbumDto(fullAlbumData);
                            return fetch('/library/albums', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                        })
                        .then(res => {
                            if (res.ok) {
                                libraryState.albumIds.add(albumId);
                                libraryState.needsAlbumsSync = true;
                                renderResults(Array.from(trackCache.values()).filter(t => els.searchResults.querySelector(`[data-track-id="${t.id}"]`)));
                            }
                        })
                        .catch(err => console.error('Failed to add album from search', err));
                }
            } else if (addBtn.innerHTML.includes('plus')) {
                openAddToPlaylistModal(fullData);
            }
            e.stopPropagation();
        }
    });

    const closeSwipeActionsInScope = (scopeEl, exceptRow = null) => {
        if (!scopeEl) return;
        scopeEl.querySelectorAll('.search-result-track.show-actions').forEach((row) => {
            if (!exceptRow || row !== exceptRow) row.classList.remove('show-actions');
        });
    };

    const closeAllSwipeActions = (exceptRow = null) => {
        closeSwipeActionsInScope(els.searchResults, exceptRow);
        closeSwipeActionsInScope(els.artistContent, exceptRow);
        closeSwipeActionsInScope(els.albumContent, exceptRow);
    };

    const initSwipeForTrackList = (container) => {
        if (!container) return;
        let swipeRow = null;
        let swipeStartX = 0;
        let swipeStartY = 0;
        let swipeLocked = false;

        container.addEventListener('touchstart', (e) => {
            const row = e.target.closest('.search-result-track');
            if (!row || e.target.closest('.track-actions-slide') || !e.touches?.[0]) return;
            swipeRow = row;
            swipeStartX = e.touches[0].clientX;
            swipeStartY = e.touches[0].clientY;
            swipeLocked = false;
        }, { passive: true });

        container.addEventListener('touchmove', (e) => {
            if (!swipeRow || !e.touches?.[0] || swipeLocked) return;
            const dx = e.touches[0].clientX - swipeStartX;
            const dy = e.touches[0].clientY - swipeStartY;
            if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
                swipeLocked = true;
                return;
            }
            if (dx < -35) {
                closeAllSwipeActions(swipeRow);
                swipeRow.classList.add('show-actions');
            } else if (dx > 25) {
                swipeRow.classList.remove('show-actions');
            }
        }, { passive: true });

        const resetSwipe = () => {
            swipeRow = null;
            swipeStartX = 0;
            swipeStartY = 0;
            swipeLocked = false;
        };
        container.addEventListener('touchend', resetSwipe, { passive: true });
        container.addEventListener('touchcancel', resetSwipe, { passive: true });
    };

    document.addEventListener('touchstart', (e) => {
        const hasOpen = document.querySelector('#search-results-container .search-result-track.show-actions, #artist-content .search-result-track.show-actions, #album-content .search-result-track.show-actions');
        if (!hasOpen) return;
        if (e.target.closest('.track-actions-slide')) return;
        closeAllSwipeActions();
    }, { capture: true, passive: true });

    document.addEventListener('pointerdown', (e) => {
        const hasOpen = document.querySelector('#search-results-container .search-result-track.show-actions, #artist-content .search-result-track.show-actions, #album-content .search-result-track.show-actions');
        if (!hasOpen) return;
        if (e.target.closest('.track-actions-slide')) return;
        closeAllSwipeActions();
    }, { capture: true });

    if (els.searchResults) {
        initSwipeForTrackList(els.searchResults);
        els.searchResults.addEventListener('click', (e) => {
            const trackCard = e.target.closest('.search-result-track');
            if (trackCard && !e.target.closest('.track-actions-slide')) {
                handleTrackClick(trackCard, false);
            }
        });
    }
    initSwipeForTrackList(els.artistContent);
    initSwipeForTrackList(els.albumContent);

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
        let suppressNextTimebarClick = false;
        const addCutMarkerAtClientX = (clientX) => {
            if (!player.duration || !currentTrackId) return;
            const rect = els.timeBarContainer.getBoundingClientRect();
            if (!rect.width) return;
            const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
            const markerSec = (clickX / rect.width) * player.duration;
            const key = String(currentTrackId);
            const markers = (cutMarkersByTrack.get(key) || []).slice().sort((a, b) => a - b);
            const hasNearMarker = markers.some(m => Math.abs(m - markerSec) < 0.35);
            if (hasNearMarker) return;
            if (markers.length >= 3) markers.shift();
            markers.push(markerSec);
            cutMarkersByTrack.set(key, markers.sort((a, b) => a - b));
            renderCutMarkers();
        };

        els.timeBarContainer.addEventListener('click', (e) => {
            if (suppressNextTimebarClick) {
                suppressNextTimebarClick = false;
                e.preventDefault();
                return;
            }
            const width = els.timeBarContainer.offsetWidth;
            const clickX = e.offsetX;
            if (player.duration) player.currentTime = (clickX / width) * player.duration;
        });
        els.timeBarContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            addCutMarkerAtClientX(e.clientX);
        });

        let timebarPressTimer = null;
        els.timeBarContainer.addEventListener('touchstart', (e) => {
            if (!e.touches || !e.touches[0]) return;
            const touchX = e.touches[0].clientX;
            timebarPressTimer = setTimeout(() => {
                addCutMarkerAtClientX(touchX);
                suppressNextTimebarClick = true;
                timebarPressTimer = null;
            }, 550);
        }, { passive: true });
        const cancelTimebarLongPress = () => {
            if (timebarPressTimer) {
                clearTimeout(timebarPressTimer);
                timebarPressTimer = null;
            }
        };
        els.timeBarContainer.addEventListener('touchmove', cancelTimebarLongPress, { passive: true });
        els.timeBarContainer.addEventListener('touchend', cancelTimebarLongPress);
        els.timeBarContainer.addEventListener('touchcancel', cancelTimebarLongPress);
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
        els.searchResults.innerHTML = items.map(item => {
            const artistId = item.performer?.id || item.artist?.id;
            const albumId = item.album?.id;
            const isArtistInLib = libraryState.artistIds.has(Number(artistId));
            const isAlbumInLib = libraryState.albumIds.has(String(albumId));

            return `
                <div class="search-result-track"
                     data-track-id="${item.id}"
                     data-artist-id="${artistId}"
                     data-album-id="${albumId}"
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
                        <button class="slide-btn btn-add-artist-search ${isArtistInLib ? 'active' : ''}" title="Add Artist">
                            <i data-lucide="${isArtistInLib ? 'check' : 'user-plus'}"></i>
                        </button>
                        <button class="slide-btn btn-add-album-search ${isAlbumInLib ? 'active' : ''}" title="Add Album">
                            <i data-lucide="${isAlbumInLib ? 'check' : 'plus'}"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        syncPlayingHighlights();
        if(window.lucide) lucide.createIcons();
    }

    async function loadArtist(id) {
        if (els.artistContent.dataset.loadedId === id) return;
        els.artistContent.dataset.loadedId = id;
        els.artistContent.innerHTML = '<div style="padding:40px; text-align:center">Loading Frequency...</div>';
        
        // Reset button icon based on library state
        if (els.addArtistToLibBtn) {
            const isInLib = libraryState.artistIds.has(Number(id));
            els.addArtistToLibBtn.innerHTML = isInLib ? '<i data-lucide="check"></i>' : '<i data-lucide="plus"></i>';
            if (window.lucide) lucide.createIcons();
        }

        try {
            const res = await fetch(`/data/audio/artist?artistId=${id}`);
            const data = await res.json();
            currentArtistData = data;
            renderArtistPanel(data);
        } catch (e) { console.error(e); }
    }

    async function loadAlbum(id) {
        if (els.albumContent.dataset.loadedId === id) return;
        els.albumContent.dataset.loadedId = id;
        els.albumContent.innerHTML = '<div style="padding:40px; text-align:center">Loading Geometry...</div>';
        
        // Reset button icon based on library state
        if (els.addAlbumToLibBtn) {
            const isInLib = libraryState.albumIds.has(String(id));
            els.addAlbumToLibBtn.innerHTML = isInLib ? '<i data-lucide="check"></i>' : '<i data-lucide="plus"></i>';
            if (window.lucide) lucide.createIcons();
        }

        try {
            const res = await fetch(`/data/audio/album?albumId=${id}`);
            const data = await res.json();
            currentAlbumData = data;
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
            row.className = 'group flex items-center justify-between py-4 px-6 border-b border-white/5 active:bg-white/10 transition-colors cursor-pointer playable-track search-result-track AlbumElementsSS';
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
        syncPlayingHighlights();
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
                row.className = 'search-result-track playable-track track-row-3d AlbumElementsSS';
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
        syncPlayingHighlights();
        if(window.lucide) lucide.createIcons();
    }

    function openOverlay(id) {
        const panel = document.getElementById(id);
        if (!panel) return;
        panel.classList.add('active');
        // Добавляем состояние в историю
        history.pushState({ panelId: id }, "", "");
    }

    function closeOverlay(id, isPopState = false) {
        const panel = document.getElementById(id);
        if (!panel) return;
        panel.classList.remove('active');
        // Если закрыли вручную (не через кнопку назад), убираем из истории
        if (!isPopState) {
            // Если в истории был этот же панель, можно сделать history.back(), 
            // но для простоты просто закрываем.
        }
    }

    // Обработка кнопки "Назад"
    window.addEventListener('popstate', (event) => {
        const activeOverlays = document.querySelectorAll('.panel.overlay-panel.active');
        if (activeOverlays.length > 0) {
            // Закрываем самый верхний оверлей
            const topOverlay = activeOverlays[activeOverlays.length - 1];
            closeOverlay(topOverlay.id, true);
        } else {
            // Если оверлеев нет, возможно закрыть главную панель
            const activeMainPanels = document.querySelectorAll('.panel.active:not(.overlay-panel)');
            if (activeMainPanels.length > 0) {
                activeMainPanels.forEach(p => p.classList.remove('active'));
                els.parentContainer.classList.remove('content-scaled');
            }
        }
    });
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

    function renderCutMarkers() {
        if (!els.timeBarContainer) return;
        els.timeBarContainer.querySelectorAll('.cut-marker').forEach(m => m.remove());
        if (!player.duration || !currentTrackId) return;
        const markers = cutMarkersByTrack.get(String(currentTrackId)) || [];
        markers.forEach(sec => {
            const marker = document.createElement('div');
            marker.className = 'cut-marker';
            marker.style.left = `${(sec / player.duration) * 100}%`;
            els.timeBarContainer.appendChild(marker);
        });
    }

    function maybeSkipCutRange() {
        if (!currentTrackId || !player.duration) return;
        const markers = cutMarkersByTrack.get(String(currentTrackId));
        if (!markers || markers.length < 2) return;
        const sorted = markers.slice().sort((a, b) => a - b);
        const start = sorted[0];
        const end = sorted[sorted.length - 1];
        if (player.currentTime >= start && player.currentTime < end) {
            player.currentTime = end;
        }
    }

    function loop() {
        if (!player.paused && player.duration) {
            const pct = (player.currentTime / player.duration) * 100;
            els.timeBarProgress.style.width = `${pct}%`;
            els.timeCurrent.textContent = formatTime(player.currentTime);
            maybeSkipCutRange();
        }
        requestAnimationFrame(loop);
    }
    loop();

    player.addEventListener('loadedmetadata', () => {
        playerState.duration = player.duration;
        els.timeDuration.textContent = formatTime(player.duration);
        renderCutMarkers();
    });
    player.addEventListener('ended', () => playAdjacent('next'));

    if (els.playerControls) {
        const qualityWrap = document.createElement('div');
        qualityWrap.id = 'quality-selector-wrap';
        qualityWrap.innerHTML = `
            <select id="quality-selector" title="Quality">
                <option value="27|9.0">FLAC</option>
                <option value="6|4.3">MP3</option>
                <option value="5|3.1">AAC</option>
            </select>
            <button id="cut-reset-btn" title="Reset cut markers">CUT RESET</button>
        `;
        els.playerControls.appendChild(qualityWrap);
        const qualitySelect = qualityWrap.querySelector('#quality-selector');
        const cutResetBtn = qualityWrap.querySelector('#cut-reset-btn');
        qualitySelect.addEventListener('change', (e) => {
            const [formatId, qualityCode] = e.target.value.split('|');
            qualitySetting = {
                label: e.target.options[e.target.selectedIndex].text,
                formatId: Number(formatId),
                qualityCode
            };
        });
        cutResetBtn.addEventListener('click', () => {
            if (!currentTrackId) return;
            cutMarkersByTrack.delete(String(currentTrackId));
            renderCutMarkers();
        });
    }
    if(window.lucide) window.lucide.createIcons();
});
