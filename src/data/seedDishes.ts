import type { DishTag, Slot } from '../types';

// Starter dishes, mostly Indian home cooking with a Maharashtrian lean.
// ingredients: "item name:use" where use is the share of a full stock (see
// seedItems packLabel) one meal for ~3 people takes. A trailing "?" on the
// name marks it optional (nice to have, not needed to cook).
export interface SeedDish {
  name: string;
  slots: Slot[];
  tags: DishTag[];
  cookMinutes: number;
  ingredients: string;
  common?: boolean; // pre-ticked in setup
}

const B: Slot[] = ['breakfast'];
const LD: Slot[] = ['lunch', 'dinner'];
const BLD: Slot[] = ['breakfast', 'lunch', 'dinner'];
const D: Slot[] = ['dinner'];

const TADKA = 'cooking oil:0.03 mustard seeds:0.02 cumin seeds:0.02 turmeric:0.02 hing?:0.02';
const MASALA = 'red chilli powder:0.02 coriander powder:0.02 salt:0.02';
const ROTI = 'wheat atta:0.07';

export const SEED_DISHES: SeedDish[] = [
  // Breakfast
  { name: 'Kanda poha', slots: B, tags: ['quick', 'light'], cookMinutes: 20, common: true, ingredients: `poha:0.4 onion:0.05 potato?:0.05 peanuts?:0.05 green chillies:0.1 curry leaves?:0.2 lemon?:0.25 coriander?:0.2 ${TADKA} salt:0.01` },
  { name: 'Upma', slots: B, tags: ['quick', 'light'], cookMinutes: 20, common: true, ingredients: `rava:0.4 onion:0.04 green chillies:0.1 curry leaves?:0.2 urad dal?:0.02 ${TADKA} salt:0.01` },
  { name: 'Sabudana khichdi', slots: B, tags: ['fasting'], cookMinutes: 25, common: true, ingredients: 'sabudana:0.4 peanuts:0.15 potato:0.08 green chillies:0.1 cumin seeds:0.02 ghee:0.04 salt:0.01' },
  { name: 'Thalipeeth', slots: B, tags: ['heavy'], cookMinutes: 35, ingredients: 'jowar atta:0.2 besan:0.1 onion:0.05 coriander?:0.3 green chillies:0.1 cooking oil:0.03 salt:0.01' },
  { name: 'Aloo paratha', slots: BLD, tags: ['roti', 'heavy'], cookMinutes: 40, common: true, ingredients: `wheat atta:0.08 potato:0.2 green chillies:0.1 coriander?:0.3 ghee:0.04 curd?:0.4 ${MASALA}` },
  { name: 'Methi thepla', slots: B, tags: ['roti'], cookMinutes: 35, ingredients: 'wheat atta:0.07 besan?:0.05 methi:1 curd:0.2 cooking oil:0.04 turmeric:0.02 salt:0.01' },
  { name: 'Idli sambar', slots: B, tags: ['south-indian'], cookMinutes: 30, common: true, ingredients: 'idli dosa batter:0.6 toor dal:0.08 tomato:0.15 onion:0.04 sambar masala:0.05 curry leaves?:0.2 cooking oil:0.02' },
  { name: 'Masala dosa', slots: ['breakfast', 'dinner'], tags: ['south-indian', 'special'], cookMinutes: 35, common: true, ingredients: 'idli dosa batter:0.7 potato:0.2 onion:0.06 green chillies:0.1 curry leaves?:0.2 mustard seeds:0.02 turmeric:0.02 cooking oil:0.05' },
  { name: 'Besan chilla', slots: B, tags: ['quick'], cookMinutes: 20, ingredients: 'besan:0.3 onion:0.04 tomato:0.1 green chillies:0.1 coriander?:0.3 cooking oil:0.03 salt:0.01' },
  { name: 'Moong dal chilla', slots: B, tags: ['light'], cookMinutes: 25, ingredients: 'moong dal:0.15 green chillies:0.1 ginger:0.05 coriander?:0.3 cooking oil:0.03 salt:0.01' },
  { name: 'Bread omelette', slots: B, tags: ['egg', 'quick'], cookMinutes: 15, common: true, ingredients: 'eggs:0.35 bread:0.4 onion:0.03 green chillies?:0.1 butter:0.1 salt:0.01' },
  { name: 'Egg bhurji pav', slots: BLD, tags: ['egg', 'quick'], cookMinutes: 20, ingredients: 'eggs:0.4 pav:1 onion:0.05 tomato:0.1 green chillies:0.1 butter:0.1 turmeric:0.01 red chilli powder:0.01' },
  { name: 'Vegetable sandwich', slots: B, tags: ['quick', 'light'], cookMinutes: 15, common: true, ingredients: 'bread:0.6 cucumber:0.5 tomato:0.15 onion?:0.03 butter:0.15 cheese?:0.2' },
  { name: 'Masala oats', slots: B, tags: ['quick', 'light'], cookMinutes: 15, ingredients: 'oats:0.15 onion:0.03 tomato:0.1 carrot?:0.1 green peas?:0.1 cooking oil:0.02 salt:0.01' },
  { name: 'Shevai upma', slots: B, tags: ['quick'], cookMinutes: 20, ingredients: `vermicelli:0.5 onion:0.04 green peas?:0.1 carrot?:0.1 green chillies:0.1 ${TADKA} salt:0.01` },
  { name: 'Cornflakes and fruit', slots: B, tags: ['quick', 'light'], cookMinutes: 5, ingredients: 'cornflakes:0.15 milk:0.3 banana:0.25 sugar?:0.01' },
  { name: 'Misal pav', slots: ['breakfast', 'lunch'], tags: ['special', 'heavy'], cookMinutes: 45, common: true, ingredients: `matki:0.4 pav:1 onion:0.1 tomato:0.15 namkeen:0.3 lemon?:0.25 coriander?:0.3 goda masala:0.05 ${MASALA} cooking oil:0.04` },

  // Lunch and dinner: dal and rice
  { name: 'Varan bhaat', slots: LD, tags: ['dal', 'rice', 'light'], cookMinutes: 30, common: true, ingredients: 'toor dal:0.15 rice:0.06 ghee:0.03 turmeric:0.02 hing?:0.02 salt:0.01 lemon?:0.25' },
  { name: 'Dal tadka and rice', slots: LD, tags: ['dal', 'rice'], cookMinutes: 35, common: true, ingredients: `toor dal:0.15 rice:0.06 onion:0.04 tomato:0.15 garlic:0.03 ${TADKA} ${MASALA} ghee?:0.03` },
  { name: 'Amti bhaat', slots: LD, tags: ['dal', 'rice'], cookMinutes: 35, ingredients: `toor dal:0.15 rice:0.06 goda masala:0.05 curry leaves?:0.2 ${TADKA} ${MASALA}` },
  { name: 'Moong dal khichdi', slots: LD, tags: ['dal', 'rice', 'light', 'one-pot'], cookMinutes: 30, common: true, ingredients: 'moong dal:0.12 rice:0.05 ghee:0.04 cumin seeds:0.02 turmeric:0.02 salt:0.01 curd?:0.4 pickle?:0.05' },
  { name: 'Masala khichdi', slots: D, tags: ['dal', 'rice', 'one-pot'], cookMinutes: 35, ingredients: `toor dal:0.1 rice:0.06 potato:0.08 green peas?:0.15 onion:0.04 tomato:0.1 goda masala:0.04 ${TADKA}` },
  { name: 'Masoor dal and rice', slots: LD, tags: ['dal', 'rice'], cookMinutes: 30, ingredients: `masoor dal:0.3 rice:0.06 onion:0.04 tomato:0.15 garlic:0.03 ${TADKA} ${MASALA}` },
  { name: 'Dal palak and roti', slots: LD, tags: ['dal', 'roti'], cookMinutes: 35, ingredients: `toor dal:0.12 spinach:1 garlic:0.04 tomato:0.1 ${ROTI} ${TADKA} salt:0.02` },
  { name: 'Sambar rice', slots: LD, tags: ['dal', 'rice', 'south-indian'], cookMinutes: 40, common: true, ingredients: 'toor dal:0.15 rice:0.06 tomato:0.15 onion:0.05 bottle gourd?:0.4 carrot?:0.2 sambar masala:0.06 curry leaves?:0.2 cooking oil:0.03' },
  { name: 'Curd rice', slots: LD, tags: ['rice', 'light', 'quick', 'south-indian'], cookMinutes: 15, ingredients: 'rice:0.06 curd:0.8 mustard seeds:0.02 curry leaves?:0.2 green chillies?:0.1 cooking oil:0.01 salt:0.01' },
  { name: 'Rajma chawal', slots: LD, tags: ['rice', 'heavy', 'special'], cookMinutes: 50, common: true, ingredients: `rajma:0.4 rice:0.06 onion:0.08 tomato:0.25 ginger:0.05 garlic:0.04 garam masala:0.03 ${MASALA} cooking oil:0.04` },
  { name: 'Chole and roti', slots: LD, tags: ['roti', 'heavy'], cookMinutes: 50, common: true, ingredients: `kabuli chana:0.4 onion:0.08 tomato:0.25 ginger:0.05 garlic:0.04 chole masala:0.06 ${ROTI} cooking oil:0.04 salt:0.02` },
  { name: 'Usal and bhakri', slots: LD, tags: ['roti'], cookMinutes: 40, ingredients: `whole moong:0.35 onion:0.06 tomato:0.1 goda masala:0.05 jowar atta:0.2 ${TADKA} ${MASALA}` },
  { name: 'Pithla bhakri', slots: LD, tags: ['roti', 'quick'], cookMinutes: 30, common: true, ingredients: 'besan:0.3 jowar atta:0.2 onion:0.06 green chillies:0.15 garlic:0.04 coriander?:0.3 cooking oil:0.04 mustard seeds:0.02 turmeric:0.02 salt:0.01' },
  { name: 'Kadhi and rice', slots: LD, tags: ['rice', 'light'], cookMinutes: 30, ingredients: 'curd:0.8 besan:0.08 rice:0.06 ginger:0.03 green chillies:0.1 curry leaves?:0.2 cumin seeds:0.02 ghee:0.03 sugar:0.01 salt:0.01' },
  { name: 'Veg pulao and raita', slots: LD, tags: ['rice', 'one-pot'], cookMinutes: 35, common: true, ingredients: 'basmati rice:0.3 carrot:0.2 green peas:0.15 french beans?:0.4 potato?:0.08 onion:0.05 curd:0.4 cucumber?:0.3 garam masala:0.03 ghee:0.04 salt:0.01' },
  { name: 'Masale bhaat', slots: LD, tags: ['rice', 'special', 'one-pot'], cookMinutes: 40, ingredients: 'rice:0.07 brinjal?:0.4 green peas?:0.1 goda masala:0.06 cooking oil:0.04 coriander?:0.3 salt:0.01' },
  { name: 'Veg biryani', slots: LD, tags: ['rice', 'special', 'heavy'], cookMinutes: 60, ingredients: 'basmati rice:0.4 carrot:0.2 french beans:0.4 potato:0.1 green peas:0.15 onion:0.1 curd:0.3 garam masala:0.04 ghee:0.06 salt:0.01' },
  { name: 'Lemon rice', slots: LD, tags: ['rice', 'quick', 'south-indian'], cookMinutes: 20, ingredients: 'rice:0.06 lemon:0.5 peanuts:0.08 curry leaves?:0.2 green chillies:0.1 mustard seeds:0.02 turmeric:0.02 cooking oil:0.02 salt:0.01' },

  // Sabzi and roti
  { name: 'Aloo gobi and roti', slots: LD, tags: ['sabzi', 'roti'], cookMinutes: 35, common: true, ingredients: `cauliflower:1 potato:0.12 onion?:0.04 tomato:0.1 ${ROTI} ${TADKA} ${MASALA}` },
  { name: 'Bhindi fry and roti', slots: LD, tags: ['sabzi', 'roti'], cookMinutes: 30, common: true, ingredients: `bhindi:1 onion:0.04 ${ROTI} ${TADKA} ${MASALA}` },
  { name: 'Baingan bharta and roti', slots: LD, tags: ['sabzi', 'roti'], cookMinutes: 40, ingredients: `brinjal:1 onion:0.06 tomato:0.15 garlic:0.04 green chillies:0.1 ${ROTI} cooking oil:0.03 salt:0.01` },
  { name: 'Bharli vangi and bhakri', slots: LD, tags: ['sabzi', 'roti', 'special'], cookMinutes: 45, ingredients: 'brinjal:1 peanuts:0.1 onion:0.06 goda masala:0.05 jowar atta:0.2 cooking oil:0.04 red chilli powder:0.02 salt:0.01' },
  { name: 'Patta gobhi sabzi and roti', slots: LD, tags: ['sabzi', 'roti', 'light'], cookMinutes: 25, ingredients: `cabbage:0.8 green peas?:0.1 green chillies:0.1 ${ROTI} ${TADKA} salt:0.01` },
  { name: 'Methi aloo and roti', slots: LD, tags: ['sabzi', 'roti'], cookMinutes: 30, ingredients: `methi:1 potato:0.12 garlic:0.03 ${ROTI} ${TADKA} ${MASALA}` },
  { name: 'Palak paneer and roti', slots: LD, tags: ['paneer', 'roti', 'special'], cookMinutes: 40, common: true, ingredients: `spinach:1 paneer:1 onion:0.05 tomato:0.1 garlic:0.04 ginger:0.03 fresh cream?:0.3 garam masala:0.02 ${ROTI} cooking oil:0.03 salt:0.01` },
  { name: 'Matar paneer and roti', slots: LD, tags: ['paneer', 'roti'], cookMinutes: 40, common: true, ingredients: `paneer:1 green peas:0.3 onion:0.08 tomato:0.25 ginger:0.03 garam masala:0.02 ${ROTI} ${MASALA} cooking oil:0.03` },
  { name: 'Paneer bhurji and roti', slots: LD, tags: ['paneer', 'roti', 'quick'], cookMinutes: 25, ingredients: `paneer:1 onion:0.06 tomato:0.15 capsicum?:0.3 green chillies:0.1 ${ROTI} butter?:0.1 turmeric:0.01 salt:0.01` },
  { name: 'Kadai paneer and roti', slots: D, tags: ['paneer', 'roti', 'special'], cookMinutes: 40, ingredients: `paneer:1 capsicum:0.7 onion:0.08 tomato:0.25 garam masala:0.02 kasuri methi?:0.05 ${ROTI} ${MASALA} cooking oil:0.04` },
  { name: 'Mix veg and roti', slots: LD, tags: ['sabzi', 'roti'], cookMinutes: 35, common: true, ingredients: `carrot:0.3 french beans:0.5 green peas:0.15 potato:0.1 cauliflower?:0.4 onion:0.05 tomato:0.15 ${ROTI} ${MASALA} cooking oil:0.03` },
  { name: 'Dudhi chana dal and roti', slots: LD, tags: ['sabzi', 'roti', 'light'], cookMinutes: 35, ingredients: `bottle gourd:1 chana dal:0.15 tomato:0.1 ${ROTI} ${TADKA} ${MASALA}` },
  { name: 'Mushroom masala and roti', slots: D, tags: ['sabzi', 'roti'], cookMinutes: 30, ingredients: `mushroom:1 onion:0.08 tomato:0.2 capsicum?:0.3 garam masala:0.02 ${ROTI} ${MASALA} cooking oil:0.03` },
  { name: 'Jeera aloo, dal and roti', slots: LD, tags: ['sabzi', 'dal', 'roti'], cookMinutes: 40, ingredients: `potato:0.2 moong dal:0.12 cumin seeds:0.03 green chillies:0.1 ${ROTI} ${TADKA} salt:0.02` },
  { name: 'Pav bhaji', slots: D, tags: ['special', 'heavy'], cookMinutes: 45, common: true, ingredients: 'pav:1 potato:0.2 cauliflower?:0.4 green peas:0.2 capsicum:0.3 tomato:0.3 onion:0.08 butter:0.4 pav bhaji masala:0.08 lemon?:0.25 coriander?:0.3' },
  { name: 'Vada pav', slots: ['breakfast', 'dinner'], tags: ['special'], cookMinutes: 45, ingredients: 'pav:1 potato:0.25 besan:0.3 green chillies:0.15 garlic:0.05 curry leaves?:0.2 cooking oil:0.25 turmeric:0.01 salt:0.01' },
  { name: 'Chapati and curd', slots: LD, tags: ['roti', 'light', 'quick'], cookMinutes: 20, ingredients: `${ROTI} curd:0.8 pickle?:0.05` },

  // Egg, chicken, fish, mutton
  { name: 'Egg curry and rice', slots: LD, tags: ['egg', 'rice'], cookMinutes: 35, common: true, ingredients: `eggs:0.5 rice:0.06 onion:0.1 tomato:0.2 ginger:0.03 garlic:0.04 garam masala:0.02 ${MASALA} cooking oil:0.04` },
  { name: 'Chicken curry and rice', slots: LD, tags: ['chicken', 'rice', 'heavy'], cookMinutes: 50, common: true, ingredients: `chicken:1 rice:0.06 onion:0.12 tomato:0.2 ginger:0.05 garlic:0.05 curd?:0.3 garam masala:0.04 ${MASALA} cooking oil:0.05` },
  { name: 'Butter chicken and roti', slots: D, tags: ['chicken', 'roti', 'special', 'heavy'], cookMinutes: 60, ingredients: `chicken:1 butter:0.5 fresh cream:0.5 tomato:0.3 ginger:0.05 garlic:0.05 kasuri methi:0.05 garam masala:0.03 ${ROTI} ${MASALA}` },
  { name: 'Chicken biryani', slots: LD, tags: ['chicken', 'rice', 'special', 'heavy'], cookMinutes: 75, ingredients: 'chicken:1 basmati rice:0.4 onion:0.15 curd:0.4 tomato:0.1 ginger:0.05 garlic:0.05 garam masala:0.05 ghee:0.08 salt:0.02' },
  { name: 'Fish fry, dal and rice', slots: LD, tags: ['fish', 'rice', 'dal'], cookMinutes: 40, ingredients: `fish:1 rice:0.06 toor dal:0.12 rava?:0.1 lemon:0.25 ginger:0.03 garlic:0.03 ${MASALA} cooking oil:0.08` },
  { name: 'Fish curry and rice', slots: LD, tags: ['fish', 'rice'], cookMinutes: 40, ingredients: `fish:1 rice:0.06 onion:0.08 tomato:0.15 garlic:0.04 ${MASALA} cooking oil:0.04` },
  { name: 'Mutton curry and bhakri', slots: LD, tags: ['mutton', 'roti', 'special', 'heavy'], cookMinutes: 90, ingredients: `mutton:1 jowar atta:0.2 onion:0.15 tomato:0.2 ginger:0.05 garlic:0.06 goda masala:0.05 garam masala:0.04 ${MASALA} cooking oil:0.05` },

  // Other cuisines
  { name: 'Veg hakka noodles', slots: D, tags: ['chinese', 'quick'], cookMinutes: 25, common: true, ingredients: 'noodles:0.5 cabbage:0.3 capsicum:0.3 carrot:0.2 onion:0.04 soy sauce:0.08 garlic:0.03 cooking oil:0.03 tomato ketchup?:0.03' },
  { name: 'Veg fried rice', slots: D, tags: ['chinese', 'rice', 'quick'], cookMinutes: 25, ingredients: 'rice:0.06 cabbage:0.2 carrot:0.2 french beans?:0.3 capsicum?:0.3 green peas?:0.1 soy sauce:0.06 garlic:0.03 cooking oil:0.03' },
  { name: 'Egg fried rice', slots: D, tags: ['chinese', 'rice', 'egg', 'quick'], cookMinutes: 25, ingredients: 'rice:0.06 eggs:0.3 onion:0.04 carrot?:0.2 green peas?:0.1 soy sauce:0.06 garlic:0.03 cooking oil:0.03' },
  { name: 'Red sauce pasta', slots: D, tags: ['continental', 'quick'], cookMinutes: 25, common: true, ingredients: 'pasta:0.6 tomato:0.4 onion:0.04 garlic:0.04 capsicum?:0.3 sweet corn?:0.15 cheese?:0.3 cooking oil:0.03 salt:0.01' },
  { name: 'White sauce pasta', slots: D, tags: ['continental'], cookMinutes: 30, ingredients: 'pasta:0.6 milk:0.25 butter:0.3 cheese:0.3 sweet corn?:0.15 mushroom?:0.5 capsicum?:0.3 salt:0.01' },
  { name: 'Grilled cheese sandwich and soup', slots: D, tags: ['continental', 'light', 'quick'], cookMinutes: 25, ingredients: 'bread:0.6 cheese:0.4 butter:0.2 tomato:0.4 onion:0.03 garlic:0.02 salt:0.01' },
];
