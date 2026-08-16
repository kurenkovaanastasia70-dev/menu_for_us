import { supabase } from "@/lib/supabase/client";
import {
  fetchCashback,
  fetchFridge,
  fetchHousehold,
  fetchHouseholdProfiles,
  fetchMealPlans,
  fetchProfile,
  fetchTrainingPlans,
  fetchWeightLogs,
} from "@/lib/supabase/api";
import { fetchCustomProducts, type CustomProduct } from "@/lib/catalog/custom-products";
import {
  readCurrentWeekPlanId,
  resolveActivePlan,
  writeCurrentWeekPlanId,
} from "@/lib/dates/week";
import type { CashbackRuleRow, FridgeItem, Household, MealPlanRow, Profile, WeightLog } from "@/lib/supabase/types";
import type { PersonTrainingPlan } from "@/lib/training/plan";
import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface AppState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  household: Household | null;
  members: Profile[];
  cashback: CashbackRuleRow[];
  fridge: FridgeItem[];
  customProducts: CustomProduct[];
  weightLogs: WeightLog[];
  trainingPlans: PersonTrainingPlan[];
  plans: MealPlanRow[];
  /** План для «Моей недели» и корзины: отмеченная текущая неделя или последняя генерация. */
  latestPlan: MealPlanRow | null;
  /** Явно отмеченный план «текущая неделя»; null = берём последнюю генерацию. */
  currentWeekPlanId: string | null;
  setCurrentWeekPlan: (planId: string | null) => void;
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
  const [customProducts, setCustomProducts] = useState<CustomProduct[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [trainingPlans, setTrainingPlans] = useState<PersonTrainingPlan[]>([]);
  const [plans, setPlans] = useState<MealPlanRow[]>([]);
  const [currentWeekPlanId, setCurrentWeekPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offlineCache, setOfflineCache] = useState(false);

  async function loadAll(current: Session | null) {
    if (!current || !supabase) {
      setProfile(null);
      setHousehold(null);
      setMembers([]);
      setCashback([]);
      setFridge([]);
      setCustomProducts([]);
      setWeightLogs([]);
      setTrainingPlans([]);
      setPlans([]);
      setCurrentWeekPlanId(null);
      return;
    }
    try {
      const nextProfile = await fetchProfile(current.user.id);
      setProfile(nextProfile);
      const logs = await fetchWeightLogs(current.user.id);
      setWeightLogs(logs);
      if (nextProfile?.household_id) {
        const [nextHousehold, nextMembers, nextCashback, nextPlans, nextFridge, nextTraining, nextCustom] =
          await Promise.all([
            fetchHousehold(nextProfile.household_id),
            fetchHouseholdProfiles(nextProfile.household_id),
            fetchCashback(nextProfile.household_id),
            fetchMealPlans(nextProfile.household_id),
            fetchFridge(nextProfile.household_id),
            fetchTrainingPlans(nextProfile.household_id),
            fetchCustomProducts(nextProfile.household_id),
          ]);
        setHousehold(nextHousehold);
        setMembers(nextMembers);
        setCashback(nextCashback);
        setPlans(nextPlans);
        setFridge(nextFridge);
        setTrainingPlans(nextTraining);
        setCustomProducts(nextCustom);
        const pinned = readCurrentWeekPlanId(nextProfile.household_id);
        setCurrentWeekPlanId(pinned && nextPlans.some((plan) => plan.id === pinned) ? pinned : null);
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            nextProfile,
            nextHousehold,
            nextMembers,
            nextCashback,
            nextPlans,
            nextFridge,
            nextTraining,
            nextWeightLogs: logs,
          }),
        );
      } else {
        setHousehold(null);
        setMembers(nextProfile ? [nextProfile] : []);
        setCashback([]);
        setFridge([]);
        setCustomProducts([]);
        setTrainingPlans([]);
        setPlans([]);
        setCurrentWeekPlanId(null);
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
          nextTraining?: PersonTrainingPlan[];
          nextWeightLogs?: WeightLog[];
        };
        setProfile(parsed.nextProfile);
        setHousehold(parsed.nextHousehold);
        setMembers(parsed.nextMembers);
        setCashback(parsed.nextCashback);
        setPlans(parsed.nextPlans);
        setFridge(parsed.nextFridge ?? []);
        setTrainingPlans(parsed.nextTraining ?? []);
        setWeightLogs(parsed.nextWeightLogs ?? []);
        if (parsed.nextHousehold?.id) {
          const pinned = readCurrentWeekPlanId(parsed.nextHousehold.id);
          setCurrentWeekPlanId(pinned && parsed.nextPlans.some((plan) => plan.id === pinned) ? pinned : null);
        }
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

  const setCurrentWeekPlan = useCallback(
    (planId: string | null) => {
      if (!household?.id) return;
      writeCurrentWeekPlanId(household.id, planId);
      setCurrentWeekPlanId(planId);
    },
    [household?.id],
  );

  const latestPlan = useMemo(
    () => resolveActivePlan(plans, currentWeekPlanId),
    [plans, currentWeekPlanId],
  );

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
      customProducts,
      weightLogs,
      trainingPlans,
      plans,
      latestPlan,
      currentWeekPlanId,
      setCurrentWeekPlan,
      error,
      offlineCache,
      refresh: () => loadAll(session),
    }),
    [
      loading,
      session,
      profile,
      household,
      members,
      cashback,
      fridge,
      customProducts,
      weightLogs,
      trainingPlans,
      plans,
      latestPlan,
      currentWeekPlanId,
      setCurrentWeekPlan,
      error,
      offlineCache,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}
