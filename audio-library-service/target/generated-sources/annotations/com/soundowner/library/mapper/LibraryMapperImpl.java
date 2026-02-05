package com.soundowner.library.mapper;

import com.soundowner.library.dto.AlbumDto;
import com.soundowner.library.dto.ArtistDto;
import com.soundowner.library.dto.TrackDto;
import com.soundowner.library.entity.Album;
import com.soundowner.library.entity.Artist;
import com.soundowner.library.entity.Track;
import java.util.ArrayList;
import java.util.List;
import javax.annotation.processing.Generated;
import org.springframework.stereotype.Component;

@Generated(
    value = "org.mapstruct.ap.MappingProcessor",
    date = "2026-02-05T08:20:14+0300",
    comments = "version: 1.6.3, compiler: javac, environment: Java 17.0.17 (Microsoft)"
)
@Component
public class LibraryMapperImpl implements LibraryMapper {

    @Override
    public Artist toArtist(ArtistDto dto) {
        if ( dto == null ) {
            return null;
        }

        Artist.ArtistBuilder artist = Artist.builder();

        artist.imageUrl( dtoImageLarge( dto ) );
        artist.biography( dtoBiographyContent( dto ) );
        artist.id( dto.getId() );
        artist.name( dto.getName() );
        artist.albumsCount( dto.getAlbumsCount() );
        List<Long> list = dto.getSimilarArtistIds();
        if ( list != null ) {
            artist.similarArtistIds( new ArrayList<Long>( list ) );
        }

        return artist.build();
    }

    @Override
    public Album toAlbum(AlbumDto dto) {
        if ( dto == null ) {
            return null;
        }

        Album.AlbumBuilder album = Album.builder();

        album.imageSmall( dtoImageSmall( dto ) );
        album.imageThumbnail( dtoImageMedium( dto ) );
        album.imageLarge( dtoImageLarge1( dto ) );
        album.releaseDateOriginal( parseDate( dto.getReleaseDateOriginal() ) );
        album.artist( toArtist( dto.getArtist() ) );
        album.id( dto.getId() );
        album.genreId( dto.getGenreId() );
        album.title( dto.getTitle() );
        album.version( dto.getVersion() );
        album.subtitle( dto.getSubtitle() );
        album.qobuzId( dto.getQobuzId() );
        album.upc( dto.getUpc() );
        album.url( dto.getUrl() );
        album.isOfficial( dto.getIsOfficial() );
        album.tracksCount( dto.getTracksCount() );
        album.duration( dto.getDuration() );
        album.maximumBitDepth( dto.getMaximumBitDepth() );
        album.maximumSamplingRate( dto.getMaximumSamplingRate() );
        album.maximumTechnicalSpecifications( dto.getMaximumTechnicalSpecifications() );
        album.hires( dto.getHires() );
        album.releaseType( dto.getReleaseType() );
        album.popularity( dto.getPopularity() );
        album.description( dto.getDescription() );

        return album.build();
    }

    @Override
    public Track toTrack(TrackDto dto) {
        if ( dto == null ) {
            return null;
        }

        Track.TrackBuilder track = Track.builder();

        track.album( toAlbum( dto.getAlbum() ) );
        track.releaseDateOriginal( parseDate( dto.getReleaseDateOriginal() ) );
        track.id( dto.getId() );
        track.title( dto.getTitle() );
        track.version( dto.getVersion() );
        track.isrc( dto.getIsrc() );
        track.duration( dto.getDuration() );
        track.trackNumber( dto.getTrackNumber() );
        track.performers( dto.getPerformers() );
        track.parentalWarning( dto.getParentalWarning() );
        track.hires( dto.getHires() );
        track.maximumBitDepth( dto.getMaximumBitDepth() );
        track.maximumSamplingRate( dto.getMaximumSamplingRate() );
        track.maximumTechnicalSpecifications( dto.getMaximumTechnicalSpecifications() );

        return track.build();
    }

    private String dtoImageLarge(ArtistDto artistDto) {
        ArtistDto.Image image = artistDto.getImage();
        if ( image == null ) {
            return null;
        }
        return image.getLarge();
    }

    private String dtoBiographyContent(ArtistDto artistDto) {
        ArtistDto.Biography biography = artistDto.getBiography();
        if ( biography == null ) {
            return null;
        }
        return biography.getContent();
    }

    private String dtoImageSmall(AlbumDto albumDto) {
        ArtistDto.Image image = albumDto.getImage();
        if ( image == null ) {
            return null;
        }
        return image.getSmall();
    }

    private String dtoImageMedium(AlbumDto albumDto) {
        ArtistDto.Image image = albumDto.getImage();
        if ( image == null ) {
            return null;
        }
        return image.getMedium();
    }

    private String dtoImageLarge1(AlbumDto albumDto) {
        ArtistDto.Image image = albumDto.getImage();
        if ( image == null ) {
            return null;
        }
        return image.getLarge();
    }
}
