# Issue: feat: Liked Tracks database storage and sync

### Backend tasks (`audio-library-service`):
- [ ] Create Flyway migration `V2__add_user_tracks_table.sql` for `user_tracks` link table.
- [ ] Create `UserTrack` entity, `UserTrackId` key, and `UserTrackRepository`.
- [ ] Implement service methods in `LibraryService` (`addTrackToLibrary`, `removeTrackFromLibrary`, `getUserTracks`, `getUserTrackIds`).
- [ ] Create REST endpoints in `LibraryController`:
  - `GET /library/tracks/ids` (to sync heart icons)
  - `GET /library/tracks` (to fetch full list)
  - `POST /library/tracks` (add track DTO)
  - `DELETE /library/tracks/{trackId}` (remove track)

### Frontend tasks (`qobuz-data-gateway` static):
- [ ] Update `syncLibraryIds()` to call `GET /library/tracks/ids` and populate `libraryState.likedTrackIds`.
- [ ] Update `toggleLikeTrack()` to send `POST /library/tracks` and `DELETE /library/tracks/{trackId}` API requests instead of local-only storage.
- [ ] Implement `fetchLikedTracksSS()` to pull `GET /library/tracks` on tab activation and sync with cache.
