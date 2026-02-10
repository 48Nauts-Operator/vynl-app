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
