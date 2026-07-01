// --- FETCH INTERCEPTOR FOR AUTO-REFRESH ---
const originalFetch = window.fetch;
let isRefreshing = false;
let refreshPromise = null;

window.fetch = async (url, options) => {
    let response = await originalFetch(url, options);

    if (response.status === 401) {
        if (!isRefreshing) {
            isRefreshing = true;
            refreshPromise = originalFetch('/auth/refresh').then(res => {
                isRefreshing = false;
                if (!res.ok) throw new Error('Refresh failed');
                return res;
            }).catch(err => {
                isRefreshing = false;
                window.location.href = '/login.html';
                throw err;
            });
        }
        
        try {
            await refreshPromise;
            response = await originalFetch(url, options);
        } catch (err) {
            // window.location.href already handled in promise catch
        }
    }
    return response;
};

class LRUCache {
    constructor(limit = 200) {
        this.cache = new Map();
        this.limit = limit;
    }
    get(key) {
        if (!this.cache.has(key)) return undefined;
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }
    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.limit) {
            this.cache.delete(this.cache.keys().next().value);
        }
        this.cache.set(key, value);
    }
    has(key) { return this.cache.has(key); }
    values() { return this.cache.values(); }
    delete(key) { return this.cache.delete(key); }
    clear() { this.cache.clear(); }
}

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
    const trackCache = new LRUCache(200);
    let currentTrackId = null;
    let loadedTrackId = null;
    let currentQueue = [];
    let currentQueueIndex = -1;
    let isManualSwitch = false;
    let lastRemovedCurrentTrackIndex = null;

    // Глобальные переменные для оптимизации и предотвращения Race Conditions
    let currentAudioFetchController = null;
    let cachedQueueContext = null;
    let cachedQueueId = null;

    const cutMarkersByTrack = new Map();
    try {
        const localCuts = JSON.parse(localStorage.getItem('ss_cut_markers') || '{}');
        for (const [tid, markers] of Object.entries(localCuts)) {
            cutMarkersByTrack.set(String(tid), markers);
        }
    } catch (e) {
        console.error('Failed to load cut markers from localStorage', e);
    }
    let qualitySetting = { label: 'FLAC/7', formatId: 7 };
    let libraryLabelTimeout = null;
    
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
        timeBarWaveform: document.getElementById('timebar-waveform'),
        waveformClipRect: document.getElementById('waveform-clip-rect'),
        waveformBackground: document.getElementById('waveform-background'),
        waveformForeground: document.getElementById('waveform-foreground'),
        waveformPlayheads: document.querySelectorAll('.waveform-playhead'),
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
        trackQualityInfo: document.getElementById('track-quality-info'),
        trackDownloadBtn: document.getElementById('track-download-btn'),
        
        artistContent: document.getElementById('artist-content'),
        albumContent: document.getElementById('album-content'),
        
        bottomNavbar: document.querySelector('.bottom-navbar'),

        // Profile Elements
        importYoutubeBtn: document.getElementById('import-youtube-btn'),
        youtubeImportStatus: document.getElementById('youtube-import-status'),

        // Library Elements
        libraryPanel: document.getElementById('library-panel'),
        playlistsContainer: document.getElementById('playlists-grid-ss'),
        createPlaylistBtn: document.getElementById('create_playlist_btn'),
        createPlaylistModal: document.getElementById('create-playlist-modal'),
        createPlaylistConfirm: document.getElementById('create-playlist-confirm'),
        createPlaylistCancel: document.getElementById('create-playlist-cancel'),
        playlistTitleInput: document.getElementById('playlist_title'),
        currentLibraryLabel: document.getElementById('current_library-label'),

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

        // Library Add Buttons (Overlays)
        addArtistToLibBtn: document.getElementById('add-artist-to-lib'),
        addAlbumToLibBtn: document.getElementById('add-album-to-lib'),

        // New Library Containers
        tracksLibContainer: document.getElementById('tracks-lib-container'),
        artistsLibContainer: document.getElementById('artists-lib-container'),
        albumsLibContainer: document.getElementById('albums-lib-container'),
        playlistsContainer: document.getElementById('playlists-grid-ss'),
        libNavBtns: document.querySelectorAll('.lib-nav')
    };

    let currentArtistData = null;
    let currentAlbumData = null;



    let libraryState = {
        playlists: JSON.parse(localStorage.getItem('ss_playlists') || '[]'),
        artists: [],
        albums: [],
        likedTracks: JSON.parse(localStorage.getItem('ss_liked_tracks') || '[]'),
        artistIds: new Set(),
        albumIds: new Set(),
        likedTrackIds: new Set(JSON.parse(localStorage.getItem('ss_liked_tracks') || '[]').map(t => String(t.id))),
        lastUpdated: localStorage.getItem('ss_library_updated'),
        needsArtistsSync: true,
        needsAlbumsSync: true,
        needsPlaylistsSync: true,
        needsTracksSync: true,
        lastTab: localStorage.getItem('ss_last_library_tab') || 'playlists'
    };

    async function syncLibraryIds() {
        try {
            const [artRes, albRes, trkRes] = await Promise.all([
                fetch('/library/artists/ids'),
                fetch('/library/albums/ids'),
                fetch('/library/tracks/ids')
            ]);
            if (artRes.ok) {
                const ids = await artRes.json();
                libraryState.artistIds = new Set(ids.map(id => Number(id)));
            }
            if (albRes.ok) {
                const ids = await albRes.json();
                libraryState.albumIds = new Set(ids.map(id => String(id)));
            }
            if (trkRes.ok) {
                const ids = await trkRes.json();
                libraryState.likedTrackIds = new Set(ids.map(id => String(id)));
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
        els.albumsLibContainer.innerHTML = albums.map(alb => {
            const imgUrl = alb.image?.large || alb.image?.small || '';
            return `
                <div class="playlist-card-ss album-card-lib" data-id="${alb.id}">
                    <div class="album-cover-container">
                        ${imgUrl ? `<div class="vinyl-disk" style="background-image: url('${imgUrl}')"></div>` : '<div class="vinyl-disk fallback-vinyl"><span class="material-symbols-outlined">album</span></div>'}
                    </div>
                    <div class="playlist-info-ss">
                        <h4>${escapeHtml(alb.title)}</h4>
                        <p>${escapeHtml(alb.artist?.name || 'Unknown')}</p>
                        ${alb.tracks_count ? `<p class="album-tracks-count">${alb.tracks_count} ${alb.tracks_count === 1 ? 'track' : 'tracks'}</p>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    async function fetchLikedTracksSS() {
        if (!els.tracksLibContainer) return;
        if (!libraryState.needsTracksSync && libraryState.likedTracks.length > 0) return;

        try {
            const res = await fetch('/library/tracks');
            if (res.ok) {
                const tracks = await res.json();
                libraryState.likedTracks = tracks.reverse().map(t => {
                    trackCache.set(String(t.id), t);
                    return t;
                });
                renderLikedTracksSS();
                libraryState.needsTracksSync = false;
            }
        } catch (e) { console.error('Tracks sync failed', e); }
    }

    function renderLikedTracksSS() {
        if (!els.tracksLibContainer) return;
        const tracks = libraryState.likedTracks;
        if (!tracks || tracks.length === 0) {
            els.tracksLibContainer.innerHTML = '<div class="empty-state-ss">No liked tracks yet</div>';
            return;
        }
        
        els.tracksLibContainer.innerHTML = tracks.map(item => {
            const artistId = item.performer?.id || item.artist?.id || item.album?.artist?.id;
            const albumId = item.album?.id;
            const isTrackLiked = true;
            const artistName = item.performer?.name || item.artist?.name || item.album?.artist?.name || (item.performers ? item.performers.split(',')[0].split(' - ')[0].trim() : 'Unknown');
            const coverUrl = item.album?.image?.large || item.image?.large || '';
            const smallCoverUrl = item.album?.image?.small || item.image?.small || coverUrl;

            return `
                <div class="ss-acid-row search-result-track playable-track"
                     data-track-id="${item.id}"
                     data-artist-id="${artistId}"
                     data-album-id="${albumId}"
                     data-title="${escapeHtml(item.title)}"
                     data-artist="${escapeHtml(artistName)}"
                     data-album="${escapeHtml(item.album?.title)}"
                     data-cover="${coverUrl}">
                    <img src="${smallCoverUrl}" class="search-result-track-cover" loading="lazy">
                    <div class="track-info">
                        <p class="track-title">${escapeHtml(item.title)}</p>
                        <p class="track-artist">${escapeHtml(artistName)}<span class="track-title-sep"> | </span><span class="track-title-duration">${formatTime(item.duration)}</span></p>
                    </div>
                    <div class="track-actions-slide">
                        <button class="slide-btn btn-like-track ${isTrackLiked ? 'active' : ''}" style="${isTrackLiked ? 'color: coral;' : ''}" title="Like Track">
                            <i data-lucide="heart" style="${isTrackLiked ? 'fill: coral;' : ''}"></i>
                        </button>
                        <button class="slide-btn btn-add-to-playlist" title="Add to Playlist">
                            <i data-lucide="plus"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        initSwipeForTrackList(els.tracksLibContainer);
        syncPlayingHighlights();
        if (window.lucide) lucide.createIcons();
    }

    function setActiveLibraryTab(tabName) {
        const containers = {
            tracks: els.tracksLibContainer,
            artists: els.artistsLibContainer,
            albums: els.albumsLibContainer,
            playlists: els.playlistsContainer
        };

        const currentActiveTab = Object.keys(containers).find(key => containers[key] && containers[key].classList.contains('active-lib-tab'));

        if (currentActiveTab !== tabName) {
            Object.values(containers).forEach(c => c && c.classList.remove('active-lib-tab'));
            
            if (tabName === 'tracks' && containers.tracks) {
                containers.tracks.classList.add('active-lib-tab');
                fetchLikedTracksSS();
            } else if (tabName === 'artists' && containers.artists) {
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
        } else {
            // Если вкладка уже активна, просто вызываем фетч, не переключая класс active-lib-tab (предотвращает мерцание/сброс CSS transition)
            if (tabName === 'tracks') {
                fetchLikedTracksSS();
            } else if (tabName === 'artists') {
                fetchArtistsSS();
            } else if (tabName === 'albums') {
                fetchAlbumsSS();
            } else {
                fetchPlaylistsSS();
                tabName = 'playlists';
            }
        }

        if (els.libNavBtns) {
            els.libNavBtns.forEach(b => b.classList.remove('active'));
            const activeBtn = Array.from(els.libNavBtns).find(btn => btn.dataset.libTab === tabName);
            if (activeBtn) activeBtn.classList.add('active');
        }

        if (els.createPlaylistBtn) {
            els.createPlaylistBtn.style.display = tabName === 'playlists' ? 'flex' : 'none';
        }

        if (els.currentLibraryLabel) {
            const currentText = els.currentLibraryLabel.textContent.trim();
            if (!currentText) {
                els.currentLibraryLabel.textContent = tabName;
            } else if (currentText.toLowerCase() !== tabName.toLowerCase()) {
                if (libraryLabelTimeout) {
                    clearTimeout(libraryLabelTimeout);
                }
                
                // Сбрасываем сдвиг, если он остался инлайново, и запускаем затухание
                els.currentLibraryLabel.style.transform = '';
                els.currentLibraryLabel.style.opacity = '0';
                
                libraryLabelTimeout = setTimeout(() => {
                    els.currentLibraryLabel.textContent = tabName;
                    els.currentLibraryLabel.style.opacity = '1';
                    libraryLabelTimeout = null;
                }, 350);
            }
        }
        libraryState.lastTab = tabName;
        localStorage.setItem('ss_last_library_tab', tabName);
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
        let img = mapQobuzImageToDto(qobuzArtist.image);
        if (!img && qobuzArtist.picture) {
            img = {
                small: qobuzArtist.picture,
                medium: qobuzArtist.picture,
                large: qobuzArtist.picture
            };
        }
        if (!img && qobuzArtist.albums && qobuzArtist.albums.items && qobuzArtist.albums.items.length > 0) {
            const firstAlbum = qobuzArtist.albums.items[0];
            const albumImg = firstAlbum.image || (firstAlbum.picture ? { large: firstAlbum.picture, medium: firstAlbum.picture, small: firstAlbum.picture } : null);
            img = mapQobuzImageToDto(albumImg);
        }
        const genreName = qobuzArtist.genre?.name || (qobuzArtist.albums?.items?.[0]?.genre?.name) || 'Music';
        return {
            id: Number(qobuzArtist.id),
            name: qobuzArtist.name,
            slug: qobuzArtist.slug,
            albums_count: qobuzArtist.albums_count,
            image: img,
            genre: genreName,
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
        
        const fadeElements = [els.trackTitle, els.trackArtist, els.trackAlbum].filter(Boolean);
        fadeElements.forEach(el => el.style.opacity = '0');
        
        setTimeout(() => {
            if (els.trackTitle) els.trackTitle.textContent = track.title;
            if (els.trackArtist) els.trackArtist.textContent = track.artist;
            if (els.trackAlbum) els.trackAlbum.textContent = track.album;
            fadeElements.forEach(el => el.style.opacity = '1');
        }, 250);

        if (track.cover) {
            if (els.trackCover) els.trackCover.src = track.cover;
            if (els.bgImage) els.bgImage.src = track.cover;
        }

        const isLikedNow = libraryState.likedTrackIds.has(String(track.id));
        const playerBtnLike = document.getElementById('btn-like');
        if (playerBtnLike) {
            const icon = playerBtnLike.querySelector('i');
            if (isLikedNow) {
                playerBtnLike.classList.add('active');
                if (icon) icon.style.color = ''; // сброс инлайн-стиля, цвет берется из CSS
            } else {
                playerBtnLike.classList.remove('active');
                if (icon) icon.style.color = ''; // сброс инлайн-стиля
            }
        }

        if (els.playerPanel && !els.playerPanel.classList.contains('active') && !document.querySelector('.overlay-panel.active')) {
            const openBtn = document.querySelector('[data-panel="player-panel"]');
            if (openBtn) openBtn.click(); 
        }

        if (isFrequencyMode) {
            generateAndRenderWaveform();
            updateWaveformProgress();
        }
    }

    function saveCutsToLocalStorage() {
        const obj = {};
        for (const [tid, markers] of cutMarkersByTrack.entries()) {
            obj[tid] = markers;
        }
        localStorage.setItem('ss_cut_markers', JSON.stringify(obj));
    }

    async function loadCutsForTrack(trackId) {
        if (!trackId) return;
        try {
            const res = await fetch(`/library/cuts?trackId=${encodeURIComponent(trackId)}`);
            if (res.ok) {
                const cuts = await res.json();
                if (cuts && cuts.length > 0) {
                    const cut = cuts[0];
                    const marker = Number(cut.endTime);
                    cutMarkersByTrack.set(String(trackId), [marker]);
                } else {
                    cutMarkersByTrack.delete(String(trackId));
                }
                saveCutsToLocalStorage();
                if (String(currentTrackId) === String(trackId)) {
                    renderCutMarkers();
                    const markers = cutMarkersByTrack.get(String(trackId));
                    if (markers && markers.length >= 1 && player.currentTime < markers[0]) {
                        player.currentTime = markers[0];
                    }
                }
            }
        } catch (e) {
            console.error('Failed to load cuts from backend', e);
        }
    }

    async function saveCutsToBackend(trackId) {
        if (!trackId) return;
        const markers = cutMarkersByTrack.get(String(trackId)) || [];
        saveCutsToLocalStorage();
        
        let bodyPayload = [];
        if (markers.length >= 1) {
            bodyPayload = [{
                startTime: 0,
                endTime: markers[0]
            }];
        }
        
        try {
            await fetch(`/library/cuts?trackId=${encodeURIComponent(trackId)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bodyPayload)
            });
        } catch (e) {
            console.error('Failed to save cuts to backend', e);
        }
    }

    function updatePlayPauseUI(isPlaying) {
        if (!els.playBtnContainer) return;
        let icon = els.playBtnContainer.querySelector('i');
        if (!icon) {
            icon = document.createElement('i');
            icon.className = isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
            els.playBtnContainer.appendChild(icon);
        } else {
            // Плавное исчезновение и проявление за 0.3s (0.15s угасание + 0.15s появление)
            icon.style.transition = 'opacity 0.15s linear';
            icon.style.opacity = '0';
            
            setTimeout(() => {
                icon.className = isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
                icon.style.opacity = '1';
            }, 150);
        }
        if (els.playingBars) isPlaying ? els.playingBars.classList.add('active') : els.playingBars.classList.remove('active');
    }

    function getTrackNodesFromContext(context) {
        const scope = {
            search: els.searchResults,
            artist: els.artistContent,
            album: els.albumContent,
            playlist: els.playlistContent,
            tracks: els.tracksLibContainer
        }[context];
        if (!scope) return [];
        return Array.from(scope.querySelectorAll('.search-result-track'));
    }

    function removeTrackFromQueue(trackId) {
        const idStr = String(trackId);
        const removedIdx = currentQueue.findIndex(t => String(t.trackId) === idStr);
        if (removedIdx !== -1) {
            currentQueue = currentQueue.filter(t => String(t.trackId) !== idStr);
            if (currentTrackId && String(currentTrackId) === idStr) {
                lastRemovedCurrentTrackIndex = removedIdx;
            } else {
                const currentTrackIdStr = currentTrackId ? String(currentTrackId) : null;
                currentQueueIndex = currentQueue.findIndex(t => String(t.trackId) === currentTrackIdStr);
            }
            console.log(`[SoundSpace Queue] Removed track ${idStr} from active queue. New size: ${currentQueue.length}`);
        }
    }

    function buildQueueFromNode(node) {
        if (!node) return;
        
        const contextRoot = node.closest('#search-results-container, #artist-content, #album-content, #playlist-content-ss, #tracks-lib-container');
        if (!contextRoot) return;

        const contextType = contextRoot.id === 'artist-content' ? 'artist'
            : contextRoot.id === 'album-content' ? 'album'
            : contextRoot.id === 'playlist-content-ss' ? 'playlist'
            : contextRoot.id === 'tracks-lib-container' ? 'tracks'
            : 'search';
        
        // Уникальный ID для контекста (например, data-loaded-id для альбомов/плейлистов)
        const contextId = contextRoot.dataset.loadedId || contextRoot.id;

        // Если контекст тот же самый, не пересобираем очередь из DOM
        if (cachedQueueContext === contextType && cachedQueueId === contextId && currentQueue.length > 0) {
            currentQueueIndex = currentQueue.findIndex(t => String(t.trackId) === String(node.dataset.trackId));
            return;
        }

        // Иначе - собираем заново и кэшируем
        const nodes = getTrackNodesFromContext(contextType);
        currentQueue = nodes.map(n => ({
            trackId: String(n.dataset.trackId),
            title: n.dataset.title,
            artist: n.dataset.artist,
            album: n.dataset.album,
            cover: n.dataset.cover,
            artistId: n.dataset.artistId,
            albumId: n.dataset.albumId
        }));
        currentQueueIndex = currentQueue.findIndex(t => String(t.trackId) === String(node.dataset.trackId));
        
        cachedQueueContext = contextType;
        cachedQueueId = contextId;
        
        console.log(`[SoundSpace] Queue rebuilt for context: ${contextType}:${contextId}, size: ${currentQueue.length}`);
    }

    function findCurrentTrackNodeInDom() {
        if (!currentTrackId) return null;
        const selectors = [
            '#playlist-content-ss .search-result-track[data-track-id]',
            '#album-content .search-result-track[data-track-id]',
            '#artist-content .search-result-track[data-track-id]',
            '#tracks-lib-container .search-result-track[data-track-id]',
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

    async function handleTrackClick(el, isAutoPlay = false, skipShowActions = false) {
        if (!el) return;
        document.querySelectorAll('.search-result-track').forEach(n => n.classList.remove('show-actions'));
        
        const isDomNode = !!(el && el.dataset);
        const trackId = isDomNode ? el.dataset.trackId : el.trackId;
        currentTrackId = trackId;
        
        // Пересобираем очередь только при ручном клике. 
        // При Next/Prev индекс уже обновлен в playAdjacent.
        if (!isAutoPlay && isDomNode) {
            buildQueueFromNode(el);
        }
        
        syncPlayingHighlights();
        loadCutsForTrack(currentTrackId);
        
        if (!isAutoPlay) {
            isManualSwitch = true;
        }
        
        if (isAutoPlay === false && !skipShowActions && isDomNode) {
            requestAnimationFrame(() => {
                el.classList.add('show-actions');
            });
        }

        const meta = {
            id: trackId,
            title: isDomNode ? el.dataset.title : el.title,
            artist: isDomNode ? el.dataset.artist : el.artist,
            album: isDomNode ? el.dataset.album : el.album,
            cover: isDomNode ? el.dataset.cover : el.cover,
            artistId: isDomNode ? el.dataset.artistId : el.artistId,
            albumId: isDomNode ? el.dataset.albumId : el.albumId
        };

        playerState.currentTrack = meta;
        playerState.isPlaying = true;
        
        // Обновление инфо о качестве
        updateQualityInfoUI(meta.id);

        // Мгновенный сброс UI (без анимации обратного отката)
        isIntroAnimating = false;
        if (els.timeBarProgress) {
            const originalTransition = els.timeBarProgress.style.transition;
            els.timeBarProgress.style.transition = 'none';
            els.timeBarProgress.style.width = '0%';
            els.timeBarProgress.offsetHeight; // Force reflow
            els.timeBarProgress.style.transition = originalTransition;
        }
        if (els.timeCurrent) els.timeCurrent.textContent = '0:00';
        if (els.timeBarContainer) {
            els.timeBarContainer.querySelectorAll('.cut-marker-node').forEach(m => m.remove());
        }

        if (currentAudioFetchController) {
            currentAudioFetchController.abort();
        }
        currentAudioFetchController = new AbortController();

        try {
            // Удален неиспользуемый qualityCode
            const res = await fetch(`/data/audio/play?trackId=${meta.id}&formatId=${qualitySetting.formatId}`, {
                signal: currentAudioFetchController.signal
            });
            
            const data = await res.json();
            
            if (data.url) {
                player.pause();
                player.src = "";
                player.load(); 

                player.src = data.url;
                
                isManualSwitch = false;
                
                player.volume = 1.0;
                const playPromise = player.play();
                
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
                            console.error('Playback error:', error);
                        }
                    });
                }
            }
        } catch (e) {
            if (e.name === 'AbortError') return;
            console.error(e);
            playerState.isPlaying = false;
        } finally {
            if (currentAudioFetchController?.signal.aborted === false) {
                currentAudioFetchController = null;
            }
        }
    }

    function playAdjacent(direction) {
        if (currentQueue.length === 0) return;

        const currentTrackIdStr = currentTrackId ? String(currentTrackId) : null;
        let idx = currentQueue.findIndex(t => String(t.trackId) === currentTrackIdStr);
        
        if (idx === -1) {
            // Текущий трек не найден в очереди (он был удален)
            if (lastRemovedCurrentTrackIndex !== null) {
                idx = lastRemovedCurrentTrackIndex;
                lastRemovedCurrentTrackIndex = null; // сбрасываем
            } else {
                idx = currentQueueIndex;
            }
            
            if (direction === 'next') {
                currentQueueIndex = idx;
            } else {
                currentQueueIndex = idx - 1;
            }
        } else {
            currentQueueIndex = direction === 'next' ? idx + 1 : idx - 1;
        }

        if (currentQueueIndex < 0) {
            if (direction === 'prev') {
                console.log(`[SoundSpace] Prev pressed at the beginning of the queue. Restarting track.`);
                const exists = currentQueue.some(t => String(t.trackId) === currentTrackIdStr);
                if (exists && currentTrackIdStr) {
                    const markers = cutMarkersByTrack.get(currentTrackIdStr);
                    const startTime = (markers && markers.length >= 1) ? markers[0] : 0;
                    player.currentTime = startTime;
                    if (player.paused) {
                        player.play().catch(e => console.error("Playback replay failed", e));
                    }
                    currentQueueIndex = 0;
                } else {
                    currentQueueIndex = 0;
                    const nextTrackData = currentQueue[0];
                    if (nextTrackData) {
                        handleTrackClick(nextTrackData, true);
                    }
                }
                return;
            }
        }

        if (currentQueueIndex < 0 || currentQueueIndex >= currentQueue.length) {
            console.log(`[SoundSpace] Queue boundary reached (${currentQueueIndex}/${currentQueue.length}). Stopping playback.`);
            player.pause();
            playerState.isPlaying = false;
            return;
        }

        const nextTrackData = currentQueue[currentQueueIndex];
        handleTrackClick(nextTrackData, true);
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

        // Показываем спиннер
        els.searchResults.innerHTML = '<div class="search-spinner-container"><div class="search-spinner-ss"></div><p>Searching Qobuz...</p></div>';

        try {
            const res = await fetch(`/data/audio/search?query=${encodeURIComponent(query)}&type=tracks`);
            const data = await res.json();
            renderResults(data.tracks?.items || []);
        } catch (err) { 
            console.error(err);
            els.searchResults.innerHTML = '<div class="empty-state-ss">Search failed. Try again.</div>';
        }
    });

    els.parentContainer.addEventListener('touchstart', (e) => {
        if (!els.topSearchPanel.contains(e.target) && els.topSearchPanel.classList.contains('active')) {
            dismissSearch();
        }
    }, { passive: true });

    let lastNonPlayerPanelId = 'library-panel';

    els.bottomNavbar.addEventListener('click', (e) => {
        const navBtn = e.target.closest('.nav-button');
        if (!navBtn) return;
        const panelId = navBtn.dataset.panel;

        if (panelId !== 'player-panel' && panelId !== 'close-panel') {
            lastNonPlayerPanelId = panelId;
        }

        // Снимаем класс active со всех нижних кнопок
        els.bottomNavbar.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));

        if (panelId === 'close-panel') {
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            els.parentContainer.classList.remove('content-scaled');
            dismissSearch();
            return;
        }

        const overlaysContainer = document.querySelector('.overlays-container');
        if (overlaysContainer) {
            if (panelId === 'player-panel') {
                overlaysContainer.classList.add('player-active');
            } else {
                overlaysContainer.classList.remove('player-active');
            }
        }

        // Подсвечиваем активную кнопку
        navBtn.classList.add('active');

        const target = document.getElementById(panelId);
        if (target) {
            const isAlreadyActive = target.classList.contains('active');
            
            const updateDOM = () => {
                // Clear other panels but keep overlays if needed (or just clear all main panels)
                document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
                target.classList.add('active');
            };

            if (document.startViewTransition) {
                document.startViewTransition(updateDOM);
            } else {
                updateDOM();
            }

            
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
                setActiveLibraryTab(libraryState.lastTab);
            }
        }
    });

    // --- LIBRARY LOGIC ---
    function saveLibraryToLocal() {
        localStorage.setItem('ss_playlists', JSON.stringify(libraryState.playlists));
        localStorage.setItem('ss_library_updated', new Date().toISOString());
    }

    function updatePlaylistCovers(pl, newTrack = null) {
        if (!pl) return;
        if (pl.tracks) {
            const covers = pl.tracks
                .map(t => t.album?.image?.small || t.image?.small || t.album?.image?.large || t.image?.large || '')
                .filter(Boolean);
            pl.track_covers = covers.slice(0, 4);
        } else if (newTrack) {
            if (!pl.track_covers) pl.track_covers = [];
            if (pl.track_covers.length < 4) {
                const cover = newTrack.album?.image?.small || newTrack.image?.small || newTrack.album?.image?.large || newTrack.image?.large || '';
                if (cover && !pl.track_covers.includes(cover)) {
                    pl.track_covers.push(cover);
                }
            }
        }
    }

    function updateDetailHeaderCover(playlist) {
        const blurBg = document.getElementById('playlist-blur-bg-ss');
        if (!blurBg) return;
        
        const tracks = playlist.tracks || [];
        const covers = playlist.track_covers || tracks.map(t => getImg(t)).filter(Boolean);
        const coverUrl = playlist.coverImage || (covers.length ? covers[0] : '');
        
        if (coverUrl) {
            blurBg.style.backgroundImage = `url('${coverUrl}')`;
            blurBg.style.display = 'block';
        } else {
            blurBg.style.backgroundImage = 'none';
            blurBg.style.display = 'none';
        }

        const coverArtWrapper = document.querySelector('.ss-playlist-cover-art-wrapper');
        if (coverArtWrapper) {
            let coverHtml = '';
            if (covers.length >= 4) {
                coverHtml = `
                    <div class="playlist-cover-collage cols-4">
                        ${covers.slice(0, 4).map(src => `<img src="${src}" alt="cover">`).join('')}
                    </div>
                `;
            } else if (covers.length === 3) {
                coverHtml = `
                    <div class="playlist-cover-collage cols-3">
                        ${covers.slice(0, 3).map(src => `<img src="${src}" alt="cover">`).join('')}
                    </div>
                `;
            } else if (covers.length === 2) {
                coverHtml = `
                    <div class="playlist-cover-collage cols-2">
                        ${covers.slice(0, 2).map(src => `<img src="${src}" alt="cover">`).join('')}
                    </div>
                `;
            } else if (covers.length === 1) {
                coverHtml = `<img src="${covers[0]}" alt="cover">`;
            } else if (playlist.coverImage) {
                coverHtml = `<img src="${playlist.coverImage}" alt="cover">`;
            } else {
                coverHtml = `<span class="material-symbols-outlined" style="font-size:2rem; color:rgba(255,255,255,0.1)">music_note</span>`;
            }
            coverArtWrapper.innerHTML = coverHtml;
        }
    }

    async function fetchPlaylistsSS() {
        if (!els.playlistsContainer) return;
        if (!libraryState.needsPlaylistsSync && libraryState.playlists.length > 0) return;

        renderPlaylistsSS(libraryState.playlists);

        try {
            const res = await fetch('/library/playlists');
            if (res.ok) {
                const playlists = await res.json();
                libraryState.playlists = playlists.map(newPl => {
                    const existing = libraryState.playlists.find(p => String(p.id) === String(newPl.id));
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
        
        els.playlistsContainer.innerHTML = playlists.map(pl => {
            const tracks = pl.tracks || [];
            const covers = pl.track_covers || tracks.map(t => getImg(t)).filter(Boolean);
            let coverHtml = '';

            if (covers.length >= 4) {
                coverHtml = `
                    <div class="playlist-cover-collage cols-4">
                        ${covers.slice(0, 4).map(src => `<img src="${src}" loading="lazy" alt="cover">`).join('')}
                    </div>
                `;
            } else if (covers.length === 3) {
                coverHtml = `
                    <div class="playlist-cover-collage cols-3">
                        ${covers.slice(0, 3).map(src => `<img src="${src}" loading="lazy" alt="cover">`).join('')}
                    </div>
                `;
            } else if (covers.length === 2) {
                coverHtml = `
                    <div class="playlist-cover-collage cols-2">
                        ${covers.slice(0, 2).map(src => `<img src="${src}" loading="lazy" alt="cover">`).join('')}
                    </div>
                `;
            } else if (covers.length === 1) {
                coverHtml = `<img src="${covers[0]}" loading="lazy" alt="cover">`;
            } else if (pl.coverImage) {
                coverHtml = `<img src="${pl.coverImage}" loading="lazy" alt="cover">`;
            } else {
                coverHtml = `<span class="material-symbols-outlined" style="font-size:2rem; color:rgba(255,255,255,0.1)">music_note</span>`;
            }

            return `
                <div class="playlist-card-ss" data-id="${pl.id}">
                    <div class="playlist-cover-ss">
                        ${coverHtml}
                        <div class="playlist-overlay-info-ss">
                            <h4>${escapeHtml(pl.title)}</h4>
                            <p>${pl.trackCount || pl.tracks?.length || 0} tracks</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function handlePlaylistClickSS(id) {
        const pl = libraryState.playlists.find(p => String(p.id) === String(id));
        
        if (pl) {
            // Мгновенная предзагрузка обложек перед открытием
            const tracks = pl.tracks || [];
            const covers = pl.track_covers || tracks.map(t => getImg(t)).filter(Boolean);
            if (covers && covers.length > 0) {
                covers.slice(0, 4).forEach(src => {
                    const img = new Image();
                    img.src = src;
                });
            }
            renderPlaylistDetailSS(pl);
        } else {
            els.playlistContent.innerHTML = '<div style="padding:40px; text-align:center">Loading Spirits...</div>';
        }

        openOverlay('playlist-panel');

        try {
            const res = await fetch(`/library/playlists/${id}/tracks`);
            if (res.ok) {
                const tracks = await res.json();
                const currentPl = libraryState.playlists.find(p => String(p.id) === String(id));
                if (currentPl) {
                    currentPl.tracks = tracks;
                    saveLibraryToLocal();
                    renderPlaylistDetailSS(currentPl);
                } else {
                    renderPlaylistDetailSS({ title: 'Playlist', tracks });
                }
            }
        } catch (e) { console.error(e); }
    }

    function updatePlaylistDetailCoversOnly(playlist) {
        const content = els.playlistContent;
        if (!content || content.dataset.loadedId !== String(playlist.id)) return;
        const tracks = playlist.tracks || [];
        const covers = playlist.track_covers || tracks.map(t => getImg(t)).filter(Boolean);
        const coverUrl = playlist.coverImage || (covers.length ? covers[0] : '');
        
        const coversJson = JSON.stringify(covers.slice(0, 4)) + '||' + coverUrl;
        if (content.dataset.renderedCovers !== coversJson) {
            content.dataset.renderedCovers = coversJson;
            
            const blurBg = document.getElementById('playlist-blur-bg-ss');
            if (blurBg) {
                if (coverUrl) {
                    blurBg.style.backgroundImage = `url('${coverUrl}')`;
                    blurBg.style.display = 'block';
                } else {
                    blurBg.style.backgroundImage = 'none';
                    blurBg.style.display = 'none';
                }
            }
            
            const coverArtWrapper = content.querySelector('.ss-playlist-cover-art-wrapper');
            if (coverArtWrapper) {
                let coverHtml = '';
                if (covers.length >= 3) {
                    coverHtml = `
                        <div class="ss-cover-deck">
                            <div class="deck-card card-3"><img src="${covers[2]}" alt="cover"></div>
                            <div class="deck-card card-2"><img src="${covers[1]}" alt="cover"></div>
                            <div class="deck-card card-1"><img src="${covers[0]}" alt="cover"></div>
                        </div>
                    `;
                } else if (covers.length === 2) {
                    coverHtml = `
                        <div class="ss-cover-deck">
                            <div class="deck-card card-2"><img src="${covers[1]}" alt="cover"></div>
                            <div class="deck-card card-1"><img src="${covers[0]}" alt="cover"></div>
                        </div>
                    `;
                } else if (covers.length === 1) {
                    coverHtml = `
                        <div class="ss-cover-deck">
                            <div class="deck-card card-1"><img src="${covers[0]}" alt="cover"></div>
                        </div>
                    `;
                } else if (playlist.coverImage) {
                    coverHtml = `
                        <div class="ss-cover-deck">
                            <div class="deck-card card-1"><img src="${playlist.coverImage}" alt="cover"></div>
                        </div>
                    `;
                } else {
                    coverHtml = `<div class="ss-cover-deck"><div class="deck-card card-1" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined" style="font-size:2rem; color:rgba(255,255,255,0.1)">music_note</span></div></div>`;
                }
                coverArtWrapper.innerHTML = coverHtml;
            }
        }
    }

    function renderPlaylistDetailSS(playlist) {
        const content = els.playlistContent;
        const tracks = playlist.tracks || [];
        const covers = playlist.track_covers || tracks.map(t => getImg(t)).filter(Boolean);
        const coverUrl = playlist.coverImage || (covers.length ? covers[0] : '');
        
        const isSamePlaylist = content.dataset.loadedId === String(playlist.id);
        
        if (!isSamePlaylist) {
            content.replaceChildren();
            content.className = 'ss-playlist-view'; 
            content.dataset.loadedId = playlist.id;
            content.dataset.renderedCovers = '';
            
            const headerWrapper = document.createElement('div');
            headerWrapper.className = 'ss-playlist-header-wrapper';
            headerWrapper.innerHTML = `
                <div class="ss-playlist-header">
                    <div class="ss-playlist-cover-art-wrapper"></div>
                    <div class="ss-header-text-block">
                        <div class="ss-label-header">PLAYLIST</div>
                        <h1 class="ss-title-huge">${escapeHtml(playlist.title)}</h1>
                        <div class="ss-label-header-count ss-label-header" style="margin-top:8px;">0 TRACKS</div>
                    </div>
                    <button class="ss-play-mini-btn ss-play-header-btn">
                        <span class="material-symbols-outlined">play_arrow</span>
                    </button>
                </div>
            `;

            const trackList = document.createElement('div');
            trackList.className = 'ss-acid-list no-scrollbar';
            
            content.appendChild(headerWrapper);
            content.appendChild(trackList);
            
            // Play All Logic
            headerWrapper.querySelector('.ss-play-mini-btn').onclick = () => {
                const first = trackList.querySelector('.playable-track');
                if (first) handleTrackClick(first, false);
            };
        }

        // Обновляем количество треков в шапке
        const countEl = content.querySelector('.ss-label-header-count');
        if (countEl) {
            countEl.textContent = `${playlist.trackCount || tracks.length} TRACKS`;
        }

        // Обновляем обложку, если она изменилась
        const coversJson = JSON.stringify(covers.slice(0, 4)) + '||' + coverUrl;
        if (content.dataset.renderedCovers !== coversJson) {
            content.dataset.renderedCovers = coversJson;
            
            const blurBg = document.getElementById('playlist-blur-bg-ss');
            if (blurBg) {
                if (coverUrl) {
                    blurBg.style.backgroundImage = `url('${coverUrl}')`;
                    blurBg.style.display = 'block';
                } else {
                    blurBg.style.backgroundImage = 'none';
                    blurBg.style.display = 'none';
                }
            }

            const coverArtWrapper = content.querySelector('.ss-playlist-cover-art-wrapper');
            if (coverArtWrapper) {
                let coverHtml = '';
                if (covers.length >= 3) {
                    coverHtml = `
                        <div class="ss-cover-deck">
                            <div class="deck-card card-3"><img src="${covers[2]}" alt="cover"></div>
                            <div class="deck-card card-2"><img src="${covers[1]}" alt="cover"></div>
                            <div class="deck-card card-1"><img src="${covers[0]}" alt="cover"></div>
                        </div>
                    `;
                } else if (covers.length === 2) {
                    coverHtml = `
                        <div class="ss-cover-deck">
                            <div class="deck-card card-2"><img src="${covers[1]}" alt="cover"></div>
                            <div class="deck-card card-1"><img src="${covers[0]}" alt="cover"></div>
                        </div>
                    `;
                } else if (covers.length === 1) {
                    coverHtml = `
                        <div class="ss-cover-deck">
                            <div class="deck-card card-1"><img src="${covers[0]}" alt="cover"></div>
                        </div>
                    `;
                } else if (playlist.coverImage) {
                    coverHtml = `
                        <div class="ss-cover-deck">
                            <div class="deck-card card-1"><img src="${playlist.coverImage}" alt="cover"></div>
                        </div>
                    `;
                } else {
                    coverHtml = `<div class="ss-cover-deck"><div class="deck-card card-1" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined" style="font-size:2rem; color:rgba(255,255,255,0.1)">music_note</span></div></div>`;
                }
                coverArtWrapper.innerHTML = coverHtml;
            }
        }

        // Обновляем список треков
        const trackList = content.querySelector('.ss-acid-list');
        if (trackList) {
            trackList.replaceChildren();
            
            if (!playlist.tracks) {
                const loader = document.createElement('div');
                loader.className = 'loading-tracks-indicator';
                loader.style.cssText = 'padding: 40px; text-align: center; opacity: 0.6; font-size: 0.9rem;';
                loader.textContent = 'Loading playlist tracks...';
                trackList.appendChild(loader);
            } else if (tracks.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'empty-state-ss';
                empty.style.cssText = 'padding: 40px; text-align: center; opacity: 0.5;';
                empty.textContent = 'Playlist is empty';
                trackList.appendChild(empty);
            } else {
                tracks.forEach((t) => {
                    trackCache.set(String(t.id), t);
                    const row = document.createElement('div');
                    row.className = 'ss-acid-row search-result-track playable-track'; 
                    
                    const artistId = t.performer?.id || t.artist?.id || t.album?.artist?.id || '';
                    const albumId = t.album?.id || '';
                    const rawArtist = t.performers || t.performer?.name || t.artist?.name || t.album?.artist?.name || 'Unknown';
                    const artistName = rawArtist.split(',')[0].replace(/\s*\(.*?\)/g, '').trim();
                    const coverUrl = getImg(t);

                    row.setAttribute('data-track-id', t.id);
                    row.setAttribute('data-artist-id', artistId);
                    row.setAttribute('data-album-id', albumId);
                    row.setAttribute('data-title', t.title);
                    row.setAttribute('data-artist', artistName);
                    row.setAttribute('data-album', t.album?.title || '');
                    row.setAttribute('data-cover', coverUrl);
                    
                    row.innerHTML = `
                        <img src="${getImgSmall(t)}" class="search-result-track-cover" loading="lazy">
                        <div class="track-info">
                            <p class="track-title">${escapeHtml(t.title)}</p>
                            <p class="track-artist"><span style="color: var(--accent-primary, coral); font-weight: 500;">${escapeHtml(artistName)}</span><span class="track-title-sep"> | </span><span class="track-title-duration">${formatTime(t.duration)}</span></p>
                        </div>
                        <div class="track-actions-slide">
                            <button class="slide-btn btn-add-to-playlist" title="Add to Playlist">
                                <i data-lucide="plus"></i>
                            </button>
                            <button class="slide-btn btn-delete-track" title="Remove from Playlist" style="color: #ff4a4a;">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    `;

                    // Add to Playlist Button
                    row.querySelector('.btn-add-to-playlist').onclick = (e) => {
                        e.stopPropagation();
                        row.classList.remove('show-actions');
                        openAddToPlaylistModal(t);
                    };

                    // Delete Logic
                    row.querySelector('.btn-delete-track').onclick = async (e) => {
                        e.stopPropagation();
                        row.classList.remove('show-actions');
                        try {
                            const res = await fetch(`/library/playlists/${playlist.id}/tracks/${t.id}`, { method: 'DELETE' });
                            if (res.ok) {
                                const rowHeight = row.offsetHeight;
                                row.style.maxHeight = `${rowHeight}px`;
                                row.offsetHeight; // Force browser reflow
                                row.classList.add('is-removing');
                                row.style.maxHeight = '0px';

                                 const updateStateAndUi = () => {
                                     if (cachedQueueContext === 'playlist' && String(cachedQueueId) === String(playlist.id)) {
                                         removeTrackFromQueue(t.id);
                                     }

                                     const pl = libraryState.playlists.find(p => String(p.id) === String(playlist.id));
                                     if (pl && pl.tracks) {
                                         pl.tracks = pl.tracks.filter(track => track.id !== t.id);
                                         pl.trackCount = Math.max(0, pl.trackCount - 1);
                                         updatePlaylistCovers(pl);
                                         saveLibraryToLocal();
                                         
                                         // Direct DOM updates to avoid full tracklist redraw and image flickering
                                         const countEl = els.playlistContent.querySelector('.ss-label-header-count');
                                         if (countEl) {
                                             countEl.textContent = `${pl.trackCount} TRACKS`;
                                         }
                                         updatePlaylistDetailCoversOnly(pl);
                                         renderPlaylistsSS(libraryState.playlists);

                                         if (pl.tracks.length === 0) {
                                              const trackList = els.playlistContent.querySelector('.ss-acid-list');
                                              if (trackList) {
                                                  trackList.replaceChildren();
                                                  const empty = document.createElement('div');
                                                  empty.className = 'empty-state-ss';
                                                  empty.style.cssText = 'padding: 40px; text-align: center; opacity: 0.5;';
                                                  empty.textContent = 'Playlist is empty';
                                                  trackList.appendChild(empty);
                                              }
                                         }
                                     }
                                     row.remove();
                                 };

                                 const animations = row.getAnimations();
                                 if (animations.length > 0) {
                                     Promise.allSettled(animations.map(a => a.finished)).then(updateStateAndUi);
                                 } else {
                                     updateStateAndUi();
                                 }
                             }
                        } catch (err) { console.error(err); }
                    };

                    trackList.appendChild(row);
                });
            }

            initSwipeForTrackList(trackList);
        }

        if (window.lucide) window.lucide.createIcons();
        syncPlayingHighlights();
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
                        els.addArtistToLibBtn.innerHTML = '<i data-lucide="user-plus"></i>';
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
            // Reset input and validation errors on open
            els.playlistTitleInput.value = '';
            els.playlistTitleInput.setCustomValidity('');
            const errorDiv = document.getElementById('playlist-title-error');
            if (errorDiv) errorDiv.textContent = '';
        });
    }

    if (els.playlistTitleInput) {
        els.playlistTitleInput.addEventListener('input', () => {
            const title = els.playlistTitleInput.value.trim();
            const errorDiv = document.getElementById('playlist-title-error');
            
            if (!title) {
                els.playlistTitleInput.setCustomValidity('Title is required');
                if (errorDiv) errorDiv.textContent = 'Playlist title cannot be empty.';
                return;
            }
            if (title.length > 50) {
                els.playlistTitleInput.setCustomValidity('Title cannot exceed 50 characters');
                if (errorDiv) errorDiv.textContent = 'Title must be 50 characters or less.';
                return;
            }
            
            // Check for case-insensitive duplicate playlist names
            const exists = libraryState.playlists.some(p => p.title.toLowerCase() === title.toLowerCase());
            if (exists) {
                els.playlistTitleInput.setCustomValidity('Playlist name already exists');
                if (errorDiv) errorDiv.textContent = 'A playlist with this name already exists.';
            } else {
                els.playlistTitleInput.setCustomValidity('');
                if (errorDiv) errorDiv.textContent = '';
            }
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
            const errorDiv = document.getElementById('playlist-title-error');
            
            // Re-run validations
            if (!title) {
                els.playlistTitleInput.setCustomValidity('Title is required');
                if (errorDiv) errorDiv.textContent = 'Playlist title cannot be empty.';
                return;
            }
            if (title.length > 50) {
                els.playlistTitleInput.setCustomValidity('Title cannot exceed 50 characters');
                if (errorDiv) errorDiv.textContent = 'Title must be 50 characters or less.';
                return;
            }
            const exists = libraryState.playlists.some(p => p.title.toLowerCase() === title.toLowerCase());
            if (exists) {
                els.playlistTitleInput.setCustomValidity('Playlist name already exists');
                if (errorDiv) errorDiv.textContent = 'A playlist with this name already exists.';
                return;
            }

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
                } else {
                    if (res.status === 409) {
                        els.playlistTitleInput.setCustomValidity('Playlist name already exists');
                        if (errorDiv) errorDiv.textContent = 'A playlist with this name already exists.';
                    } else {
                        els.playlistTitleInput.setCustomValidity('Error creating playlist');
                        if (errorDiv) errorDiv.textContent = 'Failed to create playlist. Please try again.';
                    }
                }
            } catch (e) { 
                console.error(e); 
                if (errorDiv) errorDiv.textContent = 'Connection error. Please try again.';
            }
        });
    }

    // --- ADD TRACK TO PLAYLIST LOGIC ---
    let trackToAdd = null;

    function openAddToPlaylistModal(trackData) {
        trackToAdd = trackData;
        if (!trackToAdd) return;
        els.addToPlaylistModal.classList.remove('hidden');
        els.selectPlaylistList.innerHTML = libraryState.playlists.map(pl => {
            const hasTrack = pl.tracks && pl.tracks.some(t => String(t.id) === String(trackToAdd.id));
            return `
                <div class="ss-playlist-select-item ${hasTrack ? 'ss-already-added' : ''}" data-id="${pl.id}" style="${hasTrack ? 'opacity: 0.5; pointer-events: none;' : ''}">
                    <div class="ss-playlist-select-cover">
                        ${pl.coverImage ? `<img src="${pl.coverImage}">` : '<i class="fa-solid fa-music"></i>'}
                    </div>
                    <div class="ss-playlist-select-info">
                        <h4>${escapeHtml(pl.title)}</h4>
                        <p>${hasTrack ? 'Already in this playlist' : `${pl.trackCount || 0} tracks`}</p>
                    </div>
                </div>
            `;
        }).join('');
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
            if (item.classList.contains('ss-already-added')) {
                alert('This track is already in this playlist.');
                return;
            }
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
                    const pl = libraryState.playlists.find(p => String(p.id) === String(playlistId));
                    if (pl) {
                        if (!pl.tracks) pl.tracks = [];
                        pl.tracks.push(trackPayload);
                        pl.trackCount = (pl.trackCount || 0) + 1; // Increment count
                        updatePlaylistCovers(pl, trackPayload);
                        saveLibraryToLocal();
                        renderPlaylistsSS(libraryState.playlists);
                        if (els.playlistContent.dataset.loadedId === String(playlistId)) {
                            renderPlaylistDetailSS(pl);
                        }
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
            } else if (addBtn.classList.contains('btn-like-track') || addBtn.innerHTML.includes('heart') || (addBtn.querySelector('i') && addBtn.querySelector('i').dataset.lucide === 'heart')) {
                toggleLikeTrack(fullData, addBtn);
            } else if (addBtn.innerHTML.includes('plus') || addBtn.classList.contains('btn-add-to-playlist')) {
                openAddToPlaylistModal(fullData);
            }
            e.stopPropagation();
        }
    });

    async function toggleLikeTrack(track, buttonEl) {
        const trackId = String(track.id);
        const isLiked = libraryState.likedTrackIds.has(trackId);
        
        if (isLiked) {
            try {
                const res = await fetch(`/library/tracks/${trackId}`, { method: 'DELETE' });
                if (res.ok) {
                    const row = els.tracksLibContainer ? els.tracksLibContainer.querySelector(`.search-result-track[data-track-id="${trackId}"]`) : null;

                    const updateStateAndUi = () => {
                        libraryState.likedTrackIds.delete(trackId);
                        libraryState.likedTracks = libraryState.likedTracks.filter(t => String(t.id) !== trackId);
                        
                        if (cachedQueueContext === 'tracks') {
                            removeTrackFromQueue(trackId);
                        }

                        updateHeartIcons(trackId, false);
                        if (els.tracksLibContainer) {
                            if (row) {
                                // The row was already animated and removed from DOM, do not redraw the whole list
                                row.remove();
                                if (libraryState.likedTracks.length === 0) {
                                    els.tracksLibContainer.innerHTML = '<div class="empty-state-ss">No liked tracks yet</div>';
                                }
                            } else {
                                // Unliked from player or search results, redraw to keep the library in sync
                                renderLikedTracksSS();
                            }
                        }
                    };

                    if (row) {
                        const rowHeight = row.offsetHeight;
                        row.style.maxHeight = `${rowHeight}px`;
                        row.offsetHeight; // Force reflow
                        row.classList.add('is-removing');
                        row.style.maxHeight = '0px';
                        const animations = row.getAnimations();
                        if (animations.length > 0) {
                            Promise.allSettled(animations.map(a => a.finished)).then(updateStateAndUi);
                        } else {
                            updateStateAndUi();
                        }
                    } else {
                        updateStateAndUi();
                    }
                }
            } catch (e) { console.error('Failed to remove track from library', e); }
        } else {
            const payload = mapToTrackDto(track);
            try {
                const res = await fetch('/library/tracks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    libraryState.likedTrackIds.add(trackId);
                    libraryState.likedTracks.unshift(payload);
                    updateHeartIcons(trackId, true);
                    if (els.tracksLibContainer) {
                        renderLikedTracksSS();
                    }
                }
            } catch (e) { console.error('Failed to add track to library', e); }
        }
    }

    function updateHeartIcons(trackId, isLikedNow) {
        const playerBtnLike = document.getElementById('btn-like');
        if (playerBtnLike && playerState.currentTrack && String(playerState.currentTrack.id) === String(trackId)) {
            const icon = playerBtnLike.querySelector('i');
            if (isLikedNow) {
                playerBtnLike.classList.add('active');
                if (icon) icon.style.color = ''; // сброс инлайн-стиля, цвет берется из CSS
            } else {
                playerBtnLike.classList.remove('active');
                if (icon) icon.style.color = ''; // сброс инлайн-стиля
            }
        }

        document.querySelectorAll(`.search-result-track[data-track-id="${trackId}"] .btn-like-track`).forEach(btn => {
            const i = btn.querySelector('i');
            const svg = btn.querySelector('svg');
            if (isLikedNow) {
                btn.classList.add('active');
                btn.style.color = '';
                if (i) i.style.fill = '';
                if (svg) {
                    svg.style.fill = '';
                    svg.style.stroke = '';
                }
            } else {
                btn.classList.remove('active');
                btn.style.color = '';
                if (i) i.style.fill = '';
                if (svg) {
                    svg.style.fill = '';
                    svg.style.stroke = '';
                }
            }
        });
    }

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
        closeSwipeActionsInScope(els.tracksLibContainer, exceptRow);
        closeSwipeActionsInScope(els.playlistContent, exceptRow);
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
            if (!swipeRow || !e.touches?.[0]) return;
            if (swipeLocked) return;

            const dx = e.touches[0].clientX - swipeStartX;
            const dy = e.touches[0].clientY - swipeStartY;
            const absX = Math.abs(dx);
            const absY = Math.abs(dy);

            if (absX > 4 || absY > 4) {
                if (absY > absX) {
                    // Vertical drag -> lock swipe detection so list can scroll normally
                    swipeLocked = true;
                    return;
                } else {
                    // Horizontal drag -> prevent default vertical scroll
                    if (e.cancelable) e.preventDefault();

                    if (dx < -30) {
                        closeAllSwipeActions(swipeRow);
                        swipeRow.classList.add('show-actions');
                        swipeLocked = true;
                    } else if (dx > 20) {
                        swipeRow.classList.remove('show-actions');
                        swipeLocked = true;
                    }
                }
            }
        }, { passive: false });

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
        const hasOpen = document.querySelector('.search-result-track.show-actions');
        if (!hasOpen) return;
        if (e.target.closest('.track-actions-slide')) return;
        closeAllSwipeActions();
    }, { capture: true, passive: true });

    document.addEventListener('pointerdown', (e) => {
        const hasOpen = document.querySelector('.search-result-track.show-actions');
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
    
    if (els.tracksLibContainer) {
        initSwipeForTrackList(els.tracksLibContainer);
        els.tracksLibContainer.addEventListener('click', (e) => {
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
                handleTrackClick(trackRow, false, true); 
            }
        });
    }

    if (els.playlistContent) {
        els.playlistContent.addEventListener('click', (e) => {
            const trackRow = e.target.closest('.playable-track');
            if (trackRow && !e.target.closest('.track-actions-slide')) {
                handleTrackClick(trackRow, false, true);
            }
        });
    }

    if (els.playBtnContainer) {
        els.playBtnContainer.addEventListener('click', () => {
            player.paused ? player.play() : player.pause();
        });
    }
    if (els.forwardBtn) els.forwardBtn.addEventListener('click', () => {
        isManualSwitch = true;
        playAdjacent('next');
    });
    if (els.backwardBtn) els.backwardBtn.addEventListener('click', () => {
        isManualSwitch = true;
        playAdjacent('prev');
    });

    // Обработчики статических кнопок Like и Add на плеере
    const playerBtnLike = document.getElementById('btn-like');
    if (playerBtnLike) {
        playerBtnLike.addEventListener('click', () => {
            if (playerState.currentTrack) {
                const trackIdStr = String(playerState.currentTrack.id);
                const cachedTrack = trackCache.get(trackIdStr);
                const trackToLike = cachedTrack || {
                    id: playerState.currentTrack.id,
                    title: playerState.currentTrack.title,
                    artist: { name: playerState.currentTrack.artist },
                    album: { title: playerState.currentTrack.album, image: { large: playerState.currentTrack.cover } }
                };
                toggleLikeTrack(trackToLike, playerBtnLike);
            }
        });
    }
    const playerBtnAdd = document.getElementById('btn-add');
    if (playerBtnAdd) {
        playerBtnAdd.addEventListener('click', () => {
            if (playerState.currentTrack) {
                const trackIdStr = String(playerState.currentTrack.id);
                const cachedTrack = trackCache.get(trackIdStr);
                const trackToAdd = cachedTrack || {
                    id: playerState.currentTrack.id,
                    title: playerState.currentTrack.title,
                    artist: { name: playerState.currentTrack.artist },
                    album: { title: playerState.currentTrack.album, image: { large: playerState.currentTrack.cover } }
                };
                openAddToPlaylistModal(trackToAdd);
            }
        });
    }

    let isIntroAnimating = false;
    let introAnimationStart = 0;
    let introAnimationDuration = 800;
    let introAnimationTarget = 0;
    let showPlayheads = false;
    let playheadDelayTimeout = null;

    function triggerPlayheadDelay() {
        showPlayheads = false;
        if (els.waveformPlayheads) {
            els.waveformPlayheads.forEach(playhead => playhead.style.display = 'none');
        }
        if (playheadDelayTimeout) clearTimeout(playheadDelayTimeout);
        playheadDelayTimeout = setTimeout(() => {
            showPlayheads = true;
        }, 200);
    }

    let isFrequencyMode = false;

    function getSeed(str) {
        let hash = 0;
        if (!str) return hash;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash);
    }

    function seededRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    let waveformBars = [];

    function generateAndRenderWaveform() {
        if (!els.waveformBackground || !els.waveformForeground) return;
        
        const N = 120; // Количество полос
        const barWidth = 5;
        const gap = 3;
        const step = barWidth + gap; // 8
        const maxH = 85; // Максимальная высота
        const viewH = 100; // Высота viewBox
        
        let seed = getSeed(String(currentTrackId || "default"));
        
        waveformBars = [];
        
        // Lazy initialize the SVG rect nodes once
        if (els.waveformBackground.children.length === 0) {
            let bgHtml = '';
            let fgHtml = '';
            for (let i = 0; i < N; i++) {
                const x = i * step + 2;
                const rectStr = `<rect x="${x}" y="0" width="${barWidth}" height="0" rx="${barWidth/2}" ry="${barWidth/2}" />`;
                bgHtml += rectStr;
                fgHtml += rectStr;
            }
            els.waveformBackground.innerHTML = bgHtml;
            els.waveformForeground.innerHTML = fgHtml;
        }
        
        const rectsBg = els.waveformBackground.children;
        const rectsFg = els.waveformForeground.children;
        
        for (let i = 0; i < N; i++) {
            const x = i * step + 2;
            
            // Огибающая затухания
            const progress = i / (N - 1);
            let envelope = Math.sin(Math.PI * progress);
            
            // Затухание к краям
            if (progress < 0.1) {
                envelope = envelope * (progress / 0.1);
            } else if (progress > 0.9) {
                envelope = envelope * ((1 - progress) / 0.1);
            }
            
            const rand = seededRandom(seed + i);
            let h = 4 + maxH * (0.15 + 0.85 * rand) * envelope;
            
            if (h < 5) h = 5;
            
            const y = (viewH - h) / 2;
            
            // Recycle elements by only updating attributes
            if (rectsBg[i] && rectsFg[i]) {
                rectsBg[i].setAttribute('y', y.toString());
                rectsBg[i].setAttribute('height', h.toString());
                rectsFg[i].setAttribute('y', y.toString());
                rectsFg[i].setAttribute('height', h.toString());
            }
            waveformBars.push({ x, y, h });
        }
    }

    function updateWaveformProgress(overridePct) {
        if (!player.duration || !els.waveformClipRect) return;
        const pct = overridePct !== undefined ? overridePct : (player.currentTime / player.duration) * 100;
        els.waveformClipRect.setAttribute('width', (pct * 10).toString());
        
        if (waveformBars.length > 0 && els.waveformPlayheads && els.waveformPlayheads.length > 0) {
            const activeIndex = Math.min(waveformBars.length - 1, Math.floor((pct / 100) * waveformBars.length));
            
            els.waveformPlayheads.forEach((playhead, i) => {
                const targetIndex = activeIndex - i;
                if (targetIndex >= 0 && targetIndex < waveformBars.length && showPlayheads) {
                    const bar = waveformBars[targetIndex];
                    const playheadX = ((pct / 100) * 1000 - 4) - (i * 8);
                    playhead.setAttribute('x', playheadX.toString());
                    playhead.setAttribute('y', bar.y.toString());
                    playhead.setAttribute('height', bar.h.toString());
                    playhead.style.display = 'block';
                } else {
                    playhead.style.display = 'none';
                }
            });
        }
    }

    function toggleFrequencyMode() {
        isFrequencyMode = !isFrequencyMode;
        if (isFrequencyMode) {
            els.timeBarContainer.classList.add('frequency-mode');
            generateAndRenderWaveform();
            triggerPlayheadDelay();
            updateWaveformProgress();
        } else {
            els.timeBarContainer.classList.remove('frequency-mode');
            if (playheadDelayTimeout) clearTimeout(playheadDelayTimeout);
            showPlayheads = false;
            if (els.waveformPlayheads) {
                els.waveformPlayheads.forEach(playhead => playhead.style.display = 'none');
            }
        }
    }

    if (els.timeBarContainer) {
        let suppressNextTimebarClick = false;
        let clickTimeout = null;
        let lastTapTime = 0;
        let timebarPressTimer = null;

        const macroDialContainer = document.createElement('div');
        macroDialContainer.className = 'macro-dial-wrapper';
        macroDialContainer.innerHTML = `
            <div class="macro-btn-group">
                <button class="macro-btn cancel" id="macro-cancel"><i class="fa-solid fa-trash"></i></button>
                <button class="macro-btn save" id="macro-save"><i class="fa-solid fa-check"></i></button>
            </div>
            <div class="macro-dial-window" id="macro-dial">
                <div class="macro-ticks" id="macro-ticks"></div>
                <div class="macro-center"></div>
            </div>
        `;
        els.timeBarContainer.appendChild(macroDialContainer);

        let activeFinetuneKey = null;
        let activeFinetuneTime = 0;
        let originalMarkerState = [];

        function formatTimeMs(s) {
            if (!s) return '0:00.00';
            const m = Math.floor(s / 60);
            const sec = Math.floor(s % 60);
            const ms = Math.floor((s % 1) * 100);
            return `${m}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
        }

        function updateLiveMarker() {
            if (!activeFinetuneKey) return;
            cutMarkersByTrack.set(activeFinetuneKey, [activeFinetuneTime]);
            const node = els.timeBarContainer.querySelector('.cut-marker-node');
            if (node) {
                node.style.left = `${(activeFinetuneTime / player.duration) * 100}%`;
                const timeLabel = node.querySelector('.cut-marker-time');
                if(timeLabel) timeLabel.textContent = formatTime(activeFinetuneTime);
            } else {
                renderCutMarkers();
            }
            if (els.timeCurrent) els.timeCurrent.textContent = formatTimeMs(activeFinetuneTime);
            player.currentTime = activeFinetuneTime;
        }

        const dial = document.getElementById('macro-dial');
        const ticks = document.getElementById('macro-ticks');
        let isDraggingDial = false;
        let dialStartX = 0;
        let dialStartBgX = 0;
        let dialStartTime = 0;
        let previewTimeout = null;

        dial.addEventListener('pointerdown', (e) => {
            isDraggingDial = true;
            macroDialContainer.classList.add('is-dragging');
            if(previewTimeout) clearTimeout(previewTimeout);
            player.pause();
            dialStartX = e.clientX;
            dialStartTime = activeFinetuneTime;
            dialStartBgX = parseFloat(getComputedStyle(ticks).backgroundPositionX) || 0;
            dial.setPointerCapture(e.pointerId);
        });
        dial.addEventListener('pointermove', (e) => {
            if(!isDraggingDial) return;
            const deltaX = e.clientX - dialStartX;
            let newTime = dialStartTime - (deltaX * 0.02);
            newTime = Math.max(0, Math.min(player.duration || 0, newTime));
            activeFinetuneTime = newTime;
            
            ticks.style.backgroundPositionX = `${dialStartBgX + deltaX}px`;
            updateLiveMarker();
        });
        dial.addEventListener('pointerup', (e) => {
            isDraggingDial = false;
            macroDialContainer.classList.remove('is-dragging');
            dial.releasePointerCapture(e.pointerId);
            
            // Auto-preview burst
            player.currentTime = activeFinetuneTime;
            player.play();
            if(previewTimeout) clearTimeout(previewTimeout);
            previewTimeout = setTimeout(() => {
                if (!isDraggingDial && activeFinetuneKey && !player.paused) {
                    player.pause();
                    player.currentTime = activeFinetuneTime;
                }
            }, 500);
        });

        const closeMacroDial = () => {
            macroDialContainer.classList.remove('active');
            els.timeBarContainer.classList.remove('finetune-active');
            if (els.timeCurrent) {
                els.timeCurrent.classList.remove('time-current-finetune');
                els.timeCurrent.textContent = formatTime(player.currentTime);
            }
            activeFinetuneKey = null;
            if(previewTimeout) clearTimeout(previewTimeout);
        };

        document.getElementById('macro-cancel').addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeFinetuneKey) {
                if (originalMarkerState.length > 0) {
                    cutMarkersByTrack.set(activeFinetuneKey, originalMarkerState);
                } else {
                    cutMarkersByTrack.delete(activeFinetuneKey);
                }
                renderCutMarkers();
            }
            closeMacroDial();
        });

        document.getElementById('macro-save').addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeFinetuneKey) {
                const node = els.timeBarContainer.querySelector('.cut-marker-node');
                if (node) {
                    node.classList.add('saved-anim');
                    setTimeout(() => {
                        saveCutsToBackend(activeFinetuneKey);
                        closeMacroDial();
                    }, 350);
                    return;
                }
                saveCutsToBackend(activeFinetuneKey);
            }
            closeMacroDial();
        });

        window.openFinetuneDock = (trackId, initialTime) => {
            player.pause();
            activeFinetuneKey = String(trackId);
            activeFinetuneTime = initialTime;
            
            const markers = (cutMarkersByTrack.get(activeFinetuneKey) || []).slice();
            originalMarkerState = markers.slice();
            
            cutMarkersByTrack.set(activeFinetuneKey, [activeFinetuneTime]);
            renderCutMarkers();
            
            if (els.timeCurrent) els.timeCurrent.classList.add('time-current-finetune');
            macroDialContainer.classList.add('active');
            els.timeBarContainer.classList.add('finetune-active');
            updateLiveMarker();
        };

        const addCutMarkerAtClientX = (clientX) => {
            if (!player.duration || !currentTrackId) return;
            const rect = els.timeBarContainer.getBoundingClientRect();
            if (!rect.width) return;
            const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
            const markerSec = (clickX / rect.width) * player.duration;
            window.openFinetuneDock(currentTrackId, markerSec);
        };

        const handleTimebarSingleClick = (clientX, offsetX) => {
            const width = els.timeBarContainer.offsetWidth;
            let finalX = offsetX;
            if (finalX === undefined || finalX === null) {
                const rect = els.timeBarContainer.getBoundingClientRect();
                finalX = Math.max(0, Math.min(rect.width, clientX - rect.left));
            }
            isIntroAnimating = false;
            if (player.duration) {
                const targetTime = (finalX / width) * player.duration;
                player.currentTime = targetTime;
                
                if (isFrequencyMode) {
                    triggerPlayheadDelay();
                    const pct = (targetTime / player.duration) * 100;
                    updateWaveformProgress(pct);
                }
            }
        };

        els.timeBarContainer.addEventListener('click', (e) => {
            if (suppressNextTimebarClick) {
                suppressNextTimebarClick = false;
                e.preventDefault();
                return;
            }
            if (e.button === 2) return;

            if (clickTimeout) {
                clearTimeout(clickTimeout);
                clickTimeout = null;
                toggleFrequencyMode();
            } else {
                const clientX = e.clientX;
                const offsetX = e.offsetX;
                clickTimeout = setTimeout(() => {
                    handleTimebarSingleClick(clientX, offsetX);
                    clickTimeout = null;
                }, 250);
            }
        });

        els.timeBarContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            addCutMarkerAtClientX(e.clientX);
        });

        els.timeBarContainer.addEventListener('touchstart', (e) => {
            if (!e.touches || !e.touches[0]) return;
            const touchX = e.touches[0].clientX;
            const currentTimeTime = new Date().getTime();
            const tapLength = currentTimeTime - lastTapTime;

            if (tapLength < 300 && tapLength > 0) {
                e.preventDefault();
                cancelTimebarLongPress();
                suppressNextTimebarClick = true;
                toggleFrequencyMode();
                lastTapTime = 0;
                return;
            }
            lastTapTime = currentTimeTime;

            timebarPressTimer = setTimeout(() => {
                addCutMarkerAtClientX(touchX);
                suppressNextTimebarClick = true;
                timebarPressTimer = null;
            }, 550);
        }, { passive: false });

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
            const isTrackLiked = libraryState.likedTrackIds.has(String(item.id));

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
                        <p class="track-artist">${escapeHtml(item.performer?.name || item.artist?.name)}<span class="track-title-sep"> | </span><span class="track-title-duration">${formatTime(item.duration)}</span></p>
                    </div>
                    <div class="track-actions-slide">
                        <button class="slide-btn btn-like-track ${isTrackLiked ? 'active' : ''}" style="${isTrackLiked ? 'color: coral;' : ''}" title="Like Track">
                            <i data-lucide="heart" style="${isTrackLiked ? 'fill: coral;' : ''}"></i>
                        </button>
                        <button class="slide-btn btn-add-to-playlist" title="Add to Playlist">
                            <i data-lucide="plus"></i>
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
            els.addArtistToLibBtn.innerHTML = isInLib ? '<i data-lucide="check"></i>' : '<i data-lucide="user-plus"></i>';
            if (window.lucide) lucide.createIcons();
        }

        try {
            const res = await fetch(`/data/audio/artist?artistId=${id}`);
            const data = await res.json();
            currentArtistData = data;

            if (els.artistContent.dataset.loadedId === id && els.artistContent.closest('.panel').classList.contains('active')) {
                renderArtistPanel(data);
            }
        } catch (e) { console.error(e); }
    }

    async function loadAlbum(id) {
        if (els.albumContent.dataset.loadedId === id) return;
        
        // Сразу сбрасываем старый фон для нового альбома
        const blurBg = document.getElementById('album-blur-bg-ss');
        if (blurBg) {
            blurBg.style.backgroundImage = 'none';
            blurBg.style.display = 'none';
        }

        els.albumContent.dataset.loadedId = id;
        els.albumContent.innerHTML = '<div style="padding:40px; text-align:center">Loading Geometry...</div>';

        try {
            const res = await fetch(`/data/audio/album?albumId=${id}`);
            const data = await res.json();
            currentAlbumData = data;

            if (els.albumContent.dataset.loadedId === id && els.albumContent.closest('.panel').classList.contains('active')) {
                renderAlbumPanel(data);
            }
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
            const isTrackLiked = libraryState.likedTrackIds.has(String(t.id));
            row.innerHTML = `
                <div class="flex-1 min-w-0 mr-4">
                    <h4 class="text-white font-medium text-[20px] truncate leading-tight group-hover:text-white/90">${escapeHtml(t.title)}</h4>
                </div>
                <div class="text-neutral-500 text-[13px] font-medium whitespace-nowrap">${formatTime(t.duration)}</div>
                <div class="track-actions-slide">
                    <button class="slide-btn btn-like-track ${isTrackLiked ? 'active' : ''}" style="${isTrackLiked ? 'color: coral;' : ''}"><i data-lucide="heart" style="${isTrackLiked ? 'fill: coral;' : ''}"></i></button>
                    <button class="slide-btn btn-add-to-playlist"><i data-lucide="plus"></i></button>
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
        
        const imgUrl = getImg(data);
        const blurBg = document.getElementById('album-blur-bg-ss');
        if (blurBg) {
            if (imgUrl) {
                blurBg.style.backgroundImage = `url('${imgUrl}')`;
                blurBg.style.display = 'block';
            } else {
                blurBg.style.backgroundImage = 'none';
                blurBg.style.display = 'none';
            }
        }

        const header = document.createElement('div');
        header.className = 'album-header-fixed';
        header.style.cssText = 'display:flex; flex-direction:row; align-items:flex-end; padding:16px 5px 10px; background:linear-gradient(to bottom, rgba(0, 0, 0, 0.45), transparent); gap:20px;';
        
        const isInLib = libraryState.albumIds.has(String(data.id));
        header.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; flex-shrink:0;">
                <div class="album-cover-container" style="width:145px; height:145px;">
                    ${imgUrl ? `<div class="vinyl-disk" style="background-image: url('${imgUrl}')"></div>` : '<div class="vinyl-disk fallback-vinyl"><span class="material-symbols-outlined">album</span></div>'}
                </div>
            </div>
            <div class="album-header-info" style="min-width: 0;">
                <p style="color:coral; font-size:10px; font-weight:900; letter-spacing:0.05em; margin:0 0 0px 0; text-transform:uppercase; line-height:1.2;">ALBUM <span style="color:rgba(255,255,255,0.5); font-weight:500; text-transform:lowercase; letter-spacing:normal; margin: 0 4px 0 6px;">by</span> <span style="color:coral; font-weight:700; text-transform:none; letter-spacing:normal;">${escapeHtml(data.artist?.name)}</span></p>
                <h1 class="neon-text" style="font-size:1.5rem; margin:2px 0 2px 0; line-height:1.1; color:#fff; text-shadow:0 0 6px rgba(255,255,255,0.5); font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;" title="${escapeHtml(data.title)}">${escapeHtml(data.title)}</h1>
                <p style="color:rgba(255,255,255,0.6); font-size:0.8em; margin-top:4px">${escapeHtml(data.genre?.name || 'Music')} • ${new Date(data.released_at * 1000).getFullYear()}</p>
                <div class="alb_panel_buttons_container">
                    <button id="play-album-start" class="alb-action-btn accent" title="Play Album">
                        <i data-lucide="play" style="width: 15px; height: 15px;"></i>
                        <span>Play</span>
                    </button>
                    <button id="add-album-to-lib" class="alb-action-btn" title="Add to Library">
                        <i data-lucide="${isInLib ? 'check' : 'plus'}" style="width: 15px; height: 15px;"></i>
                        <span>${isInLib ? 'Library' : 'Add'}</span>
                    </button>
                </div>
            </div>
        `;

        const scroll = document.createElement('div');
        scroll.className = 'track-list-scroll';
        if (data.tracks?.items) {
            data.tracks.items.forEach((t) => {
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
                const isTrackLiked = libraryState.likedTrackIds.has(String(t.id));
                row.innerHTML = `
                     <div class="track-info" style="display: flex; flex-direction: row; align-items: center; gap: 10px;">
                        <span class="track-dot" style="width: 5px; height: 5px; background-color: rgba(255, 255, 255, 0.45); border-radius: 50%; flex-shrink: 0;"></span>
                        <div style="min-width: 0; flex: 1;">
                            <p class="track-title" style="color:#fff; font-size: 1.15rem; margin: 0; line-height: 1.25; font-weight: 700;">${escapeHtml(t.title)}</p>
                            <p class="track-artist" style="opacity:0.7; margin: 2px 0 0 0; font-size: 0.82rem;">${formatTime(t.duration)}</p>
                        </div>
                     </div>
                     <div class="track-actions-slide">
                        <button class="slide-btn btn-like-track ${isTrackLiked ? 'active' : ''}" style="${isTrackLiked ? 'color: coral;' : ''}"><i data-lucide="heart" style="${isTrackLiked ? 'fill: coral;' : ''}"></i></button>
                        <button class="slide-btn btn-add-to-playlist"><i data-lucide="plus"></i></button>
                     </div>
                `;
                scroll.appendChild(row);
            });
        }

        // Add Listeners dynamically
        const addBtn = header.querySelector('#add-album-to-lib');
        if (addBtn) {
            addBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const albumId = String(data.id);
                const currentIsInLib = libraryState.albumIds.has(albumId);
                if (currentIsInLib) {
                    // Remove
                    try {
                        const res = await fetch(`/library/albums/${albumId}`, { method: 'DELETE' });
                        if (res.ok) {
                            libraryState.albumIds.delete(albumId);
                            libraryState.albums = libraryState.albums.filter(a => String(a.id) !== albumId);
                            renderAlbumsSS(libraryState.albums);
                            libraryState.needsAlbumsSync = true;
                            addBtn.innerHTML = '<i data-lucide="plus"></i>';
                            if (window.lucide) lucide.createIcons();
                        }
                    } catch (e) { console.error(e); }
                } else {
                    // Add
                    const payload = mapToAlbumDto(data);
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
                            libraryState.needsAlbumsSync = true;
                            addBtn.innerHTML = '<i data-lucide="check"></i>';
                            if (window.lucide) lucide.createIcons();
                        }
                    } catch (e) { console.error(e); }
                }
            });
        }

        const playBtn = header.querySelector('#play-album-start');
        if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const firstTrack = scroll.querySelector('.playable-track');
                if (firstTrack) {
                    handleTrackClick(firstTrack, false, true);
                }
            });
        }

        content.appendChild(header);
        content.appendChild(scroll);
        syncPlayingHighlights();
        if(window.lucide) lucide.createIcons();
    }

    let overlayOpenTime = 0;

    function openOverlay(id) {
        const panel = document.getElementById(id);
        if (!panel) return;
        panel.classList.add('active');
        overlayOpenTime = performance.now();
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
        if (item.picture) return item.picture;
        if (item.album && item.album.image) return item.album.image.large || item.album.image.medium || item.album.image.small || '';
        if (item.album && item.album.picture) return item.album.picture;
        if (item.albums && item.albums.items && item.albums.items.length > 0) {
            const firstAlbum = item.albums.items[0];
            if (firstAlbum.image) return firstAlbum.image.large || firstAlbum.image.medium || firstAlbum.image.small || '';
            if (firstAlbum.picture) return firstAlbum.picture;
        }
        return '';
    }

    function getImgSmall(item) {
        if (!item) return '';
        if (item.image) return item.image.small || item.image.thumbnail || item.image.medium || item.image.large || '';
        if (item.picture) return item.picture;
        if (item.album && item.album.image) return item.album.image.small || item.album.image.thumbnail || item.album.image.medium || item.album.image.large || '';
        if (item.album && item.album.picture) return item.album.picture;
        if (item.albums && item.albums.items && item.albums.items.length > 0) {
            const firstAlbum = item.albums.items[0];
            if (firstAlbum.image) return firstAlbum.image.small || firstAlbum.image.thumbnail || firstAlbum.image.medium || firstAlbum.image.large || '';
            if (firstAlbum.picture) return firstAlbum.picture;
        }
        return '';
    }

    function renderCutMarkers() {
        if (!els.timeBarContainer) return;
        
        // Очищаем старые в любом случае
        els.timeBarContainer.querySelectorAll('.cut-marker-node').forEach(m => m.remove());
        
        // Если плеер еще не загрузил метаданные (readyState < 1) или нет длительности,
        // выходим. Отрисовка произойдет позже по событию 'loadedmetadata'.
        if (!player.duration || isNaN(player.duration) || player.readyState < 1 || !currentTrackId || loadedTrackId !== currentTrackId) return;

        const markers = cutMarkersByTrack.get(String(currentTrackId)) || [];
        markers.forEach(sec => {
            const markerContainer = document.createElement('div');
            markerContainer.className = 'cut-marker-node';
            markerContainer.style.left = `${(sec / player.duration) * 100}%`;
            
            const dot = document.createElement('div');
            dot.className = 'cut-marker-dot';
            
            const tooltip = document.createElement('div');
            tooltip.className = 'cut-marker-tooltip';
            
            const timeLabel = document.createElement('span');
            timeLabel.className = 'cut-marker-time';
            timeLabel.textContent = formatTime(sec);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'cut-marker-delete-btn';
            deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            deleteBtn.title = "Delete marker";
            
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const key = String(currentTrackId);
                const currentMarkers = cutMarkersByTrack.get(key) || [];
                const updated = currentMarkers.filter(m => Math.abs(m - sec) > 0.01);
                cutMarkersByTrack.set(key, updated);
                renderCutMarkers();
                saveCutsToBackend(key);
            });
            
            tooltip.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            
            tooltip.appendChild(timeLabel);
            tooltip.appendChild(deleteBtn);
            
            markerContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof window.openFinetuneDock === 'function') {
                    window.openFinetuneDock(currentTrackId, sec);
                }
            });
            
            const pincerTop = document.createElement('div');
            pincerTop.className = 'cut-marker-pincer pincer-top';
            
            const pincerBottom = document.createElement('div');
            pincerBottom.className = 'cut-marker-pincer pincer-bottom';
            
            markerContainer.appendChild(dot);
            markerContainer.appendChild(pincerTop);
            markerContainer.appendChild(pincerBottom);
            markerContainer.appendChild(tooltip);
            els.timeBarContainer.appendChild(markerContainer);
        });
    }

    let isLooping = false;

    function startLoop() {
        if (isLooping) return;
        isLooping = true;
        requestAnimationFrame(tick);
    }

    function stopLoop() {
        isLooping = false;
    }

    let lastPct = -1;

    function tick() {
        if (!isLooping) return;

        // Pause updates if the player panel is not visible
        if (!els.playerPanel.classList.contains('active')) {
            lastPct = -1; // Reset to force update on open
            if (isLooping) {
                requestAnimationFrame(tick);
            }
            return;
        }

        if (player.duration) {
            if (isIntroAnimating) {
                const elapsed = performance.now() - introAnimationStart;
                const progress = Math.min(1, elapsed / introAnimationDuration);
                const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
                const visualSec = introAnimationTarget * eased;
                const pct = (visualSec / player.duration) * 100;
                
                if (Math.abs(pct - lastPct) > 0.05) {
                    els.timeBarProgress.style.width = `${pct}%`;
                    els.timeCurrent.textContent = formatTime(visualSec);
                    
                    if (isFrequencyMode) {
                        updateWaveformProgress(pct);
                    }
                    lastPct = pct;
                }
                
                if (progress >= 1) {
                    isIntroAnimating = false;
                    if (player.paused) {
                        stopLoop();
                    }
                }
            } else {
                const pct = (player.currentTime / player.duration) * 100;
                
                // Update timebar width on every frame to let CSS transition act as a smooth visual filter
                els.timeBarProgress.style.width = `${pct}%`;
                
                if (isFrequencyMode && Math.abs(pct - lastPct) > 0.05) {
                    updateWaveformProgress();
                    lastPct = pct;
                }
            }
        }
        
        if (isLooping) {
            requestAnimationFrame(tick);
        }
    }

    player.addEventListener('loadedmetadata', () => {
        loadedTrackId = currentTrackId;
        playerState.duration = player.duration;
        els.timeDuration.textContent = formatTime(player.duration);
        renderCutMarkers();
        triggerPlayheadDelay();
        
        // Auto-start from cut point on load with animation
        const markers = cutMarkersByTrack.get(String(currentTrackId));
        if (markers && markers.length >= 1) {
            const markerTime = markers[0];
            player.currentTime = markerTime;
            
            isIntroAnimating = true;
            introAnimationStart = performance.now();
            introAnimationTarget = markerTime;
            startLoop();
        } else {
            isIntroAnimating = false;
        }
    });
    
    player.addEventListener('timeupdate', () => {
        if (!isIntroAnimating && player.duration) {
            els.timeCurrent.textContent = formatTime(player.currentTime);
        }
    });

    player.addEventListener('ended', () => {
        stopLoop();
        playAdjacent('next');
    });

    player.addEventListener('play', () => {
        playerState.isPlaying = true;
        startLoop();
    });

    player.addEventListener('playing', () => {
        startLoop();
    });

    player.addEventListener('pause', () => {
        playerState.isPlaying = false;
        stopLoop();
    });

    player.addEventListener('error', () => {
        stopLoop();
    });

    const qualitySelect = document.getElementById('quality-selector');
    if (qualitySelect) {
        qualitySelect.addEventListener('change', (e) => {
            const formatId = e.target.value;
            qualitySetting = {
                label: e.target.options[e.target.selectedIndex].text,
                formatId: Number(formatId)
            };
        });
    }
    
    // --- PLAYER PANEL SWIPE GESTURE ---
    let playerSwipeStartY = 0;
    let playerSwipeStartTime = 0;
    
    els.playerPanel.addEventListener('touchstart', (e) => {
        if (e.target.closest('#macro-dial, .macro-btn, .action-btn, #quality-selector, #player-timebar-container')) return;
        playerSwipeStartY = e.touches[0].clientY;
        playerSwipeStartTime = Date.now();
    }, { passive: true });

    els.playerPanel.addEventListener('touchend', (e) => {
        if (!playerSwipeStartY) return;
        const deltaY = e.changedTouches[0].clientY - playerSwipeStartY;
        const deltaTime = Date.now() - playerSwipeStartTime;
        
        // Свайп вниз (от середины или ниже)
        const isFromMiddle = playerSwipeStartY > (window.innerHeight * 0.25);
        if (deltaY > 100 && deltaTime < 400 && isFromMiddle) {
            // Закрываем плеер и возвращаемся к последней панели
            const backBtn = document.querySelector(`[data-panel="${lastNonPlayerPanelId}"]`);
            if (backBtn) {
                backBtn.click();
            } else {
                // Фоллбек если кнопка не найдена
                els.playerPanel.classList.remove('active');
                const target = document.getElementById(lastNonPlayerPanelId);
                if (target) target.classList.add('active');
            }
        }
        playerSwipeStartY = 0;
    }, { passive: true });

    if (els.trackDownloadBtn) {
        els.trackDownloadBtn.addEventListener('click', async () => {
            if (!playerState.currentTrack) return;
            const track = playerState.currentTrack;
            
            let cachedTrack = trackCache.get(String(track.id));
            if ((!cachedTrack || !cachedTrack.album) && track.albumId) {
                const originalHTML = els.trackDownloadBtn.innerHTML;
                els.trackDownloadBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> LOADING METADATA...';
                els.trackDownloadBtn.disabled = true;
                try {
                    const albumRes = await fetch(`/data/audio/album?albumId=${track.albumId}`);
                    if (albumRes.ok) {
                        const albumData = await albumRes.json();
                        if (albumData.tracks && albumData.tracks.items) {
                            albumData.tracks.items.forEach(t => {
                                t.album = JSON.parse(JSON.stringify(albumData));
                                delete t.album.tracks;
                                if (!t.artist) t.artist = albumData.artist;
                                trackCache.set(String(t.id), t);
                            });
                        }
                    }
                } catch (e) {
                    console.error("Failed to load album details for download cache", e);
                } finally {
                    els.trackDownloadBtn.disabled = false;
                    els.trackDownloadBtn.innerHTML = originalHTML;
                }
                cachedTrack = trackCache.get(String(track.id));
            }
            
            showDownloadQualityModal(track, cachedTrack, async (selectedFormatId) => {
                const originalHTML = els.trackDownloadBtn.innerHTML;
                els.trackDownloadBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> DOWNLOADING...';
                els.trackDownloadBtn.disabled = true;

                try {
                    // 1. Получаем URL потока с выбранным качеством
                    const resUrl = await fetch(`/data/audio/play?trackId=${track.id}&formatId=${selectedFormatId}`);
                    const data = await resUrl.json();
                    
                    if (!data.url) throw new Error('No stream URL');

                    // 2. Скачиваем сам файл как Blob
                    const fileRes = await fetch(data.url);
                    if (!fileRes.ok) throw new Error(`HTTP error! status: ${fileRes.status}`);
                    const blob = await fileRes.blob();
                    
                    // 3. Конвертируем Blob в Uint8Array для тегирования
                    const fileBytes = new Uint8Array(await blob.arrayBuffer());
                    
                    // 4. Скачиваем обложку
                    let coverBytes = null;
                    let coverMime = "image/jpeg";
                    if (track.cover) {
                        try {
                            const coverRes = await fetch(track.cover);
                            if (coverRes.ok) {
                                coverBytes = await coverRes.arrayBuffer();
                                const contentType = coverRes.headers.get("content-type");
                                if (contentType) {
                                    coverMime = contentType;
                                } else {
                                    coverMime = getMimeType(track.cover);
                                }
                            }
                        } catch (e) {
                            console.error("Failed to fetch cover image", e);
                        }
                    }
                    
                    // 5. Тегируем в зависимости от формата
                    const ext = selectedFormatId === 5 ? 'mp3' : 'flac';
                    let taggedBytes;
                    const dateStr = cachedTrack?.release_date_original || '';
                    let yearStr = '';
                    if (dateStr && dateStr.length >= 4) {
                        yearStr = dateStr.substring(0, 4);
                    }
                    
                    let genreStr = '';
                    const genreObj = cachedTrack?.album?.genre || cachedTrack?.genre;
                    if (genreObj) {
                        if (typeof genreObj === 'string') {
                            genreStr = genreObj;
                        } else if (typeof genreObj === 'object') {
                            genreStr = genreObj.name || '';
                        }
                    }

                    // Настраиваем битность и частоту на основе выбранного формата
                    let bitDepth = 16;
                    let sampleRate = 44100;
                    if (selectedFormatId === 7) {
                        bitDepth = cachedTrack?.maximum_bit_depth || 24;
                        sampleRate = cachedTrack?.maximum_sampling_rate ? (cachedTrack.maximum_sampling_rate > 1000 ? cachedTrack.maximum_sampling_rate : Math.round(cachedTrack.maximum_sampling_rate * 1000)) : 48000;
                    } else if (selectedFormatId === 5) {
                        bitDepth = 16;
                        sampleRate = 44100;
                    }

                    const metadata = {
                        title: track.title || '',
                        artist: track.artist || '',
                        album: track.album || '',
                        date: dateStr,
                        year: yearStr,
                        isrc: cachedTrack?.isrc || '',
                        duration: cachedTrack?.duration || player.duration || playerState.duration || 0,
                        tracknumber: cachedTrack?.track_number || '',
                        bits_per_sample: bitDepth,
                        sample_rate: sampleRate,
                        hires: selectedFormatId === 7 ? "1" : "0",
                        genre: genreStr
                    };
                    
                    if (ext === 'mp3') {
                        taggedBytes = tagMp3File(fileBytes, metadata, coverBytes, coverMime);
                    } else if (ext === 'flac') {
                        taggedBytes = tagFlacFile(fileBytes, metadata, coverBytes, coverMime);
                    } else {
                        taggedBytes = fileBytes;
                    }
                    
                    // 6. Создаем временную ссылку на Blob и кликаем по ней
                    const taggedBlob = new Blob([taggedBytes], { type: ext === 'mp3' ? 'audio/mpeg' : 'audio/flac' });
                    const blobUrl = window.URL.createObjectURL(taggedBlob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = blobUrl;
                    a.download = `${track.artist} - ${track.title}.${ext}`;
                    
                    document.body.appendChild(a);
                    a.click();
                    
                    // Чистим за собой
                    window.URL.revokeObjectURL(blobUrl);
                    document.body.removeChild(a);
                    
                    els.trackDownloadBtn.innerHTML = '<i class="fa-solid fa-check"></i> SAVED';
                } catch (err) {
                    console.error('Download failed', err);
                    els.trackDownloadBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> FAILED';
                } finally {
                    els.trackDownloadBtn.disabled = false;
                    setTimeout(() => {
                        if (els.trackDownloadBtn) els.trackDownloadBtn.innerHTML = originalHTML;
                    }, 3000);
                }
            });
        });
    }

    function updateQualityInfoUI(trackId) {
        if (!els.trackQualityInfo) return;
        
        const track = trackCache.get(String(trackId));
        const formatId = qualitySetting.formatId;

        if (formatId === 5) {
            els.trackQualityInfo.textContent = 'MP3 | 320 kbps';
            return;
        }

        // Для всех видов FLAC (6, 7, 27) берем максимум из того, что может трек,
        // но учитываем ограничения выбранного формата.
        if (track) {
            let bit = track.maximum_bit_depth || 16;
            let rate = track.maximum_sampling_rate || 44.1;
            
            // Если выбран формат 6 (CD), ограничиваем вывод до 16/44.1
            if (formatId === 6) {
                bit = 16;
                rate = 44.1;
            } 
            // Если выбран 7 (Hi-Res 96), ограничиваем частоту до 96, если она выше
            else if (formatId === 7 && rate > 96) {
                rate = 96;
            }

            els.trackQualityInfo.textContent = `FLAC | ${bit}-bit | ${rate} kHz`;
        } else {
            // Если точных метаданных трека нет в кэше, выводим качественные характеристики по умолчанию для выбранного стрима
            if (formatId === 6) {
                els.trackQualityInfo.textContent = 'FLAC | 16-bit | 44.1 kHz';
            } else if (formatId === 7) {
                els.trackQualityInfo.textContent = 'FLAC | 24-bit | 96 kHz';
            } else if (formatId === 27) {
                els.trackQualityInfo.textContent = 'FLAC | 24-bit | 192 kHz';
            } else {
                els.trackQualityInfo.textContent = 'FLAC | Lossless';
            }
        }
    }

    if(window.lucide) window.lucide.createIcons();

    // --- AUDIO TAGGING UTILITIES (FRONTEND-ONLY) ---

    function getMimeType(url) {
        if (!url) return "image/jpeg";
        if (url.endsWith(".png")) return "image/png";
        if (url.endsWith(".gif")) return "image/gif";
        return "image/jpeg";
    }

    function encodeUTF16BE(str) {
        const buf = new Uint8Array(str.length * 2);
        for (let i = 0; i < str.length; i++) {
            const code = str.charCodeAt(i);
            buf[i * 2] = (code >> 8) & 0xFF;
            buf[i * 2 + 1] = code & 0xFF;
        }
        return buf;
    }

    function createFrame(frameId, payload) {
        const frame = new Uint8Array(10 + payload.length);
        const encoder = new TextEncoder();
        frame.set(encoder.encode(frameId), 0);
        
        frame[4] = (payload.length >> 24) & 0xFF;
        frame[5] = (payload.length >> 16) & 0xFF;
        frame[6] = (payload.length >> 8) & 0xFF;
        frame[7] = payload.length & 0xFF;
        
        frame[8] = 0x00;
        frame[9] = 0x00;
        
        frame.set(payload, 10);
        return frame;
    }

    function createApicFrame(coverBytes, mimeType) {
        const encoder = new TextEncoder();
        const mimeBytes = encoder.encode(mimeType || "image/jpeg");
        const descBytes = encoder.encode("Cover");
        
        const payload = new Uint8Array(1 + mimeBytes.length + 1 + 1 + descBytes.length + 1 + coverBytes.byteLength);
        payload[0] = 0x00;
        let offset = 1;
        payload.set(mimeBytes, offset);
        offset += mimeBytes.length;
        payload[offset] = 0x00;
        offset += 1;
        payload[offset] = 0x03;
        offset += 1;
        payload.set(descBytes, offset);
        offset += descBytes.length;
        payload[offset] = 0x00;
        offset += 1;
        payload.set(new Uint8Array(coverBytes), offset);
        
        return payload;
    }

    function createId3Tag(frames) {
        let totalFramesSize = 0;
        for (const frame of frames) {
            totalFramesSize += frame.length;
        }
        
        const tag = new Uint8Array(10 + totalFramesSize);
        tag.set([0x49, 0x44, 0x33, 0x03, 0x00, 0x00], 0);
        
        let size = totalFramesSize;
        tag[6] = (size >> 21) & 0x7F;
        tag[7] = (size >> 14) & 0x7F;
        tag[8] = (size >> 7) & 0x7F;
        tag[9] = size & 0x7F;
        
        let offset = 10;
        for (const frame of frames) {
            tag.set(frame, offset);
            offset += frame.length;
        }
        
        return tag;
    }

    function createTxxxFrame(description, value) {
        const encoder = new TextEncoder();
        const descBytes = encoder.encode(description);
        const valBytes = encoder.encode(value);
        
        const payload = new Uint8Array(1 + descBytes.length + 1 + valBytes.length);
        payload[0] = 0x00; // ISO-8859-1
        payload.set(descBytes, 1);
        payload[1 + descBytes.length] = 0x00; // NULL
        payload.set(valBytes, 1 + descBytes.length + 1);
        
        return createFrame("TXXX", payload);
    }

    function tagMp3File(audioBytes, tags, coverBytes, coverMime) {
        const frames = [];
        
        if (tags.title) {
            const titlePayload = new Uint8Array([0x01, 0xFE, 0xFF, ...encodeUTF16BE(tags.title)]);
            frames.push(createFrame("TIT2", titlePayload));
        }
        if (tags.artist) {
            const artistPayload = new Uint8Array([0x01, 0xFE, 0xFF, ...encodeUTF16BE(tags.artist)]);
            frames.push(createFrame("TPE1", artistPayload));
        }
        if (tags.album) {
            const albumPayload = new Uint8Array([0x01, 0xFE, 0xFF, ...encodeUTF16BE(tags.album)]);
            frames.push(createFrame("TALB", albumPayload));
        }
        if (tags.year) {
            const yearPayload = new Uint8Array([0x01, 0xFE, 0xFF, ...encodeUTF16BE(tags.year)]);
            frames.push(createFrame("TYER", yearPayload));
        }
        if (tags.date) {
            const datePayload = new Uint8Array([0x01, 0xFE, 0xFF, ...encodeUTF16BE(tags.date)]);
            frames.push(createFrame("TDRC", datePayload));
            
            if (tags.date.length >= 10) {
                const dayMonthStr = tags.date.substring(8, 10) + tags.date.substring(5, 7);
                const tdatPayload = new Uint8Array([0x01, 0xFE, 0xFF, ...encodeUTF16BE(dayMonthStr)]);
                frames.push(createFrame("TDAT", tdatPayload));
            }
        }
        if (tags.isrc) {
            const isrcPayload = new Uint8Array([0x01, 0xFE, 0xFF, ...encodeUTF16BE(tags.isrc)]);
            frames.push(createFrame("TSRC", isrcPayload));
        }
        if (tags.genre) {
            const genrePayload = new Uint8Array([0x01, 0xFE, 0xFF, ...encodeUTF16BE(tags.genre)]);
            frames.push(createFrame("TCON", genrePayload));
        }
        if (tags.duration) {
            const msStr = String(Math.round(tags.duration * 1000));
            const durationPayload = new Uint8Array([0x01, 0xFE, 0xFF, ...encodeUTF16BE(msStr)]);
            frames.push(createFrame("TLEN", durationPayload));
        }
        if (tags.tracknumber) {
            const trackPayload = new Uint8Array([0x01, 0xFE, 0xFF, ...encodeUTF16BE(String(tags.tracknumber))]);
            frames.push(createFrame("TRCK", trackPayload));
        }
        if (tags.bits_per_sample) {
            frames.push(createTxxxFrame("BITSPERSAMPLE", String(tags.bits_per_sample)));
        }
        if (tags.sample_rate) {
            frames.push(createTxxxFrame("SAMPLERATE", String(tags.sample_rate)));
        }
        if (tags.hires !== undefined) {
            frames.push(createTxxxFrame("HIRES", String(tags.hires)));
        }
        if (coverBytes && coverBytes.byteLength > 0) {
            const apicPayload = createApicFrame(coverBytes, coverMime);
            frames.push(createFrame("APIC", apicPayload));
        }
        
        const id3Tag = createId3Tag(frames);
        
        let startOffset = 0;
        if (audioBytes.length > 10 && audioBytes[0] === 0x49 && audioBytes[1] === 0x44 && audioBytes[2] === 0x33) {
            const s1 = audioBytes[6] & 0x7F;
            const s2 = audioBytes[7] & 0x7F;
            const s3 = audioBytes[8] & 0x7F;
            const s4 = audioBytes[9] & 0x7F;
            const existingSize = (s1 << 21) | (s2 << 14) | (s3 << 7) | s4;
            startOffset = 10 + existingSize;
        }
        
        const mp3Frames = audioBytes.slice(startOffset);
        
        const result = new Uint8Array(id3Tag.length + mp3Frames.length);
        result.set(id3Tag, 0);
        result.set(mp3Frames, id3Tag.length);
        
        return result;
    }

    function createVorbisCommentBlock(tags) {
        const encoder = new TextEncoder();
        const vendorBytes = encoder.encode("reference libFLAC 1.3.2 20170101");
        
        const commentStrings = [];
        for (const [key, value] of Object.entries(tags)) {
            if (value !== undefined && value !== null && value !== "") {
                commentStrings.push(`${key.toUpperCase()}=${value}`);
            }
        }
        
        let size = 4 + vendorBytes.length + 4;
        const encodedComments = commentStrings.map(str => encoder.encode(str));
        for (const bytes of encodedComments) {
            size += 4 + bytes.length;
        }
        
        const payload = new Uint8Array(size);
        const view = new DataView(payload.buffer);
        
        let offset = 0;
        view.setUint32(offset, vendorBytes.length, true);
        offset += 4;
        payload.set(vendorBytes, offset);
        offset += vendorBytes.length;
        
        view.setUint32(offset, encodedComments.length, true);
        offset += 4;
        
        for (const bytes of encodedComments) {
            view.setUint32(offset, bytes.length, true);
            offset += 4;
            payload.set(bytes, offset);
            offset += bytes.length;
        }
        
        return payload;
    }

    function createPictureBlock(imageBytes, mimeType) {
        const encoder = new TextEncoder();
        const mimeBytes = encoder.encode(mimeType || "image/jpeg");
        const descBytes = encoder.encode("Cover");
        
        const size = 4 + 4 + mimeBytes.length + 4 + descBytes.length + 4 + 4 + 4 + 4 + 4 + imageBytes.byteLength;
        const payload = new Uint8Array(size);
        const view = new DataView(payload.buffer);
        
        let offset = 0;
        view.setUint32(offset, 3, false);
        offset += 4;
        
        view.setUint32(offset, mimeBytes.length, false);
        offset += 4;
        payload.set(mimeBytes, offset);
        offset += mimeBytes.length;
        
        view.setUint32(offset, descBytes.length, false);
        offset += 4;
        payload.set(descBytes, offset);
        offset += descBytes.length;
        
        view.setUint32(offset, 0, false);
        offset += 4;
        view.setUint32(offset, 0, false);
        offset += 4;
        view.setUint32(offset, 0, false);
        offset += 4;
        view.setUint32(offset, 0, false);
        offset += 4;
        
        view.setUint32(offset, imageBytes.byteLength, false);
        offset += 4;
        payload.set(new Uint8Array(imageBytes), offset);
        
        return payload;
    }

    function tagFlacFile(audioBytes, tags, coverBytes, coverMime) {
        let offset = 4;
        let blocks = [];
        let isLast = false;
        
        while (!isLast) {
            if (offset + 4 > audioBytes.length) break;
            const headerByte = audioBytes[offset];
            isLast = (headerByte & 0x80) !== 0;
            const blockType = headerByte & 0x7F;
            const blockLength = (audioBytes[offset + 1] << 16) | (audioBytes[offset + 2] << 8) | audioBytes[offset + 3];
            
            if (offset + 4 + blockLength > audioBytes.length) break;
            
            const blockData = audioBytes.slice(offset + 4, offset + 4 + blockLength);
            
            if (blockType !== 4 && blockType !== 6) {
                blocks.push({
                    type: blockType,
                    data: blockData
                });
            }
            
            offset += 4 + blockLength;
        }
        
        const audioFrames = audioBytes.slice(offset);
        
        const commentPayload = createVorbisCommentBlock(tags);
        blocks.push({
            type: 4,
            data: commentPayload
        });
        
        if (coverBytes && coverBytes.byteLength > 0) {
            const picturePayload = createPictureBlock(coverBytes, coverMime);
            blocks.push({
                type: 6,
                data: picturePayload
            });
        }
        
        let totalSize = 4;
        for (const block of blocks) {
            totalSize += 4 + block.data.length;
        }
        totalSize += audioFrames.length;
        
        const result = new Uint8Array(totalSize);
        result.set([0x66, 0x4C, 0x61, 0x43], 0);
        
        let writeOffset = 4;
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const isLastBlock = (i === blocks.length - 1);
            
            const headerByte = (isLastBlock ? 0x80 : 0x00) | (block.type & 0x7F);
            result[writeOffset] = headerByte;
            result[writeOffset + 1] = (block.data.length >> 16) & 0xFF;
            result[writeOffset + 2] = (block.data.length >> 8) & 0xFF;
            result[writeOffset + 3] = block.data.length & 0xFF;
            writeOffset += 4;
            
            result.set(block.data, writeOffset);
            writeOffset += block.data.length;
        }
        
        result.set(audioFrames, writeOffset);
        
        return result;
    }

    function showDownloadQualityModal(track, cachedTrack, onSelect) {
        const isHiRes = cachedTrack?.hires === true || (cachedTrack?.maximum_bit_depth && cachedTrack.maximum_bit_depth > 16);
        
        const overlay = document.createElement('div');
        overlay.id = 'download-modal-overlay';
        overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm transition-opacity duration-300 opacity-0';
        
        const bitDepth = cachedTrack?.maximum_bit_depth || 24;
        let rawSampleRate = cachedTrack?.maximum_sampling_rate || 48.0;
        if (rawSampleRate > 1000) {
            rawSampleRate = Math.round(rawSampleRate / 100) / 10;
        }
        const sampleRate = rawSampleRate;
        const maxQualityLabel = isHiRes ? `Hi-Res (${bitDepth}-bit / ${sampleRate} kHz)` : `CD (16-bit / 44.1 kHz)`;
        
        overlay.innerHTML = `
            <div class="bg-[#121212] border border-emerald-500/20 rounded-2xl p-6 w-[90%] max-w-sm shadow-[0_0_40px_rgba(16,185,129,0.15)] transform scale-95 transition-all duration-300 text-neutral-200 font-sans">
                <h3 class="text-white text-base font-semibold mb-1">Select Download Quality</h3>
                <p class="text-neutral-500 text-xs mb-4">Maximum: <span class="text-emerald-400 font-medium">${maxQualityLabel}</span></p>
                
                <div class="flex flex-col gap-2.5">
                    ${isHiRes ? `
                    <button class="quality-opt-btn flex items-center justify-between p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/40 text-left transition-all" data-format-id="7">
                        <div>
                            <div class="text-white font-medium text-sm">FLAC | Hi-Res</div>
                            <div class="text-neutral-400 text-xs">${bitDepth}-bit | ${sampleRate} kHz</div>
                        </div>
                        <span class="text-[9px] bg-emerald-500 text-neutral-950 font-bold px-1.5 py-0.5 rounded tracking-wide">HI-RES</span>
                    </button>
                    ` : ''}
                    
                    <button class="quality-opt-btn flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-850 hover:border-neutral-700 text-left transition-all" data-format-id="6">
                        <div>
                            <div class="text-white font-medium text-sm">FLAC | CD Quality</div>
                            <div class="text-neutral-400 text-xs">16-bit | 44.1 kHz</div>
                        </div>
                    </button>
                    
                    <button class="quality-opt-btn flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-850 hover:border-neutral-700 text-left transition-all" data-format-id="5">
                        <div>
                            <div class="text-white font-medium text-sm">MP3 | High Quality</div>
                            <div class="text-neutral-400 text-xs">320 kbps</div>
                        </div>
                    </button>
                </div>
                
                <button id="close-download-modal" class="mt-4 w-full py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800/80 text-neutral-400 text-xs font-semibold transition-all">Cancel</button>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        requestAnimationFrame(() => {
            overlay.classList.remove('opacity-0');
            overlay.querySelector('div').classList.remove('scale-95');
        });
        
        const closeModal = () => {
            overlay.classList.add('opacity-0');
            overlay.querySelector('div').classList.add('scale-95');
            setTimeout(() => {
                overlay.remove();
            }, 300);
        };
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
        
        overlay.querySelector('#close-download-modal').addEventListener('click', closeModal);
        
        overlay.querySelectorAll('.quality-opt-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const formatId = Number(btn.dataset.formatId);
                closeModal();
                onSelect(formatId);
            });
        });
    }

    // --- YOUTUBE IMPORT LOGIC ---
    let tokenClient;
    
    function initGoogleAuth() {
        if (window.google && google.accounts && google.accounts.oauth2) {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: '791416519915-0cct0jrd857c0jkrkdt1c553uqm0np05.apps.googleusercontent.com',
                scope: 'https://www.googleapis.com/auth/youtube.readonly',
                callback: async (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        handleYoutubeImport(tokenResponse.access_token);
                    }
                }
            });
        } else {
            setTimeout(initGoogleAuth, 100);
        }
    }
    
    initGoogleAuth();

    if (els.importYoutubeBtn) {
        els.importYoutubeBtn.addEventListener('click', () => {
            if (tokenClient) {
                els.youtubeImportStatus.textContent = "Requesting access...";
                tokenClient.requestAccessToken();
            } else {
                els.youtubeImportStatus.textContent = "Google API not loaded yet.";
            }
        });
    }

    async function handleYoutubeImport(accessToken) {
        try {
            els.youtubeImportStatus.textContent = "Fetching playlists...";
            
            let availablePlaylists = [];
            
            // 1. Fetch system playlists (like "Liked Videos")
            try {
                const channelRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const channelData = await channelRes.json();
                if (channelData.items && channelData.items.length > 0) {
                    const likesId = channelData.items[0].contentDetails?.relatedPlaylists?.likes;
                    if (likesId) {
                        availablePlaylists.push({ id: likesId, title: "❤️ Liked Music / Videos" });
                    }
                }
            } catch (e) {
                console.warn("Could not fetch channel details", e);
            }

            // 2. Fetch user-created playlists
            const plRes = await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const plData = await plRes.json();
            
            if (plData.items) {
                plData.items.forEach(p => {
                    availablePlaylists.push({ id: p.id, title: p.snippet.title });
                });
            }

            if (availablePlaylists.length === 0) {
                const urlOrId = window.prompt("No playlists found. Enter ID manually:");
                if (urlOrId) {
                    startPlaylistImport(urlOrId, "Manual Import", accessToken);
                }
                return;
            }

            showYoutubePlaylistPicker(availablePlaylists, accessToken);

        } catch (err) {
            console.error("YouTube import error:", err);
            els.youtubeImportStatus.textContent = "Error fetching playlists.";
        }
    }

    function showYoutubePlaylistPicker(playlists, accessToken) {
        const modal = document.getElementById('youtube-playlist-modal');
        const container = document.getElementById('youtube-playlists-container');
        const closeBtn = document.getElementById('close-youtube-modal');
        
        container.innerHTML = '';
        playlists.forEach(pl => {
            const item = document.createElement('div');
            item.className = 'yt-playlist-item';
            item.innerHTML = `<span class="yt-playlist-title">${pl.title}</span>`;
            item.onclick = () => {
                modal.classList.add('hidden');
                startPlaylistImport(pl.id, pl.title, accessToken);
            };
            container.appendChild(item);
        });

        modal.classList.remove('hidden');
        closeBtn.onclick = () => modal.classList.add('hidden');
    }

    async function startPlaylistImport(playlistId, playlistTitle, accessToken) {
        const overlay = document.getElementById('import-loading-overlay');
        const subtext = document.getElementById('import-loading-subtext');
        
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
        subtext.textContent = "Fetching tracks from YouTube...";

        try {
            let allItems = [];
            let nextPageToken = "";
            
            do {
                const itemsRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const itemsData = await itemsRes.json();
                if (itemsData.items) {
                    allItems = allItems.concat(itemsData.items);
                }
                nextPageToken = itemsData.nextPageToken;
            } while (nextPageToken);

            subtext.textContent = `Matching ${allItems.length} tracks with Qobuz...`;
            
            const normalizedTracks = allItems.map(item => {
                const rawTitle = item.snippet.title;
                const channelTitle = item.snippet.videoOwnerChannelTitle || "";
                let title = rawTitle.replace(/\((Official|Lyric|Music)?\s*(Video|Audio)\)/gi, '').trim();
                title = title.replace(/\[(Official|Lyric|Music)?\s*(Video|Audio)\]/gi, '').trim();
                let artist = "";
                if (title.includes(' - ')) {
                    const parts = title.split(' - ');
                    artist = parts[0].trim();
                    title = parts.slice(1).join(' - ').trim();
                } else {
                    artist = channelTitle.replace(/(- Topic|VEVO)$/i, '').trim();
                }
                return { artist, title };
            }).filter(t => t.title && t.title !== 'Deleted video' && t.title !== 'Private video');

            const importRes = await fetch('/library/import/youtube/playlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playlistTitle: playlistTitle.replace('❤️ ', ''),
                    tracks: normalizedTracks
                })
            });

            if (importRes.ok) {
                const result = await importRes.json();
                alert(`Import complete! Created playlist "${playlistTitle}" with ${result.found} tracks.`);
            } else {
                alert("Server error during playlist import.");
            }

        } catch (err) {
            console.error("Import failed:", err);
            alert("An error occurred during import.");
        } finally {
            overlay.classList.add('hidden');
            overlay.style.display = 'none';
            // Refresh library
            libraryState.needsPlaylistsSync = true;
            if (libraryState.lastTab === 'playlists') {
                fetchPlaylistsSS();
            }
        }
    }

    // Register WebMCP tools on document.modelContext if supported by the browser runtime
    if (typeof document.modelContext !== 'undefined') {
        document.modelContext.play_track = async (args) => {
            if (args && args.trackId) {
                const trackData = {
                    trackId: String(args.trackId),
                    title: args.title || 'Unknown Title',
                    artist: args.artist || 'Unknown Artist',
                    album: args.album || 'Unknown Album',
                    cover: args.cover || '',
                    artistId: args.artistId || '',
                    albumId: args.albumId || ''
                };
                await handleTrackClick(trackData, false, true);
                return { success: true, message: `Playing track ${args.trackId}` };
            }
            return { success: false, error: 'Missing trackId' };
        };

        document.modelContext.get_player_state = () => {
            return {
                isPlaying: playerState.isPlaying,
                currentTime: playerState.currentTime,
                duration: playerState.duration,
                currentTrack: playerState.currentTrack
            };
        };

        document.modelContext.toggle_play = () => {
            if (playerState.currentTrack) {
                player.paused ? player.play() : player.pause();
                return { success: true, isPlaying: playerState.isPlaying };
            }
            return { success: false, error: 'No track loaded' };
        };

        document.modelContext.next_track = () => {
            isManualSwitch = true;
            playAdjacent('next');
            return { success: true };
        };

        document.modelContext.previous_track = () => {
            isManualSwitch = true;
            playAdjacent('prev');
            return { success: true };
        };
    }
});
