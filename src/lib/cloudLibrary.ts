import { createClient, type User } from "@supabase/supabase-js";
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

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const cloudEnabled = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = cloudEnabled ? createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}) : null;

export const getCloudUser = async (): Promise<User | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
};

export const sendLoginLink = async (email: string) => {
  if (!supabase) throw new Error("云同步服务尚未配置。");
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
};

export const signOutCloud = async () => {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const loadCloudLibrary = async (userId: string): Promise<CloudLibrary | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("music_libraries")
    .select("favorites, playlists, play_mode")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    favorites: Array.isArray(data.favorites) ? data.favorites as Track[] : [],
    playlists: Array.isArray(data.playlists) ? data.playlists as CloudPlaylist[] : [],
    playMode: data.play_mode === "shuffle" || data.play_mode === "repeat-one" ? data.play_mode : "repeat-all",
  };
};

export const saveCloudLibrary = async (userId: string, library: CloudLibrary) => {
  if (!supabase) return;
  const { error } = await supabase.from("music_libraries").upsert({
    user_id: userId,
    favorites: library.favorites,
    playlists: library.playlists,
    play_mode: library.playMode,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;
};
