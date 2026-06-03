CREATE TABLE user_tracks (
    user_id UUID NOT NULL,
    track_id BIGINT REFERENCES tracks(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (user_id, track_id)
);

CREATE INDEX idx_user_tracks_user_id ON user_tracks(user_id);
