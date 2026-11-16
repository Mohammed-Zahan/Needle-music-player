import React, { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Search, Upload, Link2, Volume2, Volume1, VolumeX, Trash2, ImagePlus, Radio, Plus, Loader2, ChevronsLeft, ChevronsRight, Sun, Moon, Check } from "lucide-react";

// ---------- IndexedDB helpers ----------
const DB_NAME = "needle-db";
const DB_VERSION = 2;
const STORE_TRACKS = "tracks";
const STORE_COVERS = "covers";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_TRACKS)) db.createObjectStore(STORE_TRACKS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_COVERS)) db.createObjectStore(STORE_COVERS, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(store, record) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) { console.error(e); return false; }
}
async function idbGetAll(store) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { console.error(e); return []; }
}
async function idbDelete(store, id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) { console.error(e); return false; }
}

// ---------- helpers ----------
function extractYouTubeId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function splitName(name) {
  if (name.includes(" - ")) {
    const [a, b] = name.split(" - ");
    return { artist: a.trim(), title: b.trim() };
  }
  return { artist: null, title: name };
}
function decodeHtml(html) {
  if (!html) return html;
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
}
const PALETTES = [
  ["#ffd60a", "#8a5a00"], ["#ffb703", "#7a4a00"], ["#ffe066", "#6b5200"],
  ["#f2c53d", "#5c4300"], ["#ffda6b", "#775b00"], ["#f7d154", "#6e5100"],
];
function paletteFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

// ---------- free, no-key lookup for a pasted video's real title/author ----------
async function fetchYouTubeMeta(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`);
    if (!res.ok) return null;
    const data = await res.json();
    return { title: decodeHtml(data.title), author: decodeHtml(data.author_name) };
  } catch {
    return null;
  }
}

// ---------- YouTube Music search via the real YouTube Data API v3 ----------
async function searchYouTubeMusic(query) {
  const key = import.meta.env.VITE_YOUTUBE_API_KEY;
  if (!key) throw new Error("missing-key");
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=8&type=video&videoCategoryId=10&q=${encodeURIComponent(query)}&key=${key}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data?.error?.errors?.[0]?.reason || data?.error?.status || res.status;
    console.error("YouTube search failed:", res.status, reason, data?.error?.message);
    throw new Error(`yt-${reason}`);
  }
  return (data.items || [])
    .filter((item) => item.id && item.id.videoId)
    .map((item) => ({
      videoId: item.id.videoId,
      title: decodeHtml(item.snippet.title),
      artist: decodeHtml(item.snippet.channelTitle),
    }));
}

export default function NeedlePlayer() {
  const [tracks, setTracks] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [query, setQuery] = useState("");
  const [showYtInput, setShowYtInput] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [ytError, setYtError] = useState("");
  const [ytBusy, setYtBusy] = useState(false);
  const [ytReady, setYtReady] = useState(false);
  const [dbLoaded, setDbLoaded] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchingRef = useRef(false);
  const searchCache = useRef(new Map());

  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState("dark");

  const audioRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const pollRef = useRef(null);
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const pendingCoverId = useRef(null);
  const shellRef = useRef(null);

  const current = tracks.find((t) => t.id === currentId) || null;
  const filtered = tracks.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()));

  // ---- auto-collapse sidebar like Spotify when the window gets narrow ----
  useEffect(() => {
    const el = shellRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w < 640) setCollapsed(true);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    (async () => {
      const [storedTracks, storedCovers] = await Promise.all([idbGetAll(STORE_TRACKS), idbGetAll(STORE_COVERS)]);
      const coverMap = {};
      storedCovers.forEach((c) => { coverMap[c.id] = URL.createObjectURL(c.blob); });
      if (storedTracks.length) {
        const restored = storedTracks.sort((a, b) => a.addedAt - b.addedAt).map((r) => ({
          id: r.id, name: r.name, type: "local",
          url: URL.createObjectURL(r.blob), duration: r.duration || 0, addedAt: r.addedAt,
          coverUrl: coverMap[r.id] || null,
        }));
        setTracks(restored);
      }
      setDbLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (window.YT && window.YT.Player) { setYtReady(true); return; }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { setYtReady(true); if (prev) prev(); };
  }, []);

  useEffect(() => {
    if (!ytReady || ytPlayerRef.current) return;
    ytPlayerRef.current = new window.YT.Player("needle-yt-target", {
      height: "0", width: "0", playerVars: { playsinline: 1 },
      events: {
        onStateChange: (e) => {
          if (e.data === window.YT.PlayerState.ENDED) handleEnded();
          if (e.data === window.YT.PlayerState.PLAYING) setIsPlaying(true);
          if (e.data === window.YT.PlayerState.PAUSED) setIsPlaying(false);
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytReady]);

  useEffect(() => {
    clearInterval(pollRef.current);
    if (current?.type === "youtube" && isPlaying) {
      pollRef.current = setInterval(() => {
        const p = ytPlayerRef.current;
        if (p && p.getCurrentTime) {
          setCurrentTime(p.getCurrentTime());
          setDuration(p.getDuration() || 0);
        }
      }, 300);
    }
    return () => clearInterval(pollRef.current);
  }, [current, isPlaying]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    if (ytPlayerRef.current?.setVolume) ytPlayerRef.current.setVolume(volume * 100);
  }, [volume]);

  const handleEnded = useCallback(() => {
    playNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, currentId]);

  function loadTrack(track, autoplay) {
    if (!track) return;
    if (track.type === "local") {
      ytPlayerRef.current?.stopVideo?.();
      requestAnimationFrame(() => {
        if (audioRef.current) {
          audioRef.current.src = track.url;
          audioRef.current.currentTime = 0;
          if (autoplay) audioRef.current.play().catch(() => {});
        }
      });
    } else if (track.type === "youtube") {
      audioRef.current?.pause();
      if (ytPlayerRef.current?.loadVideoById) {
        if (autoplay) ytPlayerRef.current.loadVideoById(track.videoId);
        else ytPlayerRef.current.cueVideoById(track.videoId);
        ytPlayerRef.current.setVolume(volume * 100);
      }
    }
    setCurrentTime(0);
    setDuration(track.duration || 0);
    setIsPlaying(!!autoplay);
  }

  function selectTrack(track) { setCurrentId(track.id); loadTrack(track, true); }

  function togglePlay() {
    if (!current) return;
    if (current.type === "local") {
      if (isPlaying) audioRef.current?.pause(); else audioRef.current?.play().catch(() => {});
    } else if (current.type === "youtube") {
      if (isPlaying) ytPlayerRef.current?.pauseVideo?.(); else ytPlayerRef.current?.playVideo?.();
    }
    setIsPlaying((p) => !p);
  }

  function playNext() {
    if (!tracks.length) return;
    const idx = tracks.findIndex((t) => t.id === currentId);
    const next = tracks[(idx + 1) % tracks.length];
    setCurrentId(next.id); loadTrack(next, true);
  }
  function playPrev() {
    if (!tracks.length) return;
    const idx = tracks.findIndex((t) => t.id === currentId);
    const prev = tracks[(idx - 1 + tracks.length) % tracks.length];
    setCurrentId(prev.id); loadTrack(prev, true);
  }
  function seek(pct) {
    const target = pct * (duration || 0);
    if (current?.type === "local" && audioRef.current) audioRef.current.currentTime = target;
    else if (current?.type === "youtube" && ytPlayerRef.current?.seekTo) ytPlayerRef.current.seekTo(target, true);
    setCurrentTime(target);
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("audio/"));
    for (const file of files) {
      const id = uid();
      const url = URL.createObjectURL(file);
      const dur = await new Promise((resolve) => {
        const a = new Audio(url);
        a.onloadedmetadata = () => resolve(a.duration);
        a.onerror = () => resolve(0);
      });
      const name = file.name.replace(/\.[^/.]+$/, "");
      const record = { id, name, blob: file, duration: dur, addedAt: Date.now() };
      await idbPut(STORE_TRACKS, record);
      setTracks((prev) => [...prev, { id, name, type: "local", url, duration: dur, addedAt: record.addedAt, coverUrl: null }]);
    }
  }

  async function addYouTube() {
    const vid = extractYouTubeId(ytUrl);
    if (!vid) { setYtError("can't parse that — paste a full youtube link or 11-char id"); return; }
    setYtBusy(true);
    setYtError("");
    const meta = await fetchYouTubeMeta(vid);
    const name = meta ? `${meta.author} - ${meta.title}` : `stream ${vid}`;
    const id = uid();
    setTracks((prev) => [...prev, { id, name, type: "youtube", videoId: vid, duration: 0, addedAt: Date.now(), coverUrl: `https://img.youtube.com/vi/${vid}/mqdefault.jpg` }]);
    setYtUrl(""); setYtBusy(false); setShowYtInput(false);
  }

  async function removeTrack(id) {
    const t = tracks.find((x) => x.id === id);
    if (t?.type === "local") { await idbDelete(STORE_TRACKS, id); await idbDelete(STORE_COVERS, id); }
    setTracks((prev) => prev.filter((x) => x.id !== id));
    if (currentId === id) {
      audioRef.current?.pause();
      ytPlayerRef.current?.stopVideo?.();
      setCurrentId(null); setIsPlaying(false); setCurrentTime(0); setDuration(0);
    }
  }

  function openCoverPicker(trackId) {
    pendingCoverId.current = trackId;
    coverInputRef.current?.click();
  }
  async function handleCoverFile(e) {
    const file = e.target.files?.[0];
    const trackId = pendingCoverId.current;
    if (!file || !trackId) return;
    const url = URL.createObjectURL(file);
    const t = tracks.find((x) => x.id === trackId);
    if (t?.type === "local") await idbPut(STORE_COVERS, { id: trackId, blob: file });
    setTracks((prev) => prev.map((x) => (x.id === trackId ? { ...x, coverUrl: url } : x)));
    e.target.value = "";
  }

  async function runSearch() {
    const q = searchQuery.trim();
    if (!q || searchingRef.current) return;

    const cached = searchCache.current.get(q.toLowerCase());
    if (cached) {
      setSearchError("");
      setSearchResults(cached);
      return;
    }

    searchingRef.current = true;
    setSearching(true);
    setSearchError("");
    setSearchResults([]);
    try {
      const results = await searchYouTubeMusic(q);
      if (!results.length) setSearchError("no matches found — try a different query.");
      else searchCache.current.set(q.toLowerCase(), results);
      setSearchResults(results);
    } catch (err) {
      console.error(err);
      if (err.message === "missing-key") {
        setSearchError("no YouTube API key found — add VITE_YOUTUBE_API_KEY to your .env file and restart npm run dev.");
      } else if (err.message === "yt-quotaExceeded") {
        setSearchError("daily YouTube API quota used up — resets at midnight Pacific.");
      } else {
        setSearchError(`search failed (${err.message}) — see console.`);
      }
    } finally {
      searchingRef.current = false;
      setSearching(false);
    }
  }

  function addSearchResult(result, autoplay) {
    const existing = tracks.find((t) => t.type === "youtube" && t.videoId === result.videoId);
    if (existing) {
      // already in the library: don't add a copy, just play it if the row was clicked
      if (autoplay) { setCurrentId(existing.id); loadTrack(existing, true); }
      else setSearchError("already in your library.");
      return;
    }
    const id = uid();
    const name = result.artist ? `${result.artist} - ${result.title}` : result.title;
    const track = {
      id, name, type: "youtube", videoId: result.videoId, duration: 0,
      addedAt: Date.now(), coverUrl: `https://img.youtube.com/vi/${result.videoId}/mqdefault.jpg`,
    };
    setTracks((prev) => [...prev, track]);
    if (autoplay) { setCurrentId(id); loadTrack(track, true); }
  }

  const progressPct = duration ? (currentTime / duration) * 100 : 0;
  const VolIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const meta = current ? splitName(current.name) : null;
  const palette = current ? paletteFor(current.id) : ["#ffd60a", "#8a5a00"];

  return (
    <div className={`np-root ${theme === "light" ? "light" : ""}`}>
      <style>{`
        html, body, #root {
          height: 100%;
          margin: 0;
          overflow: hidden;
          background: #0b0b0d;
        }

        .np-root {
          --accent: #ffd60a;
          --accent-2: #e6b800;
          --bg: #0b0b0d;
          --panel: #141416;
          --panel-2: #1c1c1f;
          --border: #29292d;
          --text: #f2f1ee;
          --text-dim: #8c8b90;
          font-family: 'Inter', sans-serif;
          position: fixed;
          inset: 0;
          background: var(--bg);
          border: 4px solid var(--accent);
          border-radius: 10px;
          box-sizing: border-box;
          display: grid;
          grid-template-rows: 1fr auto;
          overflow: hidden;
          transition: background 0.25s, color 0.25s;
        }

        .np-root.light {
          --bg: #f6f3ec;
          --panel: #ffffff;
          --panel-2: #efeae0;
          --border: #ddd6c6;
          --text: #23201a;
          --text-dim: #837c6c;
        }
        .np-root.light .np-vinyl-disc {
          background: repeating-radial-gradient(circle at center, #2a2a2e 0px, #2a2a2e 2px, #141416 2px, #141416 4px);
        }
        .np-root.light .np-vinyl-label-dot,
        .np-root.light .np-vinyl-label { box-shadow: 0 0 0 3px #141416; }

        .np-body {
          display: grid;
          min-height: 0;
          transition: grid-template-columns 0.28s cubic-bezier(.4,0,.2,1);
        }

        /* ---------- sidebar ---------- */
        .np-sidebar {
          background: var(--panel);
          border-right: 1px solid var(--border);
          border-top-left-radius: 6px;
          display: flex;
          flex-direction: column;
          min-height: 0;
          min-width: 0;
          overflow: hidden;
        }
        .np-sidebar-top {
          padding: 18px 16px 14px;
          flex-shrink: 0;
        }
        .np-brand-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .np-brand { font-family: 'Fraunces', serif; font-weight: 700; font-size: 18px; color: var(--text); display: flex; align-items: center; gap: 8px; white-space: nowrap; overflow: hidden; }
        .np-brand .np-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 10px var(--accent); flex-shrink: 0; }
        .np-collapse-btn { background: none; border: none; color: var(--text-dim); cursor: pointer; flex-shrink: 0; display: flex; }
        .np-collapse-btn:hover { color: var(--accent); }

        .np-search { background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
        .np-search input { background: transparent; border: none; outline: none; color: var(--text); font-size: 13px; width: 100%; font-family: 'Inter', sans-serif; min-width: 0; }
        .np-search input::placeholder { color: var(--text-dim); }

        .np-sidebar-mid {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 6px 16px;
        }
        .np-sidebar-mid::-webkit-scrollbar { width: 8px; }
        .np-sidebar-mid::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
        .np-section-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-dim); margin: 10px 2px 8px; white-space: nowrap; }
        .np-row { display: flex; align-items: center; gap: 10px; padding: 7px; border-radius: 8px; cursor: pointer; font-size: 12.5px; color: var(--text); }
        .np-row:hover { background: var(--panel-2); }
        .np-row.active { background: rgba(255,214,10,0.1); color: var(--accent); }
        .np-row-swatch { width: 30px; height: 30px; border-radius: 7px; flex-shrink: 0; background-size: cover; background-position: center; }
        .np-row-text { flex: 1; overflow: hidden; min-width: 0; }
        .np-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .np-row-sub { font-size: 10.5px; color: var(--text-dim); }
        .np-row-actions { display: flex; gap: 2px; opacity: 0; flex-shrink: 0; }
        .np-row:hover .np-row-actions { opacity: 1; }
        .np-row-icon-btn { background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 3px; }
        .np-row-icon-btn:hover { color: var(--accent); }
        .np-empty { font-size: 12px; color: var(--text-dim); padding: 8px 2px; }

        .np-sidebar-bottom {
          flex-shrink: 0;
          padding: 12px 16px 16px;
          border-top: 1px solid var(--border);
        }
        .np-add-btn { background: var(--panel-2); border: 1px dashed var(--border); color: var(--text-dim); border-radius: 8px; padding: 8px 10px; font-size: 11.5px; cursor: pointer; display: flex; align-items: center; gap: 6px; margin-top: 6px; width: 100%; white-space: nowrap; overflow: hidden; }
        .np-add-btn:hover { border-color: var(--accent); color: var(--accent); }
        .np-add-btn:disabled { opacity: 0.5; cursor: default; }
        .np-yt-form { display: flex; gap: 6px; margin-top: 8px; }
        .np-yt-form input { flex: 1; background: var(--panel-2); border: 1px solid var(--border); border-radius: 7px; color: var(--text); font-size: 11.5px; padding: 7px 8px; min-width: 0; }
        .np-yt-error { font-size: 10.5px; color: var(--accent); margin-top: 5px; }
        .np-searchpanel { margin-top: 10px; }
        .np-searchpanel-title { font-size: 10.5px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-dim); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
        .np-search-results { display: flex; flex-direction: column; gap: 3px; max-height: 180px; overflow-y: auto; margin-top: 8px; }
        .np-search-row { display: flex; align-items: center; gap: 9px; padding: 6px; border-radius: 8px; cursor: pointer; }
        .np-search-row:hover { background: var(--panel-2); }
        .np-search-thumb { width: 40px; height: 26px; border-radius: 5px; object-fit: cover; flex-shrink: 0; background: var(--panel-2); }
        .np-search-text { flex: 1; overflow: hidden; min-width: 0; }
        .np-search-title { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
        .np-search-artist { font-size: 10px; color: var(--text-dim); }
        .np-search-add { background: rgba(255,214,10,0.15); border: none; color: var(--accent); border-radius: 6px; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
        .np-search-status { font-size: 11.5px; color: var(--text-dim); display: flex; align-items: center; gap: 6px; padding: 6px 2px; }
        .np-spin { animation: np-rotate 0.9s linear infinite; }

        /* ---------- collapsed sidebar (icon rail) ---------- */
        .np-sidebar.collapsed .np-brand span:not(.np-dot),
        .np-sidebar.collapsed .np-search input,
        .np-sidebar.collapsed .np-section-label,
        .np-sidebar.collapsed .np-row-text,
        .np-sidebar.collapsed .np-row-actions,
        .np-sidebar.collapsed .np-add-btn span,
        .np-sidebar.collapsed .np-searchpanel {
          display: none;
        }
        .np-sidebar.collapsed .np-search { justify-content: center; padding: 8px; }
        .np-sidebar.collapsed .np-row { justify-content: center; }
        .np-sidebar.collapsed .np-add-btn { justify-content: center; }
        .np-sidebar.collapsed .np-brand-row { justify-content: center; }

        /* ---------- stage ---------- */
        .np-stage {
          position: relative;
          background: radial-gradient(circle at 30% 20%, rgba(255,214,10,0.10), transparent 55%), var(--bg);
          padding: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 44px;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
          border-top-right-radius: 6px;
        }
        @media (max-width: 780px) {
          .np-stage { flex-direction: column; gap: 24px; }
        }
        @media (max-width: 480px) {
          .np-vinyl-zone { display: none; }
          .np-stage { padding: 20px; }
          .np-album-card { width: min(280px, 82vw); }
        }

        .np-vinyl-zone { display: flex; flex-direction: column; align-items: center; gap: 12px; flex-shrink: 0; }
        .np-vinyl-plate { width: 240px; height: 240px; position: relative; }
        .np-vinyl-disc {
          width: 100%; height: 100%; border-radius: 50%;
          background: repeating-radial-gradient(circle at center, #1e1e22 0px, #1e1e22 2px, #0a0a0c 2px, #0a0a0c 4px);
          box-shadow: 0 0 0 1px var(--border), 0 20px 50px rgba(0,0,0,0.55), inset 0 0 30px rgba(0,0,0,0.6);
          display: flex; align-items: center; justify-content: center;
          animation: np-spin 3s linear infinite; animation-play-state: paused;
        }
        .np-vinyl-disc.spin { animation-play-state: running; box-shadow: 0 0 0 1px var(--border), 0 0 60px rgba(255,214,10,0.18), 0 20px 50px rgba(0,0,0,0.55), inset 0 0 30px rgba(0,0,0,0.6); }
        @media (prefers-reduced-motion: reduce) { .np-vinyl-disc.spin { animation-duration: 14s; } }
        .np-vinyl-label { width: 88px; height: 88px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 3px #0a0a0c; background-size: cover; background-position: center; }
        .np-vinyl-label-dot { width: 9px; height: 9px; border-radius: 50%; background: #0a0a0c; }
        .np-tonearm { position: absolute; top: -20px; right: -18px; width: 136px; height: 136px; transform-origin: 118px 14px; transform: rotate(-24deg); transition: transform 0.5s cubic-bezier(.34,1.56,.64,1); }
        .np-tonearm.down { transform: rotate(2deg); }

        .np-album-card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 22px;
          width: 240px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 14px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        .np-album-art { width: 100%; aspect-ratio: 1; border-radius: 11px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); background-size: cover; background-position: center; position: relative; overflow: hidden; }
        .np-album-art.playing::after { content: ""; position: absolute; inset: 0; box-shadow: inset 0 0 0 3px var(--accent); border-radius: 11px; }
        .np-album-title { font-family: 'Fraunces', serif; font-weight: 700; font-size: 20px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .np-album-artist { font-size: 12px; color: var(--text-dim); letter-spacing: 0.5px; text-transform: uppercase; }
        .np-cover-btn { align-self: flex-start; background: var(--panel-2); border: 1px solid var(--border); color: var(--text-dim); font-size: 10.5px; border-radius: 6px; padding: 5px 9px; display: flex; align-items: center; gap: 5px; cursor: pointer; }
        .np-cover-btn:hover { color: var(--accent); border-color: var(--accent); }

        /* ---------- control bar ---------- */
        .np-controlbar { background: var(--panel); border-top: 1px solid var(--border); padding: 16px 28px; display: flex; align-items: center; gap: 22px; border-bottom-left-radius: 6px; border-bottom-right-radius: 6px; }
        .np-transport { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
        .np-icon-btn { background: none; border: none; color: var(--text-dim); cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .np-icon-btn:hover { color: var(--text); }
        .np-icon-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 50%; }
        .np-play-btn { width: 44px; height: 44px; border-radius: 50%; background: var(--accent); color: #0b0b0d; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; box-shadow: 0 0 20px rgba(255,214,10,0.35); }
        .np-play-btn:hover { background: var(--accent-2); }
        .np-timeline { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; }
        .np-time { font-size: 11px; color: var(--text-dim); width: 34px; flex-shrink: 0; }
        .np-time.end { text-align: right; }
        .np-progress { flex: 1; height: 5px; border-radius: 3px; background: var(--panel-2); cursor: pointer; position: relative; min-width: 40px; }
        .np-progress-fill { height: 100%; border-radius: 3px; background: var(--accent); position: relative; }
        .np-progress-fill::after { content: ""; position: absolute; right: -5px; top: 50%; transform: translateY(-50%); width: 11px; height: 11px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px rgba(255,214,10,0.25); }
        .np-vol { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .np-vol input[type=range] { width: 76px; accent-color: var(--accent); }
        @media (max-width: 560px) { .np-vol { display: none; } }

        @keyframes np-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes np-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div className="np-body" ref={shellRef} style={{ gridTemplateColumns: `${collapsed ? 72 : 260}px 1fr` }}>
        <aside className={`np-sidebar ${collapsed ? "collapsed" : ""}`}>
          <div className="np-sidebar-top">
            <div className="np-brand-row">
              <div className="np-brand"><span className="np-dot" /><span>needle.</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button className="np-collapse-btn" onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))} aria-label="toggle theme">
                  {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
                </button>
                <button className="np-collapse-btn" onClick={() => setCollapsed((c) => !c)} aria-label="toggle sidebar">
                  {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
                </button>
              </div>
            </div>
            <div className="np-search">
              <Search size={14} color="var(--text-dim)" />
              <input placeholder="Search library" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>

          <div className="np-sidebar-mid">
            <div className="np-section-label">{dbLoaded ? `Library — ${tracks.length}` : "Loading…"}</div>
            {filtered.length === 0 && dbLoaded && (
              <div className="np-empty">nothing here yet — import a file or search below.</div>
            )}
            {filtered.map((t) => {
              const [c1, c2] = paletteFor(t.id);
              const info = splitName(t.name);
              const swatchStyle = t.coverUrl
                ? { backgroundImage: `url(${t.coverUrl})` }
                : { background: `linear-gradient(135deg, ${c1}, ${c2})` };
              return (
                <div key={t.id} className={`np-row ${t.id === currentId ? "active" : ""}`} onClick={() => selectTrack(t)} title={info.title}>
                  <div className="np-row-swatch" style={swatchStyle} />
                  <div className="np-row-text">
                    <div className="np-row-title">{info.title}</div>
                    <div className="np-row-sub">{t.type === "local" ? (info.artist || "local file") : (info.artist || "stream")}</div>
                  </div>
                  <div className="np-row-actions">
                    <button className="np-row-icon-btn" onClick={(e) => { e.stopPropagation(); openCoverPicker(t.id); }} aria-label="set cover image">
                      <ImagePlus size={13} />
                    </button>
                    <button className="np-row-icon-btn" onClick={(e) => { e.stopPropagation(); removeTrack(t.id); }} aria-label={`remove ${t.name}`}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="np-sidebar-bottom">
            <input ref={fileInputRef} type="file" accept="audio/*" multiple hidden onChange={(e) => e.target.files && handleFiles(e.target.files)} />
            <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={handleCoverFile} />

            <button className="np-add-btn" onClick={() => fileInputRef.current?.click()} title="import local file">
              <Upload size={12} /> <span>import local file</span>
            </button>
            <button className="np-add-btn" onClick={() => setShowYtInput((v) => !v)} title="paste stream url">
              <Link2 size={12} /> <span>paste stream url</span>
            </button>
            {showYtInput && !collapsed && (
              <div>
                <div className="np-yt-form">
                  <input placeholder="youtube url or id" value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addYouTube()} />
                  <button className="np-add-btn" style={{ width: "auto", marginTop: 0 }} onClick={addYouTube} disabled={ytBusy}>
                    {ytBusy ? <Loader2 size={12} className="np-spin" /> : "add"}
                  </button>
                </div>
                {ytError && <div className="np-yt-error">{ytError}</div>}
              </div>
            )}

            {!collapsed && (
              <div className="np-searchpanel">
                <div className="np-searchpanel-title"><Radio size={13} /> Search YouTube Music</div>
                <div className="np-yt-form">
                  <input
                    placeholder="song, artist, mood…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  />
                  <button className="np-add-btn" style={{ width: "auto", marginTop: 0 }} onClick={runSearch} disabled={searching}>
                    {searching ? <Loader2 size={12} className="np-spin" /> : "go"}
                  </button>
                </div>
                {searching && <div className="np-search-status"><Loader2 size={13} className="np-spin" /> searching…</div>}
                {searchError && <div className="np-yt-error">{searchError}</div>}
                {searchResults.length > 0 && (
                  <div className="np-search-results">
                    {searchResults.map((r) => {
                      const inLibrary = tracks.some((t) => t.type === "youtube" && t.videoId === r.videoId);
                      return (
                      <div key={r.videoId} className="np-search-row" onClick={() => addSearchResult(r, true)}>
                        <img className="np-search-thumb" src={`https://img.youtube.com/vi/${r.videoId}/default.jpg`} alt="" />
                        <div className="np-search-text">
                          <div className="np-search-title">{r.title}</div>
                          <div className="np-search-artist">{r.artist || "unknown artist"}</div>
                        </div>
                        <button className="np-search-add" onClick={(e) => { e.stopPropagation(); addSearchResult(r, false); }} aria-label={inLibrary ? "already in library" : "add to library"} disabled={inLibrary}>
                          {inLibrary ? <Check size={13} /> : <Plus size={13} />}
                        </button>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        <div className="np-stage">
          <div className="np-vinyl-zone">
            <div className="np-vinyl-plate">
              <div className={`np-vinyl-disc ${isPlaying ? "spin" : ""}`}>
                <div
                  className="np-vinyl-label"
                  style={current?.coverUrl ? { backgroundImage: `url(${current.coverUrl})` } : { background: `radial-gradient(circle at 35% 30%, ${palette[0]}, ${palette[1]} 75%)` }}
                >
                  {!current?.coverUrl && <div className="np-vinyl-label-dot" />}
                </div>
              </div>
              <div className={`np-tonearm ${isPlaying ? "down" : ""}`}>
                <svg width="136" height="136" viewBox="0 0 136 136">
                  <circle cx="118" cy="14" r="8" fill="none" stroke="rgba(242,241,238,0.35)" strokeWidth="2" />
                  <line x1="118" y1="14" x2="26" y2="102" stroke="rgba(242,241,238,0.55)" strokeWidth="4" strokeLinecap="round" />
                  <circle cx="26" cy="102" r="5.5" fill="var(--accent)" />
                </svg>
              </div>
            </div>
          </div>

          <div className="np-album-card">
            <div
              className={`np-album-art ${isPlaying ? "playing" : ""}`}
              style={current?.coverUrl ? { backgroundImage: `url(${current.coverUrl})` } : { background: `linear-gradient(150deg, ${palette[0]}, ${palette[1]})` }}
            />
            <div>
              <div className="np-album-title">{meta ? meta.title : "Nothing playing"}</div>
              <div className="np-album-artist">{meta ? (meta.artist || (current.type === "youtube" ? "streaming" : "local file")) : "pick a track"}</div>
            </div>
            {current && (
              <button className="np-cover-btn" onClick={() => openCoverPicker(current.id)}>
                <ImagePlus size={12} /> {current.coverUrl ? "change cover" : "add cover image"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="np-controlbar">
        <div className="np-transport">
          <button className="np-icon-btn" onClick={playPrev} aria-label="previous"><SkipBack size={18} fill="currentColor" /></button>
          <button className="np-play-btn" onClick={togglePlay} aria-label={isPlaying ? "pause" : "play"}>
            {isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
          </button>
          <button className="np-icon-btn" onClick={playNext} aria-label="next"><SkipForward size={18} fill="currentColor" /></button>
        </div>

        <div className="np-timeline">
          <span className="np-time">{fmtTime(currentTime)}</span>
          <div className="np-progress" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); seek(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))); }}>
            <div className="np-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="np-time end">{fmtTime(duration)}</span>
        </div>

        <div className="np-vol">
          <VolIcon size={15} color="var(--text-dim)" />
          <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} aria-label="volume" />
        </div>
      </div>

      <audio ref={audioRef} onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)} onEnded={handleEnded} hidden />
      <div id="needle-yt-target" style={{ display: "none" }} />
    </div>
  );
}