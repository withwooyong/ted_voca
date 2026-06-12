import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { LearningGoal, UserProfile } from '@ted-voca/shared';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

type AuthUser = { id: string; email: string };

type AuthState = {
  user: AuthUser | null;
  profile: UserProfile | null;
  isHydrated: boolean;
  isLoading: boolean;
  setHydrated: (value: boolean) => void;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  completeOnboarding: (goal: LearningGoal, dailyGoalMinutes: 5 | 10 | 20) => Promise<void>;
};

const MOCK_PROFILE_KEY = 'ted_voca_mock_profile';
const MOCK_USER_KEY = 'ted_voca_mock_user';

function defaultProfile(userId: string, displayName?: string): UserProfile {
  return {
    id: userId,
    display_name: displayName ?? null,
    goal: 'exam',
    daily_goal_minutes: 10,
    onboarding_complete: false,
    xp: 0,
    streak: 0,
    level: 1,
  };
}

async function loadMockUser(): Promise<AuthUser | null> {
  const raw = await AsyncStorage.getItem(MOCK_USER_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

async function saveMockUser(user: AuthUser | null) {
  if (user) {
    await AsyncStorage.setItem(MOCK_USER_KEY, JSON.stringify(user));
  } else {
    await AsyncStorage.removeItem(MOCK_USER_KEY);
  }
}

async function loadMockProfile(userId: string): Promise<UserProfile> {
  const raw = await AsyncStorage.getItem(MOCK_PROFILE_KEY);
  if (raw) return JSON.parse(raw) as UserProfile;
  return defaultProfile(userId);
}

async function saveMockProfile(profile: UserProfile) {
  await AsyncStorage.setItem(MOCK_PROFILE_KEY, JSON.stringify(profile));
}

async function fetchProfile(userId: string): Promise<UserProfile> {
  const supabase = getSupabase();
  if (!supabase) return loadMockProfile(userId);

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) return defaultProfile(userId);
  return data as UserProfile;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      isHydrated: false,
      isLoading: false,

      setHydrated: (value) => set({ isHydrated: value }),

      initialize: async () => {
        set({ isLoading: true });
        try {
          const supabase = getSupabase();
          if (supabase) {
            const { data } = await supabase.auth.getSession();
            const sessionUser = data.session?.user;
            if (sessionUser) {
              const profile = await fetchProfile(sessionUser.id);
              set({
                user: { id: sessionUser.id, email: sessionUser.email ?? '' },
                profile,
              });
            }
          } else {
            const mockUser = await loadMockUser();
            if (mockUser) {
              const profile = await loadMockProfile(mockUser.id);
              set({ user: mockUser, profile });
            }
          }
        } finally {
          set({ isLoading: false, isHydrated: true });
        }
      },

      signIn: async (email, password) => {
        set({ isLoading: true });
        try {
          const supabase = getSupabase();
          if (supabase) {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            const user = data.user!;
            const profile = await fetchProfile(user.id);
            set({ user: { id: user.id, email: user.email ?? email }, profile });
            return;
          }

          const mockUser = { id: `mock-${email}`, email };
          await saveMockUser(mockUser);
          const profile = await loadMockProfile(mockUser.id);
          profile.display_name = email.split('@')[0];
          await saveMockProfile(profile);
          set({ user: mockUser, profile });
        } finally {
          set({ isLoading: false });
        }
      },

      signUp: async (email, password, displayName) => {
        set({ isLoading: true });
        try {
          const supabase = getSupabase();
          if (supabase) {
            const { data, error } = await supabase.auth.signUp({
              email,
              password,
              options: { data: { display_name: displayName } },
            });
            if (error) throw error;
            const user = data.user!;
            const profile = await fetchProfile(user.id);
            profile.display_name = displayName;
            set({ user: { id: user.id, email: user.email ?? email }, profile });
            return;
          }

          const mockUser = { id: `mock-${email}`, email };
          const profile = defaultProfile(mockUser.id, displayName);
          await saveMockUser(mockUser);
          await saveMockProfile(profile);
          set({ user: mockUser, profile });
        } finally {
          set({ isLoading: false });
        }
      },

      signOut: async () => {
        const supabase = getSupabase();
        if (supabase) await supabase.auth.signOut();
        await saveMockUser(null);
        set({ user: null, profile: null });
      },

      completeOnboarding: async (goal, dailyGoalMinutes) => {
        const { user, profile } = get();
        if (!user || !profile) return;

        const updated: UserProfile = {
          ...profile,
          goal,
          daily_goal_minutes: dailyGoalMinutes,
          onboarding_complete: true,
        };

        const supabase = getSupabase();
        if (supabase) {
          await supabase.from('profiles').update({
            goal,
            daily_goal_minutes: dailyGoalMinutes,
            onboarding_complete: true,
          }).eq('id', user.id);
        } else {
          await saveMockProfile(updated);
        }

        set({ profile: updated });
      },
    }),
    {
      name: 'ted-voca-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: () => ({}),
    },
  ),
);

export function getAuthModeLabel() {
  return isSupabaseConfigured ? 'Supabase' : 'Dev Mock';
}
