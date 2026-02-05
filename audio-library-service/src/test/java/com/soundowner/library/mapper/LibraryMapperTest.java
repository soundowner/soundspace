package com.soundowner.library.mapper;

import com.soundowner.library.dto.AlbumDto;
import com.soundowner.library.dto.ArtistDto;
import com.soundowner.library.dto.TrackDto;
import com.soundowner.library.entity.Album;
import com.soundowner.library.entity.Artist;
import com.soundowner.library.entity.Track;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

class LibraryMapperTest {

    private final LibraryMapper mapper = Mappers.getMapper(LibraryMapper.class);

    @Test
    void toArtist_ShouldMapNestedFields() {
        ArtistDto dto = new ArtistDto();
        dto.setId(1L);
        dto.setName("Test Artist");
        
        ArtistDto.Image img = new ArtistDto.Image();
        img.setLarge("http://image.url");
        dto.setImage(img);
        
        ArtistDto.Biography bio = new ArtistDto.Biography();
        bio.setContent("Bio content");
        dto.setBiography(bio);

        Artist entity = mapper.toArtist(dto);

        assertEquals(1L, entity.getId());
        assertEquals("Test Artist", entity.getName());
        assertEquals("http://image.url", entity.getImageUrl()); // Flattened
        assertEquals("Bio content", entity.getBiography()); // Flattened
    }

    @Test
    void toAlbum_ShouldMapDateAndImages() {
        AlbumDto dto = new AlbumDto();
        dto.setId("alb1");
        dto.setReleaseDateOriginal("2023-01-01");
        
        ArtistDto.Image img = new ArtistDto.Image();
        img.setSmall("small.jpg");
        img.setMedium("medium.jpg");
        img.setLarge("large.jpg");
        dto.setImage(img);

        Album entity = mapper.toAlbum(dto);

        assertEquals("alb1", entity.getId());
        assertEquals(LocalDate.of(2023, 1, 1), entity.getReleaseDateOriginal());
        assertEquals("small.jpg", entity.getImageSmall());
        assertEquals("medium.jpg", entity.getImageThumbnail());
        assertEquals("large.jpg", entity.getImageLarge());
    }

    @Test
    void toTrack_ShouldMapNestedAlbum() {
        TrackDto dto = new TrackDto();
        dto.setId(100L);
        dto.setTitle("Track 1");
        
        AlbumDto albDto = new AlbumDto();
        albDto.setId("alb1");
        dto.setAlbum(albDto);

        Track entity = mapper.toTrack(dto);

        assertEquals(100L, entity.getId());
        assertEquals("Track 1", entity.getTitle());
        assertNotNull(entity.getAlbum());
        assertEquals("alb1", entity.getAlbum().getId());
    }
}
