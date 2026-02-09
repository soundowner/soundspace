package com.soundowner.library.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.soundowner.library.dto.AlbumDto;
import com.soundowner.library.dto.TrackDto;
import com.soundowner.library.entity.Album;
import com.soundowner.library.entity.Track;
import com.soundowner.library.mapper.LibraryMapper;
import com.soundowner.library.service.LibraryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(LibraryController.class)
class LibraryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private LibraryService libraryService;

    @MockBean
    private LibraryMapper libraryMapper;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void addAlbumToLibrary_ShouldReturnOk() throws Exception {
        UUID userId = UUID.randomUUID();
        AlbumDto dto = new AlbumDto();
        dto.setId("alb1");

        when(libraryMapper.toAlbum(any(AlbumDto.class))).thenReturn(new Album());

        mockMvc.perform(post("/library/albums")
                .header("X-User-Id", userId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isOk());

        verify(libraryService).addAlbumToLibrary(eq(userId), any(), any());
    }

    @Test
    void addTrackToPlaylist_ShouldReturnOk() throws Exception {
        UUID playlistId = UUID.randomUUID();
        TrackDto dto = new TrackDto();
        dto.setId(100L);

        when(libraryMapper.toTrack(any(TrackDto.class))).thenReturn(new Track());

        mockMvc.perform(post("/library/playlists/{id}/tracks", playlistId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isOk());

        verify(libraryService).addTrackToPlaylist(eq(playlistId), any());
    }
}