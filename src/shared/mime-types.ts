const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".map": "application/json",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".swf": "application/x-shockwave-flash",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/aac",
  ".aac": "audio/aac",
  ".opus": "audio/opus",
  ".wma": "audio/x-ms-wma",
  ".wmv": "video/x-ms-wmv",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".ogv": "video/ogg",
  ".ts": "video/mp2t",
  ".m2ts": "video/mp2t",
  ".vtt": "text/vtt",
  ".srt": "text/plain",
  ".bin": "application/octet-stream",
  ".data": "application/octet-stream",
};

const VIDEO_FALLBACK_TYPES: Record<string, string> = {
  ".mkv": "video/x-matroska",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".wmv": "video/x-ms-wmv",
  ".ts": "video/mp2t",
  ".m2ts": "video/mp2t",
};

export function getContentType(ext: string): string {
  return MIME_TYPES[ext.toLowerCase()] ?? "application/octet-stream";
}

export function getVideoFallbackContentType(ext: string): string | undefined {
  return VIDEO_FALLBACK_TYPES[ext.toLowerCase()];
}
