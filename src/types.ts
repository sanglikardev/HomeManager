// Core record types. Every row also carries householdId in the database;
// the store fills it in on write, so the app code rarely touches it.

export type Slot = 'breakfast' | 'lunch' | 'dinner';
export const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner'];

export type Category =
  | 'Vegetables'
  | 'Fruits'
  | 'Dairy & Eggs'
  | 'Meat & Fish'
  | 'Grains & Flours'
  | 'Dals & Pulses'
  | 'Spices & Masalas'
  | 'Oils & Ghee'
  | 'Bakery & Breakfast'
  | 'Snacks & Sweets'
  | 'Sauces & Pickles'
  | 'Beverages'
  | 'Household';

export const CATEGORIES: Category[] = [
  'Vegetables',
  'Fruits',
  'Dairy & Eggs',
  'Meat & Fish',
  'Grains & Flours',
  'Dals & Pulses',
  'Spices & Masalas',
  'Oils & Ghee',
  'Bakery & Breakfast',
  'Snacks & Sweets',
  'Sauces & Pickles',
  'Beverages',
  'Household',
];

// Where an item is normally bought: same-day quick commerce or the weekly order.
export type Bucket = 'quick' | 'weekly';

export interface Item {
  id: string;
  name: string;
  category: Category;
  packLabel: string; // what "Full" means, e.g. "1 kg", "500 ml", "1 dozen"
  bucket: Bucket;
  essential: boolean; // "never run out": reordered earlier
  shelfLifeDays: number | null; // null = keeps for months
  dailyUse: number; // fraction of a full stock used per day on its own (milk, bread); 0 = only meals use it
  // Pantry state. level is 0..1 as of levelAt; dailyUse drains it after that.
  level: number;
  levelAt: string; // ISO time the level was last written
  confirmedAt: string | null; // last time a person said how much there is
  purchasedAt: string | null;
  askedAt: string | null; // last time the app asked about it
}

export interface DishIngredient {
  itemId: string;
  use: number; // fraction of a full stock one household-sized meal uses
  optional?: boolean;
}

export type DishTag =
  | 'dal'
  | 'sabzi'
  | 'rice'
  | 'roti'
  | 'paneer'
  | 'egg'
  | 'chicken'
  | 'fish'
  | 'mutton'
  | 'light'
  | 'heavy'
  | 'quick'
  | 'special'
  | 'fasting'
  | 'south-indian'
  | 'chinese'
  | 'continental'
  | 'one-pot';

export const NONVEG_TAGS: DishTag[] = ['chicken', 'fish', 'mutton'];

export interface Dish {
  id: string;
  name: string;
  slots: Slot[];
  tags: DishTag[];
  cookMinutes: number;
  ingredients: DishIngredient[];
  active: boolean; // in rotation
  favorite: boolean;
}

export type MealKind = 'cooked' | 'out' | 'leftovers' | 'skipped';

export interface MealLog {
  id: string;
  date: string; // YYYY-MM-DD local
  slot: Slot;
  kind: MealKind;
  dishId: string | null;
  label: string; // dish name, or free text ("Pizza from Domino's")
  servings: number;
  createdAt: string;
}

export type ShopStatus = 'needed' | 'bought';

export interface ShoppingEntry {
  id: string;
  itemId: string | null;
  name: string;
  note: string;
  bucket: Bucket;
  status: ShopStatus;
  source: 'auto' | 'manual';
  createdAt: string;
  boughtAt: string | null;
}

export type PantryReason = 'meal' | 'purchase' | 'correction' | 'spoiled' | 'manual' | 'undo';

export interface PantryEvent {
  id: string;
  itemId: string;
  reason: PantryReason;
  before: number;
  after: number;
  mealId: string | null;
  createdAt: string;
}

export type Diet = 'veg' | 'egg' | 'nonveg';

export interface HouseholdSettings {
  people: number;
  diet: Diet;
  vegOnlyDays: number[]; // 0 = Sunday ... 6 = Saturday
  slots: Slot[];
  weeklyOrderDay: number; // 0..6
  cookAtHome: boolean;
  setupDone: boolean;
}

export interface Household {
  id: string;
  name: string;
  inviteCode: string;
  settings: HouseholdSettings;
}

export const DEFAULT_SETTINGS: HouseholdSettings = {
  people: 3,
  diet: 'veg',
  vegOnlyDays: [],
  slots: ['breakfast', 'lunch', 'dinner'],
  weeklyOrderDay: 6,
  cookAtHome: false,
  setupDone: false,
};

export interface AppData {
  household: Household;
  items: Item[];
  dishes: Dish[];
  meals: MealLog[];
  shopping: ShoppingEntry[];
  events: PantryEvent[];
}
