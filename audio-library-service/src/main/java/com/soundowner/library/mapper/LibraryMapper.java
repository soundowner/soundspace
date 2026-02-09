package com.soundowner.library.mapper;

import com.soundowner.library.dto.AlbumDto;
import com.soundowner.library.dto.ArtistDto;
import com.soundowner.library.dto.PlaylistDto;
import com.soundowner.library.dto.TrackDto;
import com.soundowner.library.entity.Album;
import com.soundowner.library.entity.Artist;
import com.soundowner.library.entity.Track;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Mapper(componentModel = "spring")
public interface LibraryMapper {

    // --- Entity -> DTO ---
    
    @Mapping(target = "image", expression = "java(mapImage(entity.getImageSmall(), entity.getImageThumbnail(), entity.getImageLarge()))")
    @Mapping(target = "artist", source = "artist") // Uses toArtistDto
    @Mapping(target = "releaseDateOriginal", source = "releaseDateOriginal", qualifiedByName = "formatDate")
    @Mapping(target = "tracks", ignore = true) // TracksWrapper handled separately if needed
    AlbumDto toAlbumDto(Album entity);

    @Mapping(target = "image", expression = "java(mapImage(null, null, entity.getImageUrl()))")
    @Mapping(target = "biography", expression = "java(mapBiography(entity.getBiography()))")
    ArtistDto toArtistDto(Artist entity);

    @Mapping(target = "releaseDateOriginal", source = "releaseDateOriginal", qualifiedByName = "formatDate")
    @Mapping(target = "album", source = "album") 
    TrackDto toTrack(Track entity);

    PlaylistDto toPlaylistDto(com.soundowner.library.entity.Playlist entity);
    List<PlaylistDto> toPlaylistDtoList(List<com.soundowner.library.entity.Playlist> entities);


    // --- DTO -> Entity ---

    @Mapping(target = "imageUrl", source = "image.large")
    @Mapping(target = "biography", source = "biography.content")
    Artist toArtist(ArtistDto dto);

    @Mapping(target = "imageSmall", source = "image.small")
    @Mapping(target = "imageThumbnail", source = "image.medium")
    @Mapping(target = "imageLarge", source = "image.large")
    @Mapping(target = "releaseDateOriginal", source = "releaseDateOriginal", qualifiedByName = "parseDate")
    @Mapping(target = "artist", source = "artist")
    Album toAlbum(AlbumDto dto);

    @Mapping(target = "album", source = "album")
    @Mapping(target = "releaseDateOriginal", source = "releaseDateOriginal", qualifiedByName = "parseDate")
    Track toTrack(TrackDto dto);


    // --- Helpers ---

    @Named("parseDate")
    default LocalDate parseDate(String date) {
        if (date == null || date.isEmpty()) return null;
        try { return LocalDate.parse(date, DateTimeFormatter.ISO_DATE); } catch (Exception e) { return null; }
    }

    @Named("formatDate")
    default String formatDate(LocalDate date) {
        return date != null ? date.format(DateTimeFormatter.ISO_DATE) : null;
    }

    default ArtistDto.Image mapImage(String small, String medium, String large) {
        if (small == null && medium == null && large == null) return null;
        ArtistDto.Image img = new ArtistDto.Image();
        img.setSmall(small);
        img.setMedium(medium);
        img.setLarge(large);
        return img;
    }

    default ArtistDto.Biography mapBiography(String content) {
        if (content == null) return null;
        ArtistDto.Biography bio = new ArtistDto.Biography();
        bio.setContent(content);
        return bio;
    }
}
