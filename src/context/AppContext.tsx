import { supabase } from "@/lib/supabase/client";
import {
  fetchCashback,
  fetchFridge,
  fetchHousehold,
  fetchHouseholdProfiles,
  fetchMealPlans,
  fetchProfile,
} from "@/lib/supabase/api";
import type { CashbackRuleRow, FridgeItem, Household, MealPlanRow, Profile } from "@/lib/supabase/types";
import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface AppState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  household: Household | null;
  members: Profile[];
  cashback: CashbackRuleRow[];
  fridge: FridgeItem[];
  plans: MealPlanRow[];
  latestPlan: MealPlanRow | null;
  error: string | null;
  offlineCache: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);
const CACHE_KEY = "menu-for-us-cache";

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [cashback, setCashback] = useState<CashbackRuleRow[]>([]);
  const [fridge, setFridge] = useState<FridgeItem[]>([]);
  const [plans, setPlans] = useState<MealPlanRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offlineCache, setOfflineCache] = useState(false);

  async function loadAll(current: Session | null) {
    if (!current || !supabase) {
      setProfile(null);
      setHousehold(null);
      setMembers([]);
      setCashback([]);
      setFridge([]);
      setPlans([]);
      return;
    }
    try {
      const nextProfile = await fetchProfile(current.user.id);
      setProfile(nextProfile);
      if (nextProfile?.household_id) {
        const [nextHousehold, nextMembers, nextCashback, nextPlans, nextFridge] = await Promise.all([
          fetchHousehold(nextProfile.household_id),
          fetchHouseholdProfiles(nextProfile.household_id),
          fetchCashback(nextProfile.household_id),
          fetchMealPlans(nextProfile.household_id),
          fetchFridge(nextProfile.household_id),
        ]);
        setHousehold(nextHousehold);
        setMembers(nextMembers);
        setCashback(nextCashback);
        setPlans(nextPlans);
        setFridge(nextFridge);
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ nextProfile, nextHousehold, nextMembers, nextCashback, nextPlans, nextFridge }),
        );
      } else {
        setHousehold(null);
        setMembers(nextProfile ? [nextProfile] : []);
        setCashback([]);
        setFridge([]);
        setPlans([]);
      }
      setOfflineCache(false);
      setError(null);
    } catch (err) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as {
          nextProfile: Profile;
          nextHousehold: Household;
          nextMembers: Profile[];
          nextCashback: CashbackRuleRow[];
          nextPlans: MealPlanRow[];
          nextFridge?: FridgeItem[];
        };
        setProfile(parsed.nextProfile);
        setHousehold(parsed.nextHousehold);
        setMembers(parsed.nextMembers);
        setCashback(parsed.nextCashback);
        setPlans(parsed.nextPlans);
        setFridge(parsed.nextFridge ?? []);
        setOfflineCache(true);
        setError("Нет связи с базой. Показаны сохранённые данные.");
      } else {
        setError(err instanceof Error ? err.message : "Не удалось загрузить данные");
      }
    }
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadAll(data.session).finally(() => setLoading(false));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(true);
      loadAll(next).finally(() => setLoading(false));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AppState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      household,
      members,
      cashback,
      fridge,
      plans,
      latestPlan: plans[0] ?? null,
      error,
      offlineCache,
      refresh: () => loadAll(session),
    }),
    [loading, session, profile, household, members, cashback, fridge, plans, error, offlineCache],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}
