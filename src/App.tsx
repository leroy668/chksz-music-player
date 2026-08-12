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
  Pause,
  Play,
  Plus,
  Repeat2,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
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

type Page = "discover" | "library";

const KEY_STORAGE = "soundfield-chksz-api-key";
const FAVORITES_STORAGE = "soundfield-favorites";
const DEFAULT_COVER = "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=400&q=80";

const playlists = [
  { name: "深夜工作流", count: 28, color: "red" },
  { name: "城市漫游", count: 46, color: "gold" },
  { name: "晴天的窗边", count: 19, color: "blue" },
];

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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lyric, setLyric] = useState("");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const displayTracks = page === "library" ? favorites : results;
  const isCurrentFavorite = Boolean(current && favorites.some((track) => track.source === current.source && track.id === current.id));

  useEffect(() => {
    localStorage.setItem(FAVORITES_STORAGE, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (!current?.url || !audioRef.current) return;
    audioRef.current.src = current.url;
    audioRef.current.load();
    setPosition(0);
    setDuration(0);
    audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [current?.url]);

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

  const playTrack = async (track: Track, index: number) => {
    setError("");
    setNotice("");
    setIsResolving(true);
    try {
      const resolved = track.url ? track : await resolveTrack(track, apiKey);
      if (!resolved.url) throw new Error("该歌曲暂时没有可播放地址。");
      setCurrent(resolved);
      setQueue((previous) => {
        const next = displayTracks.map((item) => (item.source === resolved.source && item.id === resolved.id ? resolved : item));
        return next.length ? next : previous;
      });
      setIsPlaying(true);
      if (index >= 0) setNotice(`正在播放 ${resolved.name}`);
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setIsResolving(false);
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const stepTrack = (direction: 1 | -1) => {
    const activeQueue = queue.length ? queue : displayTracks;
    if (!activeQueue.length) return;
    const activeIndex = current
      ? activeQueue.findIndex((track) => track.source === current.source && track.id === current.id)
      : -1;
    const nextIndex = (activeIndex + direction + activeQueue.length) % activeQueue.length;
    void playTrack(activeQueue[nextIndex], nextIndex);
  };

  const toggleFavorite = (track: Track) => {
    const exists = favorites.some((item) => item.source === track.source && item.id === track.id);
    setFavorites((previous) =>
      exists ? previous.filter((item) => !(item.source === track.source && item.id === track.id)) : [track, ...previous],
    );
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
          <div className="side-section-heading"><span>歌单</span><button aria-label="新建歌单" title="新建歌单"><Plus size={16} /></button></div>
          <div className="playlist-list">
            {playlists.map((playlist) => <button key={playlist.name}><i className={playlist.color} /><span>{playlist.name}</span><small>{playlist.count}</small></button>)}
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
              <h1>{page === "library" ? "我的音乐库" : "此刻，听见更多"}</h1>
              <p>{page === "library" ? "在这里播放和管理已收藏的歌曲。" : "连接你的 ChKSz API Key，搜索并播放多平台音乐。"}</p>
            </div>
            <div className="hero-visual" aria-hidden="true"><span /><span /><span /><span /><span /></div>
          </section>

          {page === "discover" && <section className="source-tabs" aria-label="选择音乐源">
            {sourceChoices.map((choice) => <button key={choice.id} className={source === choice.id ? "active" : ""} onClick={() => setSource(choice.id)}>{choice.label}</button>)}
          </section>}

          {!apiKey && page === "discover" && <section className="key-notice">
            <div><KeyRound size={20} /><span><strong>还未连接 API Key</strong><small>搜索和播放前，需要填写你的 ChKSz API Key。</small></span></div>
            <button onClick={() => setIsSettingsOpen(true)}>去连接</button>
          </section>}
          {error && <div className="message error-message">{error}</div>}
          {notice && <div className="message notice-message">{notice}</div>}

          <section className="results-section">
            <div className="section-title"><div><h2>{page === "library" ? "收藏歌曲" : results.length ? `“${query}” 的搜索结果` : "开始搜索"}</h2><p>{page === "library" ? `${favorites.length} 首已收藏` : results.length ? `${results.length} 首来自 ${getSourceLabel(source)}` : "输入关键词后，选择音乐源进行搜索"}</p></div><button aria-label="更多操作"><MoreHorizontal size={20} /></button></div>
            {isSearching ? <div className="loading-state"><LoaderCircle className="spin" size={27} /><span>正在检索音乐...</span></div> : displayTracks.length ? <div className="track-list">
              <div className="track-heading"><span>#</span><span>歌曲</span><span className="wide-only">专辑</span><span className="wide-only"><Clock3 size={15} /></span><span /></div>
              {displayTracks.map((track, index) => <TrackRow key={`${track.source}-${track.id}-${index}`} track={track} index={index} active={current?.source === track.source && current?.id === track.id} favorite={favorites.some((item) => item.source === track.source && item.id === track.id)} playing={isPlaying} busy={isResolving} onPlay={() => void playTrack(track, index)} onFavorite={() => toggleFavorite(track)} />)}
            </div> : <div className="empty-results"><Search size={26} /><strong>{page === "library" ? "还没有收藏歌曲" : "搜索你想听的音乐"}</strong><span>{page === "library" ? "在搜索结果中点击心形图标，即可收藏到这里。" : "支持网易云音乐、QQ 音乐和酷狗音乐。"}</span></div>}
          </section>

          <section className="lower-grid">
            <div className="queue-card">
              <div className="section-title"><div><h2>播放队列</h2><p>{queue.length ? `${queue.length} 首歌曲` : "从搜索结果中选择歌曲"}</p></div><ListMusic size={20} /></div>
              {queue.length ? <ol className="queue-list">{queue.slice(0, 4).map((track, index) => <li key={`${track.source}-${track.id}-${index}`}><span>{index + 1}</span><button onClick={() => void playTrack(track, index)}><strong>{track.name}</strong><small>{track.singer}</small></button></li>)}</ol> : <div className="queue-empty">队列为空</div>}
            </div>
            <div className="lyrics-card">
              <div className="section-title"><div><h2>歌词</h2><p>{current ? `${current.name} · ${current.singer}` : "选择歌曲后显示"}</p></div><Music2 size={20} /></div>
              {current ? visibleLyrics.length ? <div className="lyrics-lines">{visibleLyrics.map((line, index) => <p className={index === 2 ? "current-line" : ""} key={`${line}-${index}`}>{line}</p>)}</div> : <div className="lyrics-empty">暂未获取到歌词</div> : <div className="lyrics-empty">音乐会在这里留下文字</div>}
            </div>
          </section>
        </div>
      </section>

      <footer className="player-bar">
        <audio ref={audioRef} onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)} onDurationChange={(event) => setDuration(event.currentTarget.duration)} onEnded={() => stepTrack(1)} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
        <div className="now-playing"><img src={current?.cover || DEFAULT_COVER} alt="" /><div><strong>{current?.name || "还没有播放歌曲"}</strong><small>{current ? `${current.singer} · ${current.album}` : "选择一首歌曲开始聆听"}</small></div><button className={isCurrentFavorite ? "liked" : ""} onClick={() => current && toggleFavorite(current)} disabled={!current} aria-label="收藏当前歌曲"><Heart size={18} fill={isCurrentFavorite ? "currentColor" : "none"} /></button></div>
        <div className="play-controls"><div><button onClick={() => stepTrack(-1)} disabled={!queue.length && !displayTracks.length} aria-label="上一首"><SkipBack size={19} fill="currentColor" /></button><button className="play-button" onClick={togglePlay} disabled={!current} aria-label={isPlaying ? "暂停" : "播放"}>{isPlaying ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}</button><button onClick={() => stepTrack(1)} disabled={!queue.length && !displayTracks.length} aria-label="下一首"><SkipForward size={19} fill="currentColor" /></button></div><div className="progress-row"><span>{formatTime(position)}</span><input type="range" min="0" max={duration || current?.duration || 0} value={Math.min(position, duration || current?.duration || 0)} onChange={(event) => { const next = Number(event.target.value); if (audioRef.current) audioRef.current.currentTime = next; setPosition(next); }} disabled={!current} aria-label="播放进度" /><span>{formatTime(duration || current?.duration)}</span></div></div>
        <div className="player-tools"><button aria-label="随机播放"><Shuffle size={18} /></button><button aria-label="循环播放"><Repeat2 size={18} /></button><button aria-label="音量"><Volume2 size={18} /></button><input type="range" min="0" max="1" step="0.05" defaultValue="0.8" onChange={(event) => { if (audioRef.current) audioRef.current.volume = Number(event.target.value); }} aria-label="音量" /></div>
      </footer>

      {isSettingsOpen && <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="settings-title"><button className="modal-backdrop" onClick={() => setIsSettingsOpen(false)} aria-label="关闭设置" /><form className="settings-modal" onSubmit={saveApiKey}><div className="modal-heading"><div><span className="modal-icon"><KeyRound size={20} /></span><div><h2 id="settings-title">连接 ChKSz API</h2><p>Key 仅保存于当前浏览器。</p></div></div><button type="button" onClick={() => setIsSettingsOpen(false)} aria-label="关闭"><X size={20} /></button></div><label>个人 API Key<input type="password" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} placeholder="chksz_..." autoFocus /></label><p className="modal-help">在 ChKSz 账户页创建并复制你的个人 Key。请勿将 Key 提交到代码仓库或分享给第三方。</p><div className="modal-actions"><a href="https://api.chksz.com/login" target="_blank" rel="noreferrer">前往获取 Key</a><button type="submit">保存连接</button></div></form></div>}
    </main>
  );
}

function TrackRow({ track, index, active, favorite, playing, busy, onPlay, onFavorite }: { track: Track; index: number; active: boolean; favorite: boolean; playing: boolean; busy: boolean; onPlay: () => void; onFavorite: () => void }) {
  return <article className={`track-row ${active ? "is-active" : ""}`}><button className="index-button" onClick={onPlay} disabled={busy} aria-label={`播放 ${track.name}`}>{active && playing ? <span className="mini-eq"><i /><i /><i /></span> : <><span className="track-index">{String(index + 1).padStart(2, "0")}</span><Play className="track-play" size={16} fill="currentColor" /></>}</button><button className="track-main" onClick={onPlay} disabled={busy}><img src={track.cover || DEFAULT_COVER} alt="" /><span><strong>{track.name}</strong><small>{track.singer} · {getSourceLabel(track.source)}</small></span></button><span className="track-album wide-only">{track.album}</span><time className="wide-only">{formatTime(track.duration)}</time><div className="track-actions"><button className={favorite ? "liked" : ""} onClick={onFavorite} aria-label={favorite ? "取消收藏" : "收藏"}><Heart size={17} fill={favorite ? "currentColor" : "none"} /></button><button aria-label="更多操作"><MoreHorizontal size={18} /></button></div></article>;
}

function apiErrorMessage(reason: unknown) {
  if (reason instanceof ChkszApiError) {
    if (reason.status === 401) return `授权失败：${reason.message}`;
    if (reason.status === 402) return `额度已用尽：${reason.message}`;
    if (reason.status === 403) return `访问被拒绝：${reason.message}`;
    if (reason.status === 429) return `请求过于频繁：${reason.message}${reason.retryAfter ? `，请在 ${reason.retryAfter} 秒后重试。` : ""}`;
    return reason.message;
  }
  return reason instanceof Error ? reason.message : "请求失败，请稍后再试。";
}
