import type { Bucket, Category } from '../types';

// Starter grocery catalog. "Full" means the amount in packLabel.
// dailyUse is the share of a full stock used per day outside of planned
// meals (milk in tea, bread, fruit, household supplies), for about 3 people;
// the app learns the real rate from your corrections.
export interface SeedItem {
  name: string;
  category: Category;
  packLabel: string;
  bucket: Bucket;
  essential?: boolean;
  shelfLifeDays?: number;
  dailyUse?: number;
}

const V = 'Vegetables' as const;
const F = 'Fruits' as const;
const D = 'Dairy & Eggs' as const;
const M = 'Meat & Fish' as const;
const G = 'Grains & Flours' as const;
const P = 'Dals & Pulses' as const;
const S = 'Spices & Masalas' as const;
const O = 'Oils & Ghee' as const;
const B = 'Bakery & Breakfast' as const;
const N = 'Snacks & Sweets' as const;
const SP = 'Sauces & Pickles' as const;
const BV = 'Beverages' as const;
const H = 'Household' as const;

export const SEED_ITEMS: SeedItem[] = [
  // Vegetables
  { name: 'Onion', category: V, packLabel: '2 kg', bucket: 'weekly', essential: true, shelfLifeDays: 30 },
  { name: 'Tomato', category: V, packLabel: '1 kg', bucket: 'quick', essential: true, shelfLifeDays: 7 },
  { name: 'Potato', category: V, packLabel: '2 kg', bucket: 'weekly', essential: true, shelfLifeDays: 30 },
  { name: 'Green chillies', category: V, packLabel: '100 g', bucket: 'quick', shelfLifeDays: 10 },
  { name: 'Coriander', category: V, packLabel: '1 bunch', bucket: 'quick', shelfLifeDays: 5 },
  { name: 'Ginger', category: V, packLabel: '200 g', bucket: 'weekly', shelfLifeDays: 21 },
  { name: 'Garlic', category: V, packLabel: '250 g', bucket: 'weekly', shelfLifeDays: 30 },
  { name: 'Curry leaves', category: V, packLabel: '1 bunch', bucket: 'quick', shelfLifeDays: 7 },
  { name: 'Lemon', category: V, packLabel: '4 pcs', bucket: 'quick', shelfLifeDays: 14 },
  { name: 'Spinach', category: V, packLabel: '1 bunch', bucket: 'quick', shelfLifeDays: 3 },
  { name: 'Methi', category: V, packLabel: '1 bunch', bucket: 'quick', shelfLifeDays: 3 },
  { name: 'Cauliflower', category: V, packLabel: '1 head', bucket: 'quick', shelfLifeDays: 6 },
  { name: 'Cabbage', category: V, packLabel: '1 head', bucket: 'quick', shelfLifeDays: 10 },
  { name: 'Bhindi', category: V, packLabel: '500 g', bucket: 'quick', shelfLifeDays: 4 },
  { name: 'Brinjal', category: V, packLabel: '500 g', bucket: 'quick', shelfLifeDays: 5 },
  { name: 'Capsicum', category: V, packLabel: '3 pcs', bucket: 'quick', shelfLifeDays: 7 },
  { name: 'Green peas', category: V, packLabel: '500 g frozen', bucket: 'weekly', shelfLifeDays: 90 },
  { name: 'Carrot', category: V, packLabel: '500 g', bucket: 'quick', shelfLifeDays: 12 },
  { name: 'French beans', category: V, packLabel: '250 g', bucket: 'quick', shelfLifeDays: 5 },
  { name: 'Bottle gourd', category: V, packLabel: '1 pc', bucket: 'quick', shelfLifeDays: 7 },
  { name: 'Cucumber', category: V, packLabel: '3 pcs', bucket: 'quick', shelfLifeDays: 6 },
  { name: 'Mushroom', category: V, packLabel: '200 g', bucket: 'quick', shelfLifeDays: 3 },
  { name: 'Sweet corn', category: V, packLabel: '500 g frozen', bucket: 'weekly', shelfLifeDays: 90 },
  // Fruits
  { name: 'Banana', category: F, packLabel: '1 dozen', bucket: 'quick', shelfLifeDays: 5, dailyUse: 0.15 },
  { name: 'Apple', category: F, packLabel: '1 kg', bucket: 'weekly', shelfLifeDays: 14, dailyUse: 0.08 },
  { name: 'Seasonal fruit', category: F, packLabel: '1 kg', bucket: 'quick', shelfLifeDays: 5, dailyUse: 0.15 },
  // Dairy & Eggs
  { name: 'Milk', category: D, packLabel: '2 L', bucket: 'quick', essential: true, shelfLifeDays: 3, dailyUse: 0.4 },
  { name: 'Curd', category: D, packLabel: '400 g', bucket: 'quick', shelfLifeDays: 5, dailyUse: 0.12 },
  { name: 'Paneer', category: D, packLabel: '200 g', bucket: 'quick', shelfLifeDays: 5 },
  { name: 'Butter', category: D, packLabel: '100 g', bucket: 'weekly', shelfLifeDays: 60, dailyUse: 0.03 },
  { name: 'Cheese', category: D, packLabel: '200 g', bucket: 'weekly', shelfLifeDays: 30 },
  { name: 'Fresh cream', category: D, packLabel: '200 ml', bucket: 'weekly', shelfLifeDays: 10 },
  { name: 'Eggs', category: D, packLabel: '1 dozen', bucket: 'quick', shelfLifeDays: 21 },
  // Meat & Fish
  { name: 'Chicken', category: M, packLabel: '500 g', bucket: 'quick', shelfLifeDays: 2 },
  { name: 'Fish', category: M, packLabel: '500 g', bucket: 'quick', shelfLifeDays: 2 },
  { name: 'Mutton', category: M, packLabel: '500 g', bucket: 'quick', shelfLifeDays: 2 },
  // Grains & Flours
  { name: 'Wheat atta', category: G, packLabel: '5 kg', bucket: 'weekly', essential: true },
  { name: 'Rice', category: G, packLabel: '5 kg', bucket: 'weekly', essential: true },
  { name: 'Basmati rice', category: G, packLabel: '1 kg', bucket: 'weekly' },
  { name: 'Poha', category: G, packLabel: '500 g', bucket: 'weekly' },
  { name: 'Rava', category: G, packLabel: '500 g', bucket: 'weekly' },
  { name: 'Besan', category: G, packLabel: '500 g', bucket: 'weekly' },
  { name: 'Jowar atta', category: G, packLabel: '1 kg', bucket: 'weekly' },
  { name: 'Idli dosa batter', category: G, packLabel: '1 kg', bucket: 'quick', shelfLifeDays: 4 },
  { name: 'Oats', category: G, packLabel: '1 kg', bucket: 'weekly' },
  { name: 'Vermicelli', category: G, packLabel: '400 g', bucket: 'weekly' },
  { name: 'Sabudana', category: G, packLabel: '500 g', bucket: 'weekly' },
  { name: 'Noodles', category: G, packLabel: '4 packs', bucket: 'weekly' },
  { name: 'Pasta', category: G, packLabel: '500 g', bucket: 'weekly' },
  // Dals & Pulses
  { name: 'Toor dal', category: P, packLabel: '1 kg', bucket: 'weekly', essential: true },
  { name: 'Moong dal', category: P, packLabel: '1 kg', bucket: 'weekly' },
  { name: 'Masoor dal', category: P, packLabel: '500 g', bucket: 'weekly' },
  { name: 'Chana dal', category: P, packLabel: '500 g', bucket: 'weekly' },
  { name: 'Urad dal', category: P, packLabel: '500 g', bucket: 'weekly' },
  { name: 'Rajma', category: P, packLabel: '500 g', bucket: 'weekly' },
  { name: 'Kabuli chana', category: P, packLabel: '500 g', bucket: 'weekly' },
  { name: 'Whole moong', category: P, packLabel: '500 g', bucket: 'weekly' },
  { name: 'Matki', category: P, packLabel: '500 g', bucket: 'weekly' },
  { name: 'Peanuts', category: P, packLabel: '500 g', bucket: 'weekly' },
  // Spices & Masalas
  { name: 'Salt', category: S, packLabel: '1 kg', bucket: 'weekly', essential: true },
  { name: 'Turmeric', category: S, packLabel: '200 g', bucket: 'weekly' },
  { name: 'Red chilli powder', category: S, packLabel: '200 g', bucket: 'weekly' },
  { name: 'Coriander powder', category: S, packLabel: '200 g', bucket: 'weekly' },
  { name: 'Cumin seeds', category: S, packLabel: '200 g', bucket: 'weekly' },
  { name: 'Mustard seeds', category: S, packLabel: '200 g', bucket: 'weekly' },
  { name: 'Garam masala', category: S, packLabel: '100 g', bucket: 'weekly' },
  { name: 'Goda masala', category: S, packLabel: '100 g', bucket: 'weekly' },
  { name: 'Hing', category: S, packLabel: '50 g', bucket: 'weekly' },
  { name: 'Pav bhaji masala', category: S, packLabel: '100 g', bucket: 'weekly' },
  { name: 'Chole masala', category: S, packLabel: '100 g', bucket: 'weekly' },
  { name: 'Sambar masala', category: S, packLabel: '100 g', bucket: 'weekly' },
  { name: 'Kasuri methi', category: S, packLabel: '50 g', bucket: 'weekly' },
  // Oils & Ghee
  { name: 'Cooking oil', category: O, packLabel: '1 L', bucket: 'weekly', essential: true },
  { name: 'Ghee', category: O, packLabel: '500 ml', bucket: 'weekly', dailyUse: 0.01 },
  // Bakery & Breakfast
  { name: 'Bread', category: B, packLabel: '1 loaf', bucket: 'quick', shelfLifeDays: 4, dailyUse: 0.1 },
  { name: 'Pav', category: B, packLabel: '1 pack of 6', bucket: 'quick', shelfLifeDays: 3 },
  { name: 'Cornflakes', category: B, packLabel: '500 g', bucket: 'weekly', dailyUse: 0.03 },
  { name: 'Jam', category: B, packLabel: '1 jar', bucket: 'weekly', dailyUse: 0.02 },
  // Snacks & Sweets
  { name: 'Biscuits', category: N, packLabel: '4 packs', bucket: 'weekly', dailyUse: 0.1 },
  { name: 'Namkeen', category: N, packLabel: '400 g', bucket: 'weekly', dailyUse: 0.05 },
  // Sauces & Pickles
  { name: 'Tomato ketchup', category: SP, packLabel: '1 bottle', bucket: 'weekly', dailyUse: 0.01 },
  { name: 'Pickle', category: SP, packLabel: '1 jar', bucket: 'weekly', dailyUse: 0.01 },
  { name: 'Soy sauce', category: SP, packLabel: '1 bottle', bucket: 'weekly' },
  // Beverages
  { name: 'Tea powder', category: BV, packLabel: '250 g', bucket: 'weekly', essential: true, dailyUse: 0.03 },
  { name: 'Coffee', category: BV, packLabel: '100 g', bucket: 'weekly', dailyUse: 0.02 },
  { name: 'Sugar', category: BV, packLabel: '1 kg', bucket: 'weekly', essential: true, dailyUse: 0.02 },
  // Household
  { name: 'Dishwash liquid', category: H, packLabel: '1 bottle', bucket: 'weekly', dailyUse: 0.03 },
  { name: 'Detergent', category: H, packLabel: '1 kg', bucket: 'weekly', dailyUse: 0.03 },
  { name: 'Toilet cleaner', category: H, packLabel: '1 bottle', bucket: 'weekly', dailyUse: 0.02 },
  { name: 'Garbage bags', category: H, packLabel: '1 roll', bucket: 'weekly', dailyUse: 0.04 },
  { name: 'Tissue paper', category: H, packLabel: '1 pack', bucket: 'weekly', dailyUse: 0.04 },
];
