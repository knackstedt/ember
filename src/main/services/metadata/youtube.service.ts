/**
 * YouTube Data API Video Provider
 * Covers: Both modern and retro games
 * Provides: Trailers, gameplay videos
 * Access: API key (free tier available)
 * API Docs: https://developers.google.com/youtube/v3
 */

import { MetadataProvider, GameMetadata, MetadataSearchOptions, MetadataFetchOptions, MetadataSource, GameVideo } from './types';

const YOUTUBE_BASE = 'https://www.googleapis.com/youtube/v3';

interface YouTubeSearchResult {
  id: {
    videoId: string;
  };
  snippet: {
    title: string;
    description: string;
    thumbnails: {
      default: { url: string; width: number; height: number };
      medium: { url: string; width: number; height: number };
      high: { url: string; width: number; height: number };
    };
    channelTitle: string;
    publishedAt: string;
  };
}

interface YouTubeVideoDetails {
  id: string;
  contentDetails: {
    duration: string; // ISO 8601 duration
  };
  statistics?: {
    viewCount: string;
    likeCount: string;
  };
}

interface YouTubeSearchResponse {
  items: YouTubeSearchResult[];
  nextPageToken?: string;
}

interface YouTubeVideosResponse {
  items: YouTubeVideoDetails[];
}

// Search queries for different video types
const VIDEO_TYPE_QUERIES: Record<string, string> = {
  'trailer': 'trailer',
  'gameplay': 'gameplay',
  'review': 'review',
};

/**
 * Parse ISO 8601 duration to seconds
 */
function parseDuration(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Determine video type from title and description
 */
function determineVideoType(title: string, description: string): GameVideo['type'] {
  const text = (title + ' ' + description).toLowerCase();

  if (text.includes('trailer') || text.includes('official') || text.includes('announcement')) {
    return 'trailer';
  }
  if (text.includes('review') || text.includes('rating') || text.includes('score')) {
    return 'review';
  }
  if (text.includes('gameplay') || text.includes('let\'s play') || text.includes('walkthrough')) {
    return 'gameplay';
  }

  return 'other';
}

/**
 * Search for game videos
 */
async function searchGameVideos(
  gameTitle: string,
  apiKey: string,
  type: GameVideo['type'] = 'trailer',
  maxResults = 5
): Promise<GameVideo[]> {
  try {
    const typeQuery = VIDEO_TYPE_QUERIES[type] || '';
    const query = `${gameTitle} game ${typeQuery}`.trim();

    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      videoEmbeddable: 'true',
      maxResults: String(maxResults),
      key: apiKey,
    });

    const res = await fetch(`${YOUTUBE_BASE}/search?${params}`);
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error('YouTube API quota exceeded or invalid API key');
      }
      throw new Error(`YouTube API error: ${res.status}`);
    }

    const data: YouTubeSearchResponse = await res.json();

    if (!data.items || data.items.length === 0) return [];

    // Get video details for duration
    const videoIds = data.items.map(item => item.id.videoId).join(',');
    const detailsParams = new URLSearchParams({
      part: 'contentDetails,statistics',
      id: videoIds,
      key: apiKey,
    });

    const detailsRes = await fetch(`${YOUTUBE_BASE}/videos?${detailsParams}`);
    const detailsData: YouTubeVideosResponse = await detailsRes.json();

    const detailsMap = new Map<string, YouTubeVideoDetails>();
    detailsData.items?.forEach(item => {
      detailsMap.set(item.id, item);
    });

    // Map to GameVideo format
    return data.items.map(item => {
      const videoDetails = detailsMap.get(item.id.videoId);
      const duration = videoDetails?.contentDetails?.duration
        ? parseDuration(videoDetails.contentDetails.duration)
        : 0;

      // Filter out very long videos (likely not trailers)
      const isLikelyTrailer = type === 'trailer' && duration > 0 && duration < 600; // < 10 minutes

      return {
        type: determineVideoType(item.snippet.title, item.snippet.description),
        name: item.snippet.title,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
        source: 'YouTube',
      };
    }).filter(v => type !== 'trailer' || v.type === 'trailer');
  } catch (err) {
    console.error('[YouTube] Search error:', err);
    return [];
  }
}

/**
 * Search for all video types for a game
 */
async function searchAllGameVideos(
  gameTitle: string,
  apiKey: string
): Promise<GameVideo[]> {
  const [trailers, gameplay] = await Promise.all([
    searchGameVideos(gameTitle, apiKey, 'trailer', 3),
    searchGameVideos(gameTitle, apiKey, 'gameplay', 2),
  ]);

  // Combine and deduplicate by video ID
  const seen = new Set<string>();
  const allVideos: GameVideo[] = [];

  for (const video of [...trailers, ...gameplay]) {
    const videoId = video.url.split('v=')[1];
    if (videoId && !seen.has(videoId)) {
      seen.add(videoId);
      allVideos.push(video);
    }
  }

  return allVideos;
}

function mapYouTubeToMetadata(title: string, videos: GameVideo[]): GameMetadata {
  const source: MetadataSource = {
    name: 'YouTube',
    type: 'video',
    confidence: 0.75,
    fieldCoverage: ['videos'],
  };

  return {
    title,
    videos,
    sources: [source],
  };
}

export const YouTubeProvider: MetadataProvider = {
  name: 'YouTube',
  type: 'video',
  priority: 60,
  requiresApiKey: true,

  isAvailable(apiKey?: string): boolean {
    return !!apiKey;
  },

  async search(options: MetadataSearchOptions, apiKey?: string): Promise<GameMetadata | null> {
    if (!apiKey) return null;

    try {
      const videos = await searchAllGameVideos(options.title, apiKey);

      if (videos.length === 0) return null;

      return mapYouTubeToMetadata(options.title, videos);
    } catch (err) {
      console.error('[YouTube] Search error:', err);
      return null;
    }
  },

  async fetch(): Promise<GameMetadata | null> {
    // YouTube requires title search, doesn't support fetching by external ID
    return null;
  },
};

// Export utility functions for testing and direct use
export {
  searchGameVideos,
  searchAllGameVideos,
  parseDuration,
  determineVideoType,
  mapYouTubeToMetadata,
};
