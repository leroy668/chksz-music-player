import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
  KeyRound,
  Library,
  ListMusic,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  Music2,
  ArrowRightLeft,
  Pause,
  Play,
  Plus,
  Repeat2,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ChkszApiError,
  getLyric,
  getSourceLabel,
  resolveTrack,
  searchMusic,
  type MusicSource,
  type Track,
} from "./lib/musicApi";
import importedSongsText from "./data/importedSongs.txt?raw";
import "./playlists.css";
import "./playbackModes.css";

type Page = "discover" | "library" | "imported" | "playlist";
type PlayMode = "repeat-all" | "shuffle" | "repeat-one";

type UserPlaylist = {
  id: string;
  name: string;
  tracks: Track[];
};

const KEY_STORAGE = "soundfield-chksz-api-key";
const FAVORITES_STORAGE = "soundfield-favorites";
const PLAYLISTS_STORAGE = "soundfield-playlists";
const PLAY_MODE_STORAGE = "soundfield-play-mode";
const DEFAULT_COVER = "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=400&q=80";

const importedTracks: Track[] = importedSongsText
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line, index) => {
    const separator = line.lastIndexOf(" - ");
    const name = separator >= 0 ? line.slice(0, separator).trim() : line;
    const singer = separator >= 0 ? line.slice(separator + 3).trim() : "未知歌手";
    return {
      id: `qq-import-${index + 1}`,
      source: "qq",
      name,
      singer,
      album: "歌曲.txt 导入",
      imported: true,
      lookup: `${name} ${singer}`,
    };
  });

const formatTime = (seconds?: number) => {
  if (!seconds || !Number.isFinite(seconds)) return "--:--";
  const total = Math.floor(seconds > 1000 ? seconds / 1000 : seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const lyricLines = (lyrics: string) =>
  lyrics
    .replace(/\[[^\]]*\]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export default function App() {
  const [page, setPage] = useState<Page>("discover");
  const [source, setSource] = useState<MusicSource>("netease");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const [current, setCurrent] = useState<Track | null>(null);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(KEY_STORAGE) ?? "");
  const [keyDraft, setKeyDraft] = useState(() => localStorage.getItem(KEY_STORAGE) ?? "");
  const [favorites, setFavorites] = useState<Track[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_STORAGE) ?? "[]") as Track[];
    } catch {
      return [];
    }
  });
  const [userPlaylists, setUserPlaylists] = useState<UserPlaylist[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(PLAYLISTS_STORAGE) ?? "[]") as UserPlaylist[];
    } catch {
      return [];
    }
  });
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [playlistDraft, setPlaylistDraft] = useState("");
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [trackToAdd, setTrackToAdd] = useState<Track | null>(null);
  const [moveFromPlaylistId, setMoveFromPlaylistId] = useState("");
  const [isMoveDialog, setIsMoveDialog] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lyric, setLyric] = useState("");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playMode, setPlayMode] = useState<PlayMode>(() => {
    const stored = localStorage.getItem(PLAY_MODE_STORAGE);
    return stored === "shuffle" || stored === "repeat-one" ? stored : "repeat-all";
  });
  const audioRef = useRef<HTMLAudioElement>(null);
  const resolveInFlightRef = useRef(false);
  const resolvedTracksRef = useRef(new Map<string, Track>());
  const prefetchedTracksRef = useRef(new Set<string>());
  const playbackIntentRef = useRef(false);
  const failedStreamRef = useRef("");
  const streamRecoveryInFlightRef = useRef(false);
  const lastPositionUpdateRef = useRef(0);

  const selectedPlaylist = userPlaylists.find((playlist) => playlist.id === selectedPlaylistId);
  const displayTracks = page === "library" ? favorites : page === "imported" ? importedTracks : page === "playlist" ? selectedPlaylist?.tracks ?? [] : results;
  const isCurrentFavorite = Boolean(current && favorites.some((track) => track.source === current.source && track.id === current.id));

  useEffect(() => {
    localStorage.setItem(FAVORITES_STORAGE, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem(PLAYLISTS_STORAGE, JSON.stringify(userPlaylists));
  }, [userPlaylists]);

  useEffect(() => {
    localStorage.setItem(PLAY_MODE_STORAGE, playMode);
  }, [playMode]);

  useEffect(() => {
    if (!current?.url || !audioRef.current) return;
    const audio = audioRef.current;
    audio.src = current.url;
    audio.load();
    setPosition(0);
    setDuration(0);
    playbackIntentRef.current = true;
    void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [current?.url]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = current
      ? new MediaMetadata({
        title: current.name,
        artist: current.singer,
        album: current.album,
        artwork: current.cover ? [{ src: current.cover }] : [],
      })
      : null;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [current, isPlaying]);

  useEffect(() => {
    if (!current || !apiKey) {
      setLyric("");
      return;
    }
    getLyric(current, apiKey).then(setLyric).catch(() => setLyric(""));
  }, [current, apiKey]);

  const submitSearch = async (event: FormEvent) => {
    event.preventDefault();
    const keyword = query.trim();
    if (!keyword) return;
    setError("");
    setNotice("");
    setIsSearching(true);
    try {
      const tracks = await searchMusic(source, keyword, apiKey);
      setResults(tracks);
      setPage("discover");
      if (!tracks.length) setNotice("没有找到匹配的歌曲，请更换关键词或音乐源。");
    } catch (reason) {
      setError(apiErrorMessage(reason));
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const playTrack = async (track: Track, index: number, sourceQueue = displayTracks): Promise<boolean> => {
    if (resolveInFlightRef.current) return false;
    resolveInFlightRef.current = true;
    setError("");
    setNotice("");
    setIsResolving(true);
    try {
      const cacheKey = `${track.source}:${track.id}`;
      const cached = resolvedTracksRef.current.get(cacheKey);
      const resolved = track.url ? track : cached ?? await resolveTrack(track, apiKey);
      if (!resolved.url) throw new Error("该歌曲暂时没有可播放地址。");
      resolvedTracksRef.current.set(cacheKey, resolved);
      setCurrent(resolved);
      setQueue((previous) => {
        const next = sourceQueue.map((item) => (item.source === track.source && item.id === track.id ? resolved : item));
        return next.length ? next : previous;
      });
      setIsPlaying(true);
      playbackIntentRef.current = true;
      if (index >= 0) setNotice(`正在播放 ${resolved.name}`);
      return true;
    } catch (reason) {
      setError(apiErrorMessage(reason));
      return false;
    } finally {
      resolveInFlightRef.current = false;
      setIsResolving(false);
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      playbackIntentRef.current = true;
      void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
    else {
      playbackIntentRef.current = false;
      audio.pause();
      setIsPlaying(false);
    }
  };

  const prefetchNextTrack = () => {
    if (!current || !apiKey || resolveInFlightRef.current) return;
    const activeQueue = queue.length ? queue : displayTracks;
    const currentIndex = activeQueue.findIndex((track) => track.source === current.source && track.id === current.id);
    if (currentIndex < 0 || activeQueue.length < 2) return;
    const next = activeQueue[(currentIndex + 1) % activeQueue.length];
    const cacheKey = `${next.source}:${next.id}`;
    if (next.url || resolvedTracksRef.current.has(cacheKey) || prefetchedTracksRef.current.has(cacheKey)) return;
    prefetchedTracksRef.current.add(cacheKey);
    void resolveTrack(next, apiKey)
      .then((resolved) => resolvedTracksRef.current.set(cacheKey, resolved))
      .catch(() => undefined)
      .finally(() => prefetchedTracksRef.current.delete(cacheKey));
  };

  const stepTrack = async (direction: 1 | -1, automatic = false, failedAttempts = 0) => {
    if (resolveInFlightRef.current) return;
    const activeQueue = queue.length ? queue : displayTracks;
    if (!activeQueue.length) return;
    if (automatic && playMode === "repeat-one" && audioRef.current) {
      audioRef.current.currentTime = 0;
      playbackIntentRef.current = true;
      void audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      return;
    }
    const activeIndex = current
      ? activeQueue.findIndex((track) => track.source === current.source && track.id === current.id)
      : -1;
    let nextIndex = (activeIndex + direction * (failedAttempts + 1) + activeQueue.length * (failedAttempts + 1)) % activeQueue.length;
    if (playMode === "shuffle" && activeQueue.length > 1) {
      do nextIndex = Math.floor(Math.random() * activeQueue.length);
      while (nextIndex === activeIndex);
    }
    const started = await playTrack(activeQueue[nextIndex], nextIndex, activeQueue);
    if (!started && automatic && failedAttempts < Math.min(activeQueue.length - 1, 3)) {
      await stepTrack(direction, true, failedAttempts + 1);
    }
  };

  const recoverCurrentStream = async () => {
    if (!current || !apiKey || streamRecoveryInFlightRef.current) return;
    const failedStreamKey = `${current.source}:${current.id}:${current.url}`;
    if (failedStreamRef.current === failedStreamKey) {
      void stepTrack(1, true);
      return;
    }
    failedStreamRef.current = failedStreamKey;
    streamRecoveryInFlightRef.current = true;
    setIsBuffering(true);
    try {
      const refreshed = await resolveTrack({ ...current, url: undefined }, apiKey);
      if (!refreshed.url) throw new Error("未获取到新的播放地址。");
      resolvedTracksRef.current.set(`${refreshed.source}:${refreshed.id}`, refreshed);
      setCurrent(refreshed);
      setQueue((previous) => previous.map((item) => item.source === refreshed.source && item.id === refreshed.id ? refreshed : item));
      setNotice("播放地址已刷新，正在继续播放。");
    } catch {
      setError("当前歌曲播放地址已失效，已自动尝试下一首歌曲。");
      void stepTrack(1, true);
    } finally {
      streamRecoveryInFlightRef.current = false;
    }
  };

  useEffect(() => {
    prefetchNextTrack();
  }, [current?.url]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const setAction = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Some mobile browsers implement only a subset of Media Session actions.
      }
    };
    setAction("play", () => {
      playbackIntentRef.current = true;
      void audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    });
    setAction("pause", () => {
      playbackIntentRef.current = false;
      audioRef.current?.pause();
    });
    setAction("previoustrack", () => { void stepTrack(-1); });
    setAction("nexttrack", () => { void stepTrack(1); });
    return () => {
      (["play", "pause", "previoustrack", "nexttrack"] as MediaSessionAction[]).forEach((action) => {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Keep cleanup compatible with partial Media Session implementations.
        }
      });
    };
  }, [current, queue, playMode]);

  const setPlaybackMode = (mode: PlayMode) => {
    setPlayMode(mode);
    setNotice(`播放模式：${mode === "shuffle" ? "随机播放" : mode === "repeat-one" ? "单曲循环" : "列表循环"}`);
  };

  const cyclePlaybackMode = () => {
    setPlaybackMode(playMode === "repeat-all" ? "shuffle" : playMode === "shuffle" ? "repeat-one" : "repeat-all");
  };

  const toggleFavorite = (track: Track) => {
    const exists = favorites.some((item) => item.source === track.source && item.id === track.id);
    setFavorites((previous) =>
      exists ? previous.filter((item) => !(item.source === track.source && item.id === track.id)) : [track, ...previous],
    );
  };

  const openCreatePlaylist = (track?: Track) => {
    setTrackToAdd(track ?? null);
    setPlaylistDraft("");
    setIsPlaylistModalOpen(true);
  };

  const createPlaylist = (event: FormEvent) => {
    event.preventDefault();
    const name = playlistDraft.trim();
    if (!name) return;
    const playlist: UserPlaylist = {
      id: `playlist-${Date.now()}`,
      name,
      tracks: trackToAdd ? [trackToAdd] : [],
    };
    setUserPlaylists((previous) => [...previous, playlist]);
    setSelectedPlaylistId(playlist.id);
    setPage("playlist");
    setNotice(trackToAdd ? `已创建“${name}”并添加 ${trackToAdd.name}` : `已创建歌单“${name}”`);
    setIsPlaylistModalOpen(false);
    setTrackToAdd(null);
  };

  const addTrackToPlaylist = (playlistId: string) => {
    if (!trackToAdd) return;
    const playlist = userPlaylists.find((item) => item.id === playlistId);
    const exists = playlist?.tracks.some((item) => item.source === trackToAdd.source && item.id === trackToAdd.id);
    if (exists) {
      setNotice(`${trackToAdd.name} 已在“${playlist?.name}”中`);
    } else {
      setUserPlaylists((previous) => previous.map((item) => item.id === playlistId ? { ...item, tracks: [...item.tracks, trackToAdd] } : item));
      setNotice(`已将 ${trackToAdd.name} 添加到“${playlist?.name}”`);
    }
    setTrackToAdd(null);
    setIsMoveDialog(false);
  };

  const openMovePlaylist = (track: Track, fromPlaylistId = "") => {
    setMoveFromPlaylistId(fromPlaylistId);
    setIsMoveDialog(true);
    setTrackToAdd(track);
  };

  const moveTrackToPlaylist = (playlistId: string) => {
    if (!trackToAdd) return;
    const target = userPlaylists.find((playlist) => playlist.id === playlistId);
    const alreadyThere = target?.tracks.some((item) => item.source === trackToAdd.source && item.id === trackToAdd.id);
    setUserPlaylists((previous) => previous.map((playlist) => {
      if (playlist.id === moveFromPlaylistId && playlist.id !== playlistId) {
        return { ...playlist, tracks: playlist.tracks.filter((item) => !(item.source === trackToAdd.source && item.id === trackToAdd.id)) };
      }
      if (playlist.id === playlistId && !alreadyThere) {
        return { ...playlist, tracks: [...playlist.tracks, trackToAdd] };
      }
      return playlist;
    }));
    setNotice(alreadyThere ? `${trackToAdd.name} 已在“${target?.name}”中` : `已将 ${trackToAdd.name} 移动到“${target?.name}”`);
    setTrackToAdd(null);
    setMoveFromPlaylistId("");
    setIsMoveDialog(false);
  };

  const removeTrackFromPlaylist = (track: Track) => {
    setUserPlaylists((previous) => previous.map((playlist) => playlist.id === selectedPlaylistId ? { ...playlist, tracks: playlist.tracks.filter((item) => !(item.source === track.source && item.id === track.id)) } : playlist));
    setNotice(`已从歌单移除 ${track.name}`);
  };

  const deleteSelectedPlaylist = () => {
    if (!selectedPlaylist) return;
    setUserPlaylists((previous) => previous.filter((playlist) => playlist.id !== selectedPlaylist.id));
    setPage("discover");
    setSelectedPlaylistId("");
    setNotice(`已删除歌单“${selectedPlaylist.name}”`);
  };

  const saveApiKey = (event: FormEvent) => {
    event.preventDefault();
    const next = keyDraft.trim();
    if (next && !next.startsWith("chksz_")) {
      setError("API Key 应以 chksz_ 开头，请检查后再保存。");
      return;
    }
    if (next) localStorage.setItem(KEY_STORAGE, next);
    else localStorage.removeItem(KEY_STORAGE);
    setApiKey(next);
    setError("");
    setNotice(next ? "API Key 已保存到当前浏览器。" : "已从当前浏览器移除 API Key。");
    setIsSettingsOpen(false);
  };

  const sourceChoices: { id: MusicSource; label: string }[] = [
    { id: "netease", label: "网易云音乐" },
    { id: "qq", label: "QQ 音乐" },
    { id: "kugou", label: "酷狗音乐" },
  ];

  const visibleLyrics = useMemo(() => lyricLines(lyric).slice(0, 8), [lyric]);

  return (
    <main className="app-shell">
      <aside className={`side-panel ${isMobileNavOpen ? "open" : ""}`}>
        <div className="brand-row">
          <span className="brand-mark"><Music2 size={20} strokeWidth={2.4} /></span>
          <strong>声场</strong>
          <button className="mobile-close" onClick={() => setIsMobileNavOpen(false)} aria-label="关闭菜单"><X size={20} /></button>
        </div>
        <nav className="main-nav" aria-label="主导航">
          <button className={page === "discover" ? "active" : ""} onClick={() => { setPage("discover"); setIsMobileNavOpen(false); }}><Music2 size={19} />发现音乐</button>
          <button className={page === "library" ? "active" : ""} onClick={() => { setPage("library"); setIsMobileNavOpen(false); }}><Library size={19} />我的音乐 <span>{favorites.length}</span></button>
        </nav>
        <div className="side-section">
          <div className="side-section-heading"><span>歌单</span><button onClick={() => openCreatePlaylist()} aria-label="新建歌单" title="新建歌单"><Plus size={16} /></button></div>
          <div className="playlist-list">
            <button className={page === "imported" ? "active" : ""} onClick={() => { setPage("imported"); setSource("qq"); setIsMobileNavOpen(false); }}><i className="gold" /><span>歌曲.txt 导入</span><small>{importedTracks.length}</small></button>
            {userPlaylists.map((playlist, index) => <button key={playlist.id} className={page === "playlist" && selectedPlaylistId === playlist.id ? "active" : ""} onClick={() => { setSelectedPlaylistId(playlist.id); setPage("playlist"); setIsMobileNavOpen(false); }}><i className={index % 2 ? "blue" : "red"} /><span>{playlist.name}</span><small>{playlist.tracks.length}</small></button>)}
          </div>
        </div>
        <div className="side-bottom">
          <button className="api-key-button" onClick={() => setIsSettingsOpen(true)}><KeyRound size={17} /><span>{apiKey ? "API Key 已连接" : "连接 ChKSz API"}</span></button>
          <a href="https://api.chksz.com/login" target="_blank" rel="noreferrer">获取 API Key <ChevronRight size={15} /></a>
        </div>
      </aside>

      {isMobileNavOpen && <button className="mobile-scrim" onClick={() => setIsMobileNavOpen(false)} aria-label="关闭导航" />}

      <section className="workspace">
        <header className="topbar">
          <button className="menu-button" onClick={() => setIsMobileNavOpen(true)} aria-label="打开菜单"><Menu size={21} /></button>
          <div className="history-buttons"><button aria-label="后退"><ChevronLeft size={20} /></button><button aria-label="前进"><ChevronRight size={20} /></button></div>
          <form className="search-form" onSubmit={submitSearch}>
            <Search size={19} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索歌曲、歌手或专辑" aria-label="搜索歌曲、歌手或专辑" />
            <button type="submit" disabled={isSearching}>{isSearching ? <LoaderCircle className="spin" size={17} /> : "搜索"}</button>
          </form>
          <button className="settings-button" onClick={() => setIsSettingsOpen(true)} aria-label="设置"><Settings size={19} /></button>
        </header>

        <div className="content-wrap">
          <section className="hero-area">
            <div>
              <p className="eyebrow">CHKSZ API MUSIC</p>
              <h1>{page === "library" ? "我的音乐库" : page === "imported" ? "歌曲.txt 导入" : page === "playlist" ? selectedPlaylist?.name ?? "自建歌单" : "此刻，听见更多"}</h1>
              <p>{page === "library" ? "在这里播放和管理已收藏的歌曲。" : page === "imported" ? `已导入 ${importedTracks.length} 首 QQ 音乐，点击歌曲时自动搜索并播放。` : page === "playlist" ? `${selectedPlaylist?.tracks.length ?? 0} 首歌曲，保存在当前浏览器。` : "连接你的 ChKSz API Key，搜索并播放多平台音乐。"}</p>
            </div>
            <div className="hero-visual" aria-hidden="true"><span /><span /><span /><span /><span /></div>
          </section>

          {page === "discover" && <section className="source-tabs" aria-label="选择音乐源">
            {sourceChoices.map((choice) => <button key={choice.id} className={source === choice.id ? "active" : ""} onClick={() => setSource(choice.id)}>{choice.label}</button>)}
          </section>}

          {!apiKey && page !== "library" && <section className="key-notice">
            <div><KeyRound size={20} /><span><strong>还未连接 API Key</strong><small>搜索和播放前，需要填写你的 ChKSz API Key。</small></span></div>
            <button onClick={() => setIsSettingsOpen(true)}>去连接</button>
          </section>}
          {error && <div className="message error-message">{error}</div>}
          {notice && <div className="message notice-message">{notice}</div>}

          <section className="results-section">
            <div className="section-title"><div><h2>{page === "library" ? "收藏歌曲" : page === "imported" ? "QQ 音乐歌单" : page === "playlist" ? selectedPlaylist?.name ?? "自建歌单" : results.length ? `“${query}” 的搜索结果` : "开始搜索"}</h2><p>{page === "library" ? `${favorites.length} 首已收藏` : page === "imported" ? `${importedTracks.length} 条记录，保留歌曲.txt 原始顺序` : page === "playlist" ? `${selectedPlaylist?.tracks.length ?? 0} 首歌曲` : results.length ? `${results.length} 首来自 ${getSourceLabel(source)}` : "输入关键词后，选择音乐源进行搜索"}</p></div>{page === "playlist" ? <button onClick={deleteSelectedPlaylist} aria-label="删除歌单" title="删除歌单"><Trash2 size={19} /></button> : <button aria-label="更多操作"><MoreHorizontal size={20} /></button>}</div>
            {isSearching ? <div className="loading-state"><LoaderCircle className="spin" size={27} /><span>正在检索音乐...</span></div> : displayTracks.length ? <div className="track-list">
              <div className="track-heading"><span>#</span><span>歌曲</span><span className="wide-only">专辑</span><span className="wide-only"><Clock3 size={15} /></span><span /></div>
              {displayTracks.map((track, index) => <TrackRow key={`${track.source}-${track.id}-${index}`} track={track} index={index} active={current?.source === track.source && current?.id === track.id} favorite={favorites.some((item) => item.source === track.source && item.id === track.id)} playing={isPlaying} busy={isResolving} inUserPlaylist={page === "playlist"} onPlay={() => void playTrack(track, index)} onFavorite={() => toggleFavorite(track)} onPlaylistAction={() => { setIsMoveDialog(false); setMoveFromPlaylistId(""); page === "playlist" ? removeTrackFromPlaylist(track) : setTrackToAdd(track); }} onMove={() => openMovePlaylist(track, page === "playlist" ? selectedPlaylistId : "")} />)}
            </div> : <div className="empty-results"><Search size={26} /><strong>{page === "library" ? "还没有收藏歌曲" : page === "playlist" ? "这个歌单还是空的" : "搜索你想听的音乐"}</strong><span>{page === "library" ? "在搜索结果中点击心形图标，即可收藏到这里。" : page === "playlist" ? "在搜索结果或导入歌单中点击加号添加歌曲。" : "支持网易云音乐、QQ 音乐和酷狗音乐。"}</span></div>}
          </section>

          <section className="lower-grid">
            <div className="queue-card">
              <div className="section-title"><div><h2>播放队列</h2><p>{queue.length ? `${queue.length} 首歌曲` : "从搜索结果中选择歌曲"}</p></div><ListMusic size={20} /></div>
              {queue.length ? <ol className="queue-list">{queue.slice(0, 4).map((track, index) => <li key={`${track.source}-${track.id}-${index}`}><span>{index + 1}</span><button onClick={() => void playTrack(track, index, queue)}><strong>{track.name}</strong><small>{track.singer}</small></button></li>)}</ol> : <div className="queue-empty">队列为空</div>}
            </div>
            <div className="lyrics-card">
              <div className="section-title"><div><h2>歌词</h2><p>{current ? `${current.name} · ${current.singer}` : "选择歌曲后显示"}</p></div><Music2 size={20} /></div>
              {current ? visibleLyrics.length ? <div className="lyrics-lines">{visibleLyrics.map((line, index) => <p className={index === 2 ? "current-line" : ""} key={`${line}-${index}`}>{line}</p>)}</div> : <div className="lyrics-empty">暂未获取到歌词</div> : <div className="lyrics-empty">音乐会在这里留下文字</div>}
            </div>
          </section>
        </div>
      </section>

      <footer className="player-bar">
        <audio
          ref={audioRef}
          preload="auto"
          playsInline
          onTimeUpdate={(event) => {
            const now = Date.now();
            if (now - lastPositionUpdateRef.current < 750) return;
            lastPositionUpdateRef.current = now;
            setPosition(event.currentTarget.currentTime);
          }}
          onDurationChange={(event) => setDuration(event.currentTarget.duration)}
          onWaiting={(event) => { if (!event.currentTarget.paused) setIsBuffering(true); }}
          onStalled={() => setIsBuffering(true)}
          onCanPlay={() => {
            setIsBuffering(false);
            const audio = audioRef.current;
            if (audio?.paused && playbackIntentRef.current) void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
          }}
          onEnded={() => { failedStreamRef.current = ""; void stepTrack(1, true); }}
          onError={() => { if (playbackIntentRef.current) void recoverCurrentStream(); }}
          onPlay={() => { setIsPlaying(true); setIsBuffering(false); }}
          onPause={() => setIsPlaying(false)}
        />
        <div className="now-playing"><img src={current?.cover || DEFAULT_COVER} alt="" /><div><strong>{current?.name || "还没有播放歌曲"}</strong><small>{current ? `${current.singer} · ${current.album}${isBuffering ? " · 正在缓冲" : ""}` : "选择一首歌曲开始聆听"}</small></div><div className="now-playing-actions"><button className={isCurrentFavorite ? "liked" : ""} onClick={() => current && toggleFavorite(current)} disabled={!current} aria-label="收藏当前歌曲" title="收藏"><Heart size={18} fill={isCurrentFavorite ? "currentColor" : "none"} /></button><button onClick={() => { if (current) { setIsMoveDialog(false); setMoveFromPlaylistId(""); setTrackToAdd(current); } }} disabled={!current} aria-label="将当前歌曲添加到歌单" title="添加到歌单"><Plus size={18} /></button><button onClick={() => current && openMovePlaylist(current, page === "playlist" ? selectedPlaylistId : "")} disabled={!current} aria-label="将当前歌曲移动到歌单" title="移动到歌单"><ArrowRightLeft size={18} /></button></div></div>
        <div className="play-controls"><div><button className={`mobile-mode-button ${playMode !== "repeat-all" ? "active" : ""}`} onClick={cyclePlaybackMode} aria-label={`当前为${playMode === "shuffle" ? "随机播放" : playMode === "repeat-one" ? "单曲循环" : "列表循环"}，点击切换`} title={playMode === "shuffle" ? "随机播放" : playMode === "repeat-one" ? "单曲循环" : "列表循环"}>{playMode === "shuffle" ? <Shuffle size={18} /> : <span className="repeat-mode-icon"><Repeat2 size={18} />{playMode === "repeat-one" && <b>1</b>}</span>}</button><button onClick={() => stepTrack(-1)} disabled={isResolving || (!queue.length && !displayTracks.length)} aria-label="上一首"><SkipBack size={19} fill="currentColor" /></button><button className="play-button" onClick={togglePlay} disabled={!current} aria-label={isPlaying ? "暂停" : "播放"}>{isPlaying ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}</button><button onClick={() => stepTrack(1)} disabled={isResolving || (!queue.length && !displayTracks.length)} aria-label="下一首"><SkipForward size={19} fill="currentColor" /></button></div><div className="progress-row"><span>{formatTime(position)}</span><input type="range" min="0" max={duration || current?.duration || 0} value={Math.min(position, duration || current?.duration || 0)} onChange={(event) => { const next = Number(event.target.value); if (audioRef.current) audioRef.current.currentTime = next; setPosition(next); }} disabled={!current} aria-label="播放进度" /><span>{formatTime(duration || current?.duration)}</span></div></div>
        <div className="player-tools"><div className="play-mode-group" aria-label="播放模式"><button className={playMode === "repeat-all" ? "active" : ""} onClick={() => setPlaybackMode("repeat-all")} aria-label="列表循环" title="列表循环"><Repeat2 size={18} /></button><button className={playMode === "shuffle" ? "active" : ""} onClick={() => setPlaybackMode("shuffle")} aria-label="随机播放" title="随机播放"><Shuffle size={18} /></button><button className={playMode === "repeat-one" ? "active" : ""} onClick={() => setPlaybackMode("repeat-one")} aria-label="单曲循环" title="单曲循环"><span className="repeat-mode-icon"><Repeat2 size={18} /><b>1</b></span></button></div><button aria-label="音量"><Volume2 size={18} /></button><input type="range" min="0" max="1" step="0.05" defaultValue="0.8" onChange={(event) => { if (audioRef.current) audioRef.current.volume = Number(event.target.value); }} aria-label="音量" /></div>
      </footer>

      {isSettingsOpen && <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="settings-title"><button className="modal-backdrop" onClick={() => setIsSettingsOpen(false)} aria-label="关闭设置" /><form className="settings-modal" onSubmit={saveApiKey}><div className="modal-heading"><div><span className="modal-icon"><KeyRound size={20} /></span><div><h2 id="settings-title">连接 ChKSz API</h2><p>Key 仅保存于当前浏览器。</p></div></div><button type="button" onClick={() => setIsSettingsOpen(false)} aria-label="关闭"><X size={20} /></button></div><label>个人 API Key<input type="password" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} placeholder="chksz_..." autoFocus /></label><p className="modal-help">在 ChKSz 账户页创建并复制你的个人 Key。请勿将 Key 提交到代码仓库或分享给第三方。</p><div className="modal-actions"><a href="https://api.chksz.com/login" target="_blank" rel="noreferrer">前往获取 Key</a><button type="submit">保存连接</button></div></form></div>}
      {isPlaylistModalOpen && <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="playlist-title"><button className="modal-backdrop" onClick={() => setIsPlaylistModalOpen(false)} aria-label="关闭新建歌单" /><form className="settings-modal" onSubmit={createPlaylist}><div className="modal-heading"><div><span className="modal-icon playlist-modal-icon"><ListMusic size={20} /></span><div><h2 id="playlist-title">新建歌单</h2><p>{trackToAdd ? `创建后添加 ${trackToAdd.name}` : "歌单保存在当前浏览器。"}</p></div></div><button type="button" onClick={() => setIsPlaylistModalOpen(false)} aria-label="关闭"><X size={20} /></button></div><label>歌单名称<input value={playlistDraft} onChange={(event) => setPlaylistDraft(event.target.value)} placeholder="例如：通勤播放" maxLength={30} autoFocus /></label><div className="modal-actions modal-actions-end"><button type="submit" disabled={!playlistDraft.trim()}>创建歌单</button></div></form></div>}
      {trackToAdd && !isPlaylistModalOpen && <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby={isMoveDialog ? "move-playlist-title" : "add-playlist-title"}><button className="modal-backdrop" onClick={() => { setTrackToAdd(null); setMoveFromPlaylistId(""); setIsMoveDialog(false); }} aria-label={isMoveDialog ? "关闭移动到歌单" : "关闭添加到歌单"} /><section className="settings-modal"><div className="modal-heading"><div><span className="modal-icon playlist-modal-icon">{isMoveDialog ? <ArrowRightLeft size={20} /> : <Plus size={20} />}</span><div><h2 id={isMoveDialog ? "move-playlist-title" : "add-playlist-title"}>{isMoveDialog ? "移动到歌单" : "添加到歌单"}</h2><p>{trackToAdd.name} · {trackToAdd.singer}</p></div></div><button type="button" onClick={() => { setTrackToAdd(null); setMoveFromPlaylistId(""); setIsMoveDialog(false); }} aria-label="关闭"><X size={20} /></button></div><div className="playlist-picker">{userPlaylists.filter((playlist) => playlist.id !== moveFromPlaylistId).map((playlist) => <button key={playlist.id} onClick={() => isMoveDialog ? moveTrackToPlaylist(playlist.id) : addTrackToPlaylist(playlist.id)}><span><ListMusic size={17} /><strong>{playlist.name}</strong></span><small>{playlist.tracks.length} 首</small></button>)}{!isMoveDialog && <button className="create-playlist-option" onClick={() => openCreatePlaylist(trackToAdd)}><span><Plus size={17} /><strong>新建歌单</strong></span></button>}</div></section></div>}
    </main>
  );
}

function TrackRow({ track, index, active, favorite, playing, busy, inUserPlaylist, onPlay, onFavorite, onPlaylistAction, onMove }: { track: Track; index: number; active: boolean; favorite: boolean; playing: boolean; busy: boolean; inUserPlaylist: boolean; onPlay: () => void; onFavorite: () => void; onPlaylistAction: () => void; onMove: () => void }) {
  return <article className={`track-row ${active ? "is-active" : ""}`}><button className="index-button" onClick={onPlay} disabled={busy} aria-label={`播放 ${track.name}`}>{active && playing ? <span className="mini-eq"><i /><i /><i /></span> : <><span className="track-index">{String(index + 1).padStart(2, "0")}</span><Play className="track-play" size={16} fill="currentColor" /></>}</button><button className={`track-main ${track.imported ? "without-cover" : ""}`} onClick={onPlay} disabled={busy}>{!track.imported && <img src={track.cover || DEFAULT_COVER} alt="" />}<span><strong>{track.name}</strong><small>{track.singer} · {getSourceLabel(track.source)}</small></span></button><span className="track-album wide-only">{track.album}</span><time className="wide-only">{formatTime(track.duration)}</time><div className="track-actions"><button className={favorite ? "liked" : ""} onClick={onFavorite} aria-label={favorite ? "取消收藏" : "收藏"}><Heart size={17} fill={favorite ? "currentColor" : "none"} /></button><button onClick={onPlaylistAction} aria-label={inUserPlaylist ? "从歌单移除" : "添加到歌单"} title={inUserPlaylist ? "从歌单移除" : "添加到歌单"}>{inUserPlaylist ? <X size={17} /> : <Plus size={17} />}</button><button onClick={onMove} aria-label="移动到歌单" title="移动到歌单"><ArrowRightLeft size={17} /></button></div></article>;
}

function apiErrorMessage(reason: unknown) {
  if (reason instanceof ChkszApiError) {
    if (reason.status === 0) return reason.message;
    if (reason.status === 401) return `授权失败：${reason.message}`;
    if (reason.status === 402) return `额度已用尽：${reason.message}`;
    if (reason.status === 403) return `访问被拒绝：${reason.message}`;
    if (reason.status === 429) return `请求过于频繁：${reason.message}${reason.retryAfter ? `，请在 ${reason.retryAfter} 秒后重试。` : ""}`;
    return reason.message;
  }
  return reason instanceof Error ? reason.message : "请求失败，请稍后再试。";
}
