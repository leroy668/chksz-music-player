export type MusicSource = "netease" | "qq" | "kugou";

export type Track = {
  id: string;
  source: MusicSource;
  name: string;
  singer: string;
  album: string;
  cover?: string;
  duration?: number;
  position?: number;
  mid?: string;
  url?: string;
  lyric?: string;
  quality?: string;
};

export class ChkszApiError extends Error {
  readonly status: number;
  readonly retryAfter?: string;

  constructor(message: string, status: number, retryAfter?: string) {
    super(message);
    this.name = "ChkszApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const apiBase = import.meta.env.DEV
  ? "/chksz-api"
  : import.meta.env.VITE_CHKSZ_API_BASE || "https://api.chksz.com";

const sourceLabels: Record<MusicSource, string> = {
  netease: "网易云",
  qq: "QQ 音乐",
  kugou: "酷狗",
};

export const getSourceLabel = (source: MusicSource) => sourceLabels[source];

const text = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(" / ");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return text(record.name ?? record.title ?? record.nickname ?? record.artist ?? record.singer);
  }
  return "";
};

const number = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const pickArray = (payload: unknown): Record<string, unknown>[] => {
  if (!payload || typeof payload !== "object") return [];
  const data = payload as Record<string, unknown>;
  const candidates = [
    data.list,
    data.songs,
    data.data,
    (data.result as Record<string, unknown> | undefined)?.songs,
    (data.data as Record<string, unknown> | undefined)?.list,
    (data.data as Record<string, unknown> | undefined)?.songs,
  ];
  const found = candidates.find(Array.isArray);
  return Array.isArray(found) ? (found as Record<string, unknown>[]) : [];
};

const normalizeTrack = (item: Record<string, unknown>, source: MusicSource, index: number): Track => {
  const artist = item.artists ?? item.ar ?? item.singer ?? item.singers ?? item.artist ?? item.author;
  const albumValue = item.album ?? item.al ?? item.albumName;
  const cover =
    text(item.cover ?? item.pic ?? item.picUrl ?? item.image ?? (albumValue as Record<string, unknown>)?.picUrl) ||
    undefined;
  const id = text(item.id ?? item.songid ?? item.songId ?? item.mid ?? item.hash);
  return {
    id: id || `${source}-${index}`,
    source,
    name: text(item.name ?? item.title ?? item.songname) || "未命名歌曲",
    singer: text(artist) || "未知歌手",
    album: text(albumValue) || "单曲",
    cover,
    duration: number(item.duration ?? item.interval ?? item.dt),
    position: number(item.n) ?? index + 1,
    mid: text(item.mid) || undefined,
    quality: text(item.bitrate ?? item.format) || undefined,
  };
};

async function request(path: string, params: Record<string, string | number | undefined>, apiKey: string) {
  if (!apiKey.trim()) throw new ChkszApiError("请先在设置中填写 ChKSz API Key。", 401);
  const search = new URLSearchParams({ apikey: apiKey.trim() });
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });

  const response = await fetch(`${apiBase}${path}?${search.toString()}`);
  const raw = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    if (response.ok) return raw;
  }
  if (!response.ok) {
    const message = text(body.msg ?? body.message ?? raw) || `请求失败（HTTP ${response.status}）`;
    throw new ChkszApiError(message, response.status, response.headers.get("Retry-After") ?? undefined);
  }
  return body;
}

export async function searchMusic(source: MusicSource, keyword: string, apiKey: string): Promise<Track[]> {
  if (source === "netease") {
    const response = await request("/api/163_search", { keyword, limit: 30, offset: 0 }, apiKey);
    return pickArray(response).map((item, index) => normalizeTrack(item, source, index));
  }

  const path = source === "qq" ? "/api/qq_music" : "/api/kugou_music";
  const response = await request(path, { msg: keyword, num: 30 }, apiKey);
  return pickArray(response).map((item, index) => normalizeTrack(item, source, index));
}

const locateDetail = (body: Record<string, unknown>): Record<string, unknown> => {
  const maybeData = body.data;
  if (maybeData && typeof maybeData === "object" && !Array.isArray(maybeData)) {
    return maybeData as Record<string, unknown>;
  }
  return body;
};

export async function resolveTrack(track: Track, apiKey: string): Promise<Track> {
  if (track.source === "netease") {
    const response = await request(
      "/api/163_music",
      { id: track.id, level: "lossless", type: "json" },
      apiKey,
    );
    const detail = locateDetail(response as Record<string, unknown>);
    return {
      ...track,
      url: text(detail.url ?? detail.data) || undefined,
      cover: text(detail.cover ?? detail.pic) || track.cover,
      quality: text(detail.level ?? detail.bitrate ?? detail.format) || track.quality,
    };
  }

  const path = track.source === "qq" ? "/api/qq_music" : "/api/kugou_music";
  const params =
    track.source === "qq"
      ? { mid: track.mid || track.id, size: "flac" }
      : { id: track.id, size: "flac" };
  const response = await request(path, params, apiKey);
  const detail = locateDetail(response as Record<string, unknown>);
  return {
    ...track,
    name: text(detail.name) || track.name,
    singer: text(detail.singer) || track.singer,
    album: text(detail.album) || track.album,
    cover: text(detail.cover) || track.cover,
    duration: number(detail.interval) || track.duration,
    url: text(detail.url ?? detail.data) || undefined,
    lyric: text(detail.lrc ?? detail.lyric) || undefined,
    quality: text(detail.bitrate ?? detail.format) || track.quality,
  };
}

export async function getLyric(track: Track, apiKey: string): Promise<string> {
  if (track.lyric) return track.lyric;
  if (track.source !== "netease") return "";
  const response = await request("/api/163_lyric", { id: track.id }, apiKey);
  const detail = locateDetail(response as Record<string, unknown>);
  const lrc = detail.lrc;
  const lrcObject = lrc && typeof lrc === "object" ? (lrc as Record<string, unknown>) : undefined;
  return text(detail.lyric ?? detail.lrc ?? lrcObject?.lyric);
}
