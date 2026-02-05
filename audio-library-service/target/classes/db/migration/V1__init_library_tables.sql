-- 1. Catalog Tables (Qobuz Metadata Cache)
CREATE TABLE artists (
    id BIGINT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    image_url VARCHAR(500),
    albums_count INTEGER,
    biography TEXT,
    similar_artist_ids BIGINT[]
);

CREATE TABLE albums (
    id VARCHAR(50) PRIMARY KEY,
    artist_id BIGINT REFERENCES artists(id),
    genre_id INTEGER,
    title VARCHAR(500) NOT NULL,
    version VARCHAR(255),
    subtitle VARCHAR(255),
    qobuz_id INTEGER,
    upc VARCHAR(50),
    url VARCHAR(500),
    is_official BOOLEAN DEFAULT TRUE,
    tracks_count INTEGER,
    duration INTEGER,
    maximum_bit_depth INTEGER,
    maximum_sampling_rate FLOAT,
    maximum_technical_specifications VARCHAR(255),
    hires BOOLEAN DEFAULT FALSE,
    release_date_original DATE,
    release_type VARCHAR(50),
    popularity INTEGER,
    description TEXT,
    image_small VARCHAR(500),
    image_thumbnail VARCHAR(500),
    image_large VARCHAR(500)
);

CREATE TABLE tracks (
    id BIGINT PRIMARY KEY,
    album_id VARCHAR(50) REFERENCES albums(id),
    artist_id BIGINT REFERENCES artists(id),
    title VARCHAR(500) NOT NULL,
    version VARCHAR(255),
    isrc VARCHAR(50),
    duration INTEGER,
    track_number INTEGER,
    performers TEXT,
    parental_warning BOOLEAN DEFAULT FALSE,
    hires BOOLEAN DEFAULT FALSE,
    maximum_bit_depth INTEGER,
    maximum_sampling_rate FLOAT,
    maximum_technical_specifications VARCHAR(255),
    release_date_original DATE,
    replaygain_track_peak FLOAT,
    replaygain_track_gain FLOAT
);

-- 2. User Library & Playlists
CREATE TABLE playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- Logical link to auth-server users
    title VARCHAR(255) NOT NULL,
    description TEXT,
    cover_image VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE playlist_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
    track_id BIGINT REFERENCES tracks(id),
    position INTEGER NOT NULL,
    UNIQUE(playlist_id, position)
);

CREATE TABLE user_albums (
    user_id UUID NOT NULL,
    album_id VARCHAR(50) REFERENCES albums(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (user_id, album_id)
);

CREATE TABLE user_artists (
    user_id UUID NOT NULL,
    artist_id BIGINT REFERENCES artists(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (user_id, artist_id)
);

-- 3. Indexes for performance
CREATE INDEX idx_albums_artist_id ON albums(artist_id);
CREATE INDEX idx_tracks_album_id ON tracks(album_id);
CREATE INDEX idx_tracks_artist_id ON tracks(artist_id);
CREATE INDEX idx_playlists_user_id ON playlists(user_id);
CREATE INDEX idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id);
CREATE INDEX idx_user_albums_user_id ON user_albums(user_id);
CREATE INDEX idx_user_artists_user_id ON user_artists(user_id);
