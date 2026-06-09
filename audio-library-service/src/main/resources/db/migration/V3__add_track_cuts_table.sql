CREATE TABLE track_cuts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    track_id VARCHAR(255) NOT NULL,
    start_time NUMERIC(8, 3) NOT NULL,
    end_time NUMERIC(8, 3) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_cut_range CHECK (end_time > start_time)
);

CREATE INDEX idx_track_cuts_user_track ON track_cuts(user_id, track_id);
