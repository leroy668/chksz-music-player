import { createClient } from "@supabase/supabase-js";
import type { Track } from "./musicApi";

export type CloudPlaylist = {
  id: string;
  name: string;
  tracks: Track[];
};

export type CloudLibrary = {
  favorites: Track[];
  playlists: CloudPlaylist[];
  playMode: "repeat-all" | "shuffle" | "repeat-one";
};

export type CloudAccount = {
  username: string;
};

type AuthResponse = {
  token: string;
  username: string;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const TOKEN_STORAGE_KEY = "soundfield-music-session-token";
const USERNAME_STORAGE_KEY = "soundfield-music-session-username";

export const cloudEnabled = Boolean(supabaseUrl && supabaseAnonKey);
const supabase = cloudEnabled ? createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}) : null;

const getToken = () => localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";

const normalizeAuth = (payload: unknown): AuthResponse => {
  const value = Array.isArray(payload) ? payload[0] : payload;
  if (!value || typeof value !== "object") throw new Error("账号服务返回了无效数据。");
  const record = value as Record<string, unknown>;
  const token = typeof record.token === "string" ? record.token : "";
  const username = typeof record.username === "string" ? record.username : "";
  if (!token || !username) throw new Error("账号服务未返回有效会话。");
  return { token, username };
};

const saveSession = ({ token, username }: AuthResponse): CloudAccount => {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(USERNAME_STORAGE_KEY, username);
  return { username };
};

export const getCloudAccount = async (): Promise<CloudAccount | null> => {
  if (!supabase) return null;
  const token = getToken();
  if (!token) return null;
  const { data, error } = await supabase.rpc("music_session_account", { p_token: token });
  if (error || !data) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USERNAME_STORAGE_KEY);
    return null;
  }
  const value = Array.isArray(data) ? data[0] : data;
  const username = value && typeof value === "object" && typeof (value as Record<string, unknown>).username === "string"
    ? String((value as Record<string, unknown>).username)
    : localStorage.getItem(USERNAME_STORAGE_KEY) ?? "";
  return username ? { username } : null;
};

export const loginCloud = async (username: string, password: string): Promise<CloudAccount> => {
  if (!supabase) throw new Error("云同步服务尚未配置。");
  const { data, error } = await supabase.rpc("music_login", {
    p_username: username,
    p_password: password,
  });
  if (error) throw error;
  return saveSession(normalizeAuth(data));
};

export const registerCloud = async (username: string, password: string): Promise<CloudAccount> => {
  if (!supabase) throw new Error("云同步服务尚未配置。");
  const { data, error } = await supabase.rpc("music_register", {
    p_username: username,
    p_password: password,
  });
  if (error) throw error;
  return saveSession(normalizeAuth(data));
};

export const signOutCloud = async () => {
  if (supabase && getToken()) await supabase.rpc("music_logout", { p_token: getToken() });
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USERNAME_STORAGE_KEY);
};

export const loadCloudLibrary = async (): Promise<CloudLibrary | null> => {
  if (!supabase || !getToken()) return null;
  const { data, error } = await supabase.rpc("music_load_library", { p_token: getToken() });
  if (error) throw error;
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    favorites: Array.isArray(record.favorites) ? record.favorites as Track[] : [],
    playlists: Array.isArray(record.playlists) ? record.playlists as CloudPlaylist[] : [],
    playMode: record.play_mode === "shuffle" || record.play_mode === "repeat-one" ? record.play_mode : "repeat-all",
  };
};

export const saveCloudLibrary = async (library: CloudLibrary) => {
  if (!supabase || !getToken()) return;
  const { error } = await supabase.rpc("music_save_library", {
    p_token: getToken(),
    p_favorites: library.favorites,
    p_playlists: library.playlists,
    p_play_mode: library.playMode,
  });
  if (error) throw error;
};
