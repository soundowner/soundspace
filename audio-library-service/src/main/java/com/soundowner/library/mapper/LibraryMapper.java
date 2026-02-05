package com.soundowner.library.mapper;

import com.soundowner.library.dto.AlbumDto;
import com.soundowner.library.dto.ArtistDto;
import com.soundowner.library.dto.TrackDto;
import com.soundowner.library.entity.Album;
import com.soundowner.library.entity.Artist;
import com.soundowner.library.entity.Track;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

@Mapper(componentModel = "spring")
public interface LibraryMapper {

    // --- Artist Mappings ---
    @Mapping(target = "imageUrl", source = "image.large") // Берем большую картинку как основную
    @Mapping(target = "biography", source = "biography.content")
    Artist toArtist(ArtistDto dto);

    // --- Album Mappings ---
    @Mapping(target = "imageSmall", source = "image.small")
    @Mapping(target = "imageThumbnail", source = "image.medium") // или thumbnail, если есть в DTO
    @Mapping(target = "imageLarge", source = "image.large")
    @Mapping(target = "releaseDateOriginal", source = "releaseDateOriginal", qualifiedByName = "parseDate")
    @Mapping(target = "artist", source = "artist") // MapStruct сам найдет метод toArtist
    Album toAlbum(AlbumDto dto);

    // --- Track Mappings ---
    @Mapping(target = "album", source = "album") // Использует метод toAlbum
    @Mapping(target = "releaseDateOriginal", source = "releaseDateOriginal", qualifiedByName = "parseDate")
    Track toTrack(TrackDto dto);

    // --- Helpers ---
    @Named("parseDate")
    default LocalDate parseDate(String date) {
        if (date == null || date.isEmpty()) {
            return null;
        }
        try {
            // Qobuz обычно отдает YYYY-MM-DD
            return LocalDate.parse(date, DateTimeFormatter.ISO_DATE);
        } catch (Exception e) {
            return null; // Если формат кривой, не падаем, просто null
        }
    }
}
