export type FoodEntry = {
  id: string;
  log_date: string;
  name: string;
  quantity?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  created_at: string;
};

export type DayLog = {
  log_date: string;
  steps: number;
  steps_source: "manual" | "health_connect";
  weight_kg?: number | null;
  notes?: string | null;
};

export type Goals = {
  daily_calorie_goal: number;
  protein_goal?: number | null;
  carbs_goal?: number | null;
  fat_goal?: number | null;
  fiber_goal?: number | null;
};
