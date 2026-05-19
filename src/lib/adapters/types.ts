export interface ScannedTrack {
  title: string;
  artist: string;
  album: string;
  albumArtist?: string;
  genre?: string;
  year?: number;
  trackNumber?: number;
  discNumber?: number;
  duration: number;
  filePath: string;
  fileSize: number;
  format: string;
  bitrate?: number;
  sampleRate?: number;
  isrc?: string;
  // True if the track belongs to a compilation (iTunes TCMP tag or
  // albumartist looks like Various Artists). Populated by adapters and
  // mirrored into the tracks table for the Albums-page filter.
  isCompilation?: boolean;
  coverData?: {
    data: Buffer;
    format: string;
  };
}

export interface MusicSourceAdapter {
  name: string;
  scan(libraryPath: string, onProgress?: (current: number, total: number) => void): AsyncGenerator<ScannedTrack>;
  isAvailable(): Promise<boolean>;
}
