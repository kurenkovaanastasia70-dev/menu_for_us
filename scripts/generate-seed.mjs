import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXTRA_PRODUCTS } from "./magnit-style-catalog.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src", "data");
mkdirSync(outDir, { recursive: true });

const stores = [
  { id: "pyaterochka", name: "Пятёрочка", slug: "pyaterochka" },
  { id: "perekrestok", name: "Перекрёсток", slug: "perekrestok" },
  { id: "magnit", name: "Магнит", slug: "magnit" },
  { id: "dixy", name: "Дикси", slug: "dixy" },
];

const storePriceFactor = {
  pyaterochka: 1,
  magnit: 0.98,
  dixy: 1.02,
  perekrestok: 1.05,
};

/** @type {Array<{id:string,name:string,category:string,cal:number,p:number,f:number,c:number,pack:number,unit:string,tags:string[],price:number,brand:string}>} */
const rawProducts = [
  ["chicken_breast", "Куриная грудка", "protein", 110, 23.6, 1.9, 0, 900, "g", ["chicken", "meat"], 289, "Петруха"],
  ["chicken_thigh", "Куриное бедро", "protein", 185, 21, 11, 0, 900, "g", ["chicken", "meat"], 249, "Петруха"],
  ["turkey_fillet", "Филе индейки", "protein", 117, 24, 1.9, 0, 600, "g", ["turkey", "meat"], 319, "Индилайт"],
  ["ground_turkey", "Фарш индейки", "protein", 160, 20, 8, 0, 500, "g", ["turkey", "meat"], 199, "Индилайт"],
  ["ground_chicken", "Фарш куриный", "protein", 143, 18, 8, 0, 500, "g", ["chicken", "meat"], 149, "Петруха"],
  ["beef", "Говядина", "protein", 187, 22, 11, 0, 500, "g", ["beef", "meat"], 399, "Мираторг"],
  ["ground_beef", "Фарш говяжий", "protein", 254, 17, 20, 0, 400, "g", ["beef", "meat"], 239, "Мираторг"],
  ["pork_tenderloin", "Свиная вырезка", "protein", 142, 21, 6, 0, 500, "g", ["pork", "meat"], 319, "Мираторг"],
  ["salmon", "Лосось", "protein", 208, 20, 13, 0, 400, "g", ["fish"], 649, "Русское море"],
  ["pollock", "Минтай", "protein", 72, 16, 0.9, 0, 700, "g", ["fish"], 199, "Русское море"],
  ["cod", "Треска", "protein", 82, 18, 0.7, 0, 500, "g", ["fish"], 299, "Русское море"],
  ["tuna_can", "Тунец консервированный", "protein", 96, 21, 1, 0, 185, "g", ["fish"], 129, "Магуро"],
  ["shrimp", "Креветки", "protein", 95, 20, 1.1, 0, 400, "g", ["fish"], 399, "Бухта изобилия"],
  ["eggs", "Яйца куриные", "protein", 157, 13, 11, 1, 600, "g", ["eggs"], 99, "Роскар"],
  ["tofu", "Тофу", "protein", 76, 8, 4.8, 1.9, 300, "g", ["soy", "vegetarian"], 119, "Сельский дом"],
  ["lentils", "Чечевица", "protein", 116, 9, 0.4, 20, 500, "g", ["legume", "vegetarian"], 79, "Мистраль"],
  ["chickpeas", "Нут", "protein", 164, 8.9, 2.6, 27, 450, "g", ["legume", "vegetarian"], 89, "Мистраль"],
  ["beans", "Фасоль", "protein", 127, 8.7, 0.5, 22, 400, "g", ["legume", "vegetarian"], 82, "Мистраль"],
  ["cottage_cheese", "Творог 5%", "dairy", 121, 17, 5, 1.8, 400, "g", ["dairy"], 109, "Простоквашино"],
  ["greek_yogurt", "Греческий йогурт", "dairy", 66, 8, 2, 3.5, 250, "g", ["dairy"], 79, "Савушкин"],
  ["yogurt", "Йогурт натуральный", "dairy", 60, 4, 2.5, 6, 300, "g", ["dairy"], 59, "Простоквашино"],
  ["milk", "Молоко 2.5%", "dairy", 52, 2.9, 2.5, 4.8, 900, "ml", ["dairy"], 74, "Простоквашино"],
  ["kefir", "Кефир 2.5%", "dairy", 50, 3, 2.5, 4, 900, "ml", ["dairy"], 72, "Простоквашино"],
  ["ryazhenka", "Ряженка", "dairy", 67, 3, 4, 4.2, 450, "ml", ["dairy"], 55, "Простоквашино"],
  ["cheese", "Сыр полутвёрдый", "dairy", 350, 23, 28, 0, 200, "g", ["dairy"], 169, "Радость вкуса"],
  ["mozzarella", "Моцарелла", "dairy", 280, 18, 22, 2, 200, "g", ["dairy"], 149, "Hochland"],
  ["feta", "Фета", "dairy", 264, 14, 21, 4, 200, "g", ["dairy"], 139, "Bonfesto"],
  ["sour_cream", "Сметана 15%", "dairy", 162, 2.6, 15, 3, 300, "g", ["dairy"], 69, "Простоквашино"],
  ["rice", "Рис", "grain", 130, 2.7, 0.3, 28, 900, "g", ["grain"], 79, "Мистраль"],
  ["buckwheat", "Гречка", "grain", 132, 4.5, 1.6, 25, 900, "g", ["grain"], 85, "Мистраль"],
  ["oats", "Овсянка", "grain", 379, 13, 6.2, 65, 500, "g", ["grain"], 59, "Nordic"],
  ["pasta", "Макароны", "grain", 344, 11, 1.3, 71, 450, "g", ["grain"], 55, "Barilla"],
  ["spaghetti", "Спагетти", "grain", 359, 13, 2, 70, 500, "g", ["grain"], 69, "Barilla"],
  ["potato", "Картофель", "grain", 77, 2, 0.1, 17, 2000, "g", ["vegetable"], 69, "Фермер"],
  ["bread", "Хлеб цельнозерновой", "grain", 247, 9, 3.3, 43, 350, "g", ["grain"], 59, "Коломенское"],
  ["quinoa", "Киноа", "grain", 120, 4.4, 1.9, 21, 400, "g", ["grain"], 169, "Мистраль"],
  ["bulgur", "Булгур", "grain", 83, 3.1, 0.2, 19, 450, "g", ["grain"], 85, "Мистраль"],
  ["couscous", "Кускус", "grain", 112, 3.8, 0.2, 23, 450, "g", ["grain"], 89, "Мистраль"],
  ["millet", "Пшено", "grain", 119, 3.5, 1, 23, 800, "g", ["grain"], 58, "Мистраль"],
  ["barley", "Перловка", "grain", 123, 2.3, 0.4, 28, 800, "g", ["grain"], 45, "Мистраль"],
  ["noodles", "Лапша удон", "grain", 140, 4.5, 0.5, 28, 300, "g", ["grain"], 99, "Sen Soy"],
  ["tomato", "Помидоры", "vegetable", 18, 0.9, 0.2, 3.9, 500, "g", ["vegetable"], 119, "Своя грядка"],
  ["cucumber", "Огурцы", "vegetable", 15, 0.8, 0.1, 3.6, 500, "g", ["vegetable"], 99, "Своя грядка"],
  ["onion", "Лук репчатый", "vegetable", 40, 1.1, 0.1, 9, 1000, "g", ["vegetable"], 39, "Своя грядка"],
  ["garlic", "Чеснок", "vegetable", 149, 6.4, 0.5, 33, 150, "g", ["vegetable"], 49, "Своя грядка"],
  ["carrot", "Морковь", "vegetable", 41, 0.9, 0.2, 10, 1000, "g", ["vegetable"], 35, "Своя грядка"],
  ["cabbage", "Капуста белокочанная", "vegetable", 25, 1.3, 0.1, 6, 1500, "g", ["vegetable"], 45, "Своя грядка"],
  ["broccoli", "Брокколи", "vegetable", 34, 2.8, 0.4, 7, 400, "g", ["vegetable"], 119, "4 сезона"],
  ["spinach", "Шпинат", "vegetable", 23, 2.9, 0.4, 3.6, 400, "g", ["vegetable"], 109, "4 сезона"],
  ["bell_pepper", "Перец болгарский", "vegetable", 27, 1, 0.3, 6, 500, "g", ["vegetable"], 149, "Своя грядка"],
  ["zucchini", "Кабачки", "vegetable", 17, 1.2, 0.3, 3.4, 800, "g", ["vegetable"], 69, "Своя грядка"],
  ["eggplant", "Баклажаны", "vegetable", 25, 1.1, 0.2, 6, 600, "g", ["vegetable"], 99, "Своя грядка"],
  ["beet", "Свёкла", "vegetable", 43, 1.6, 0.2, 10, 1000, "g", ["vegetable"], 39, "Своя грядка"],
  ["lettuce", "Салат айсберг", "vegetable", 14, 0.9, 0.1, 3, 300, "g", ["vegetable", "salad"], 79, "Белая дача"],
  ["mushroom", "Шампиньоны", "vegetable", 27, 4.3, 1, 1, 400, "g", ["vegetable"], 99, "Грибной рай"],
  ["cherry_tomato", "Черри", "vegetable", 18, 0.9, 0.2, 3.9, 250, "g", ["vegetable"], 109, "Своя грядка"],
  ["green_beans", "Стручковая фасоль", "vegetable", 31, 1.8, 0.1, 7, 400, "g", ["vegetable"], 119, "4 сезона"],
  ["cauliflower", "Цветная капуста", "vegetable", 25, 1.9, 0.3, 5, 500, "g", ["vegetable"], 109, "4 сезона"],
  ["pumpkin", "Тыква", "vegetable", 26, 1, 0.1, 7, 1000, "g", ["vegetable"], 59, "Своя грядка"],
  ["corn", "Кукуруза", "vegetable", 96, 3.3, 1.4, 19, 340, "g", ["vegetable"], 69, "Бондюэль"],
  ["peas", "Горошек", "vegetable", 81, 5.4, 0.4, 14, 400, "g", ["vegetable"], 79, "4 сезона"],
  ["celery", "Сельдерей", "vegetable", 16, 0.7, 0.2, 3, 400, "g", ["vegetable"], 69, "Своя грядка"],
  ["dill", "Укроп", "vegetable", 43, 3.5, 0.5, 7, 50, "g", ["vegetable"], 35, "Своя грядка"],
  ["parsley", "Петрушка", "vegetable", 36, 3, 0.4, 6, 50, "g", ["vegetable"], 35, "Своя грядка"],
  ["ginger", "Имбирь", "vegetable", 80, 1.8, 0.8, 18, 100, "g", ["vegetable"], 79, "Своя грядка"],
  ["banana", "Бананы", "fruit", 89, 1.1, 0.3, 23, 1000, "g", ["fruit"], 99, "Эквадор"],
  ["apple", "Яблоки", "fruit", 52, 0.3, 0.2, 14, 1000, "g", ["fruit"], 109, "Сады Кубани"],
  ["orange", "Апельсины", "fruit", 47, 0.9, 0.1, 12, 1000, "g", ["fruit"], 119, "Марокко"],
  ["lemon", "Лимоны", "fruit", 29, 1.1, 0.3, 9, 500, "g", ["fruit"], 89, "Турция"],
  ["berries", "Ягодный микс", "fruit", 43, 0.7, 0.4, 9, 300, "g", ["fruit"], 169, "4 сезона"],
  ["kiwi", "Киви", "fruit", 61, 1.1, 0.5, 15, 500, "g", ["fruit"], 129, "Италия"],
  ["pear", "Груши", "fruit", 57, 0.4, 0.1, 15, 800, "g", ["fruit"], 139, "Сады Кубани"],
  ["olive_oil", "Оливковое масло", "fat", 884, 0, 100, 0, 500, "ml", ["fat"], 389, "Borges"],
  ["sunflower_oil", "Подсолнечное масло", "fat", 899, 0, 100, 0, 900, "ml", ["fat"], 99, "Слобода"],
  ["butter", "Сливочное масло", "fat", 748, 0.5, 82.5, 0.8, 180, "g", ["fat", "dairy"], 139, "Простоквашино"],
  ["avocado", "Авокадо", "fat", 160, 2, 15, 9, 400, "g", ["fruit", "fat"], 179, "Перу"],
  ["nuts", "Грецкий орех", "fat", 654, 15, 65, 14, 200, "g", ["fat"], 219, "Семушка"],
  ["seeds", "Семена льна", "fat", 534, 18, 42, 29, 200, "g", ["fat"], 89, "Семушка"],
  ["peanut_butter", "Арахисовая паста", "fat", 588, 25, 50, 20, 250, "g", ["fat"], 189, "Азбука"],
  ["flour", "Мука пшеничная", "pantry", 364, 10, 1, 76, 1000, "g", ["pantry"], 59, "Макфа"],
  ["sugar", "Сахар", "pantry", 387, 0, 0, 100, 1000, "g", ["pantry"], 79, "Русский сахар"],
  ["salt", "Соль", "pantry", 0, 0, 0, 0, 500, "g", ["pantry"], 29, "Илецкая"],
  ["honey", "Мёд", "pantry", 304, 0.3, 0, 82, 250, "g", ["pantry"], 219, "Башкирский"],
  ["soy_sauce", "Соевый соус", "pantry", 53, 6, 0, 7, 250, "ml", ["pantry"], 99, "Sen Soy"],
  ["tomato_paste", "Томатная паста", "pantry", 82, 4.3, 0.5, 19, 140, "g", ["pantry"], 49, "Помидорка"],
  ["canned_tomatoes", "Томаты в с.с.", "pantry", 24, 1.2, 0.2, 5, 400, "g", ["pantry"], 89, "Помидорка"],
  ["teriyaki", "Соус терияки", "pantry", 89, 5, 0, 17, 250, "ml", ["pantry"], 139, "Sen Soy"],
  ["mustard", "Горчица", "pantry", 162, 6, 10, 11, 170, "g", ["pantry"], 49, "Махеевъ"],
  ["vinegar", "Уксус яблочный", "pantry", 21, 0, 0, 0.9, 500, "ml", ["pantry"], 79, "Кинто"],
  ["spices", "Набор специй", "pantry", 250, 10, 7, 50, 50, "g", ["pantry"], 89, "Kotanyi"],
  ["mayo", "Майонез", "pantry", 624, 0.8, 67, 2.6, 400, "g", ["pantry"], 99, "Слобода"],
  ["ketchup", "Кетчуп", "pantry", 101, 1.8, 0.3, 23, 350, "g", ["pantry"], 79, "Heinz"],
  ["jam", "Варенье", "pantry", 250, 0.4, 0.1, 62, 350, "g", ["pantry"], 129, "Варенька"],
  ["dark_chocolate", "Тёмный шоколад", "snack", 546, 6, 35, 52, 90, "g", ["snack"], 119, "Алёнка"],
  ["rice_cakes", "Хлебцы", "snack", 310, 10, 2.5, 64, 100, "g", ["snack"], 69, "Dr.Korner"],
  ["hummus", "Хумус", "snack", 177, 8, 10, 14, 200, "g", ["snack", "vegetarian"], 129, "Sababa"],
  ["pita", "Пита", "grain", 275, 9, 1.2, 56, 300, "g", ["grain"], 79, "Левашово"],
  ["coconut_milk", "Кокосовое молоко", "pantry", 197, 2, 21, 3, 400, "ml", ["pantry"], 119, "Aroy-D"],
  ["curry_paste", "Паста карри", "pantry", 120, 3, 7, 12, 100, "g", ["pantry"], 169, "Aroy-D"],
  ["canned_corn", "Кукуруза консервированная", "vegetable", 58, 2.2, 0.4, 11, 340, "g", ["vegetable"], 72, "Бондюэль"],
  ["olives", "Оливки", "fat", 145, 1, 15, 4, 300, "g", ["fat"], 139, "Iberica"],
  ["capers", "Каперсы", "pantry", 23, 2.4, 0.9, 4.9, 100, "g", ["pantry"], 129, "Iberica"],
  ["rice_vinegar", "Рисовый уксус", "pantry", 54, 0.3, 0, 13, 250, "ml", ["pantry"], 119, "Sen Soy"],
  ["sesame", "Кунжут", "fat", 573, 18, 50, 23, 100, "g", ["fat"], 79, "Семушка"],
  ["yogurt_drink", "Айран", "dairy", 35, 1.8, 1.2, 3.5, 500, "ml", ["dairy"], 69, "Слобода"],
  [" twarog wait"],
].filter((row) => !String(row[0]).includes("wait"));

rawProducts.push(
  ["quark_soft", "Творожная масса", "dairy", 232, 12, 15, 12, 200, "g", ["dairy"], 89, "Простоквашино"],
  ["herring", "Сельдь", "protein", 161, 18, 9, 0, 400, "g", ["fish"], 169, "Русское море"],
  ["chicken_liver", "Куриная печень", "protein", 136, 20, 6, 1, 500, "g", ["chicken", "meat"], 149, "Петруха"],
  ["cabbage_savoy", "Капуста пекинская", "vegetable", 16, 1.2, 0.2, 3.2, 500, "g", ["vegetable"], 79, "Своя грядка"],
  ["radish", "Редис", "vegetable", 16, 0.7, 0.1, 3.4, 300, "g", ["vegetable"], 69, "Своя грядка"],
  ...EXTRA_PRODUCTS,
);

const seenIds = new Set();
for (let i = rawProducts.length - 1; i >= 0; i -= 1) {
  const id = rawProducts[i][0];
  if (seenIds.has(id)) rawProducts.splice(i, 1);
  else seenIds.add(id);
}

const CAT_MICRO = {
  protein: [0, 1.1],
  dairy: [0, 0.1],
  grain: [2.8, 1.2],
  vegetable: [2.4, 0.8],
  fruit: [2.4, 0.3],
  fat: [0.4, 0.3],
  pantry: [0.5, 1.0],
  snack: [2.0, 1.2],
};

const MICRO = {
  chicken_breast: [0, 0.4],
  chicken_thigh: [0, 1.0],
  turkey_fillet: [0, 0.7],
  ground_turkey: [0, 1.1],
  ground_chicken: [0, 0.9],
  beef: [0, 2.6],
  ground_beef: [0, 2.4],
  pork_tenderloin: [0, 1.0],
  salmon: [0, 0.8],
  pollock: [0, 0.3],
  cod: [0, 0.4],
  tuna_can: [0, 1.4],
  shrimp: [0, 1.8],
  eggs: [0, 1.8],
  tofu: [0.3, 2.7],
  lentils: [7.9, 3.3],
  chickpeas: [7.6, 2.9],
  beans: [6.4, 2.1],
  cottage_cheese: [0, 0.4],
  oats: [10.1, 4.3],
  buckwheat: [3.7, 1.3],
  spinach: [2.2, 2.7],
  broccoli: [2.6, 0.7],
  chicken_liver: [0, 9.0],
  herring: [0, 1.0],
  seeds: [27, 5.7],
  nuts: [6.7, 2.9],
  bread: [6.0, 2.5],
  quinoa: [2.8, 1.5],
  millet: [1.3, 0.8],
  barley: [3.8, 1.3],
  peas: [5.1, 1.5],
  beet: [2.8, 0.8],
  pumpkin: [0.5, 0.8],
  avocado: [6.7, 0.6],
  dark_chocolate: [10.9, 11.9],
  hummus: [6.0, 2.4],
};

function micros(id, category) {
  return MICRO[id] || CAT_MICRO[category] || [0, 0];
}

const products = rawProducts.map((row) => {
  const [id, name, category, cal, p, f, c, pack, unit, tags] = row;
  const [fiber, iron] = micros(id, category);
  return {
    id,
    canonical_name: name,
    category,
    calories_per_100g: cal,
    protein_per_100g: p,
    fat_per_100g: f,
    carbs_per_100g: c,
    fiber_per_100g: fiber,
    iron_per_100g: iron,
    package_weight: pack,
    unit,
    tags,
  };
});

const updatedAt = "2026-08-01T00:00:00.000Z";
const storeProducts = [];
for (const product of rawProducts) {
  const [id, name, , , , , , pack, , , price, brand] = product;
  for (const store of stores) {
    const factor = storePriceFactor[store.id] * (1 + ((id.length + store.id.length) % 5) * 0.005 - 0.01);
    storeProducts.push({
      id: `${store.id}_${id}`,
      canonical_product_id: id,
      store_id: store.id,
      external_id: `${store.slug}-${id}`,
      name,
      brand,
      package_weight: pack,
      price: Math.round(price * factor),
      available: true,
      url: "",
      updated_at: updatedAt,
    });
  }
}

function n(productId, grams) {
  return { product_id: productId, grams };
}

function nutrition(ingredients) {
  let calories = 0;
  let protein = 0;
  let fat = 0;
  let carbs = 0;
  let fiber = 0;
  let iron = 0;
  for (const ing of ingredients) {
    const product = products.find((item) => item.id === ing.product_id);
    if (!product) throw new Error(`Unknown product ${ing.product_id}`);
    const k = ing.grams / 100;
    calories += product.calories_per_100g * k;
    protein += product.protein_per_100g * k;
    fat += product.fat_per_100g * k;
    carbs += product.carbs_per_100g * k;
    fiber += product.fiber_per_100g * k;
    iron += product.iron_per_100g * k;
  }
  return {
    calories: Math.round(calories * 10) / 10,
    protein: Math.round(protein * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fiber: Math.round(fiber * 10) / 10,
    iron: Math.round(iron * 10) / 10,
  };
}

const rawRecipes = [
  { id: "oats_banana", name: "Овсянка с бананом", cuisine: "european", meal_type: "breakfast", cooking_time: 10, difficulty: "easy", servings: 1, protein_source: "oats", tags: ["breakfast"], instructions: ["Залить овсянку кипятком или молоком.", "Добавить банан и мёд."], ingredients: [n("oats", 60), n("milk", 200), n("banana", 80), n("honey", 10)] },
  { id: "omelet_veg", name: "Омлет с овощами", cuisine: "european", meal_type: "breakfast", cooking_time: 15, difficulty: "easy", servings: 1, protein_source: "eggs", tags: ["breakfast", "vegetables"], instructions: ["Взбить яйца.", "Обжарить овощи и залить яйцами."], ingredients: [n("eggs", 120), n("tomato", 80), n("spinach", 40), n("olive_oil", 5)] },
  { id: "cottage_berries", name: "Творог с ягодами", cuisine: "russian", meal_type: "breakfast", cooking_time: 5, difficulty: "easy", servings: 1, protein_source: "dairy", tags: ["breakfast"], instructions: ["Смешать творог с ягодами и мёдом."], ingredients: [n("cottage_cheese", 180), n("berries", 70), n("honey", 10)] },
  { id: "greek_yogurt_honey", name: "Греческий йогурт с мёдом", cuisine: "mediterranean", meal_type: "breakfast", cooking_time: 5, difficulty: "easy", servings: 1, protein_source: "dairy", tags: ["breakfast"], instructions: ["Выложить йогурт, добавить мёд и орехи."], ingredients: [n("greek_yogurt", 200), n("honey", 15), n("nuts", 15)] },
  { id: "syrniki", name: "Сырники", cuisine: "russian", meal_type: "breakfast", cooking_time: 25, difficulty: "medium", servings: 1, protein_source: "dairy", tags: ["breakfast"], instructions: ["Смешать творог, яйцо и муку.", "Обжарить на сковороде."], ingredients: [n("cottage_cheese", 180), n("eggs", 50), n("flour", 30), n("sunflower_oil", 8)] },
  { id: "buckwheat_milk", name: "Гречневая каша на молоке", cuisine: "russian", meal_type: "breakfast", cooking_time: 20, difficulty: "easy", servings: 1, protein_source: "buckwheat", tags: ["breakfast"], instructions: ["Сварить гречку на молоке."], ingredients: [n("buckwheat", 70), n("milk", 220)] },
  { id: "toast_egg_avocado", name: "Тост с яйцом и авокадо", cuisine: "european", meal_type: "breakfast", cooking_time: 12, difficulty: "easy", servings: 1, protein_source: "eggs", tags: ["breakfast"], instructions: ["Поджарить хлеб.", "Размять авокадо, сверху яйцо."], ingredients: [n("bread", 70), n("eggs", 60), n("avocado", 70)] },
  { id: "omelet_cheese", name: "Омлет с сыром", cuisine: "european", meal_type: "breakfast", cooking_time: 12, difficulty: "easy", servings: 1, protein_source: "eggs", tags: ["breakfast"], instructions: ["Взбить яйца с сыром и пожарить."], ingredients: [n("eggs", 120), n("cheese", 30), n("milk", 30), n("butter", 5)] },
  { id: "millet_porridge", name: "Пшённая каша", cuisine: "russian", meal_type: "breakfast", cooking_time: 25, difficulty: "easy", servings: 1, protein_source: "millet", tags: ["breakfast"], instructions: ["Сварить пшено на молоке."], ingredients: [n("millet", 70), n("milk", 220), n("butter", 5)] },
  { id: "kefir_oats", name: "Овсянка на кефире", cuisine: "russian", meal_type: "breakfast", cooking_time: 8, difficulty: "easy", servings: 1, protein_source: "oats", tags: ["breakfast"], instructions: ["Замочить овсянку в кефире, добавить яблоко."], ingredients: [n("oats", 50), n("kefir", 200), n("apple", 80)] },
  { id: "chicken_teriyaki", name: "Курица терияки с рисом", cuisine: "asian", meal_type: "lunch", cooking_time: 30, difficulty: "medium", servings: 1, protein_source: "chicken", tags: ["lunch"], instructions: ["Обжарить курицу.", "Добавить соус терияки.", "Подать с рисом."], ingredients: [n("chicken_breast", 160), n("rice", 70), n("teriyaki", 20), n("broccoli", 80), n("soy_sauce", 8)] },
  { id: "chicken_bowl", name: "Куриный боул", cuisine: "asian", meal_type: "lunch", cooking_time: 25, difficulty: "easy", servings: 1, protein_source: "chicken", tags: ["lunch", "vegetables"], instructions: ["Собрать боул из риса, курицы и овощей."], ingredients: [n("chicken_breast", 150), n("rice", 60), n("cucumber", 70), n("carrot", 50), n("soy_sauce", 10)] },
  { id: "pasta_chicken", name: "Паста с курицей", cuisine: "italian", meal_type: "dinner", cooking_time: 25, difficulty: "easy", servings: 1, protein_source: "chicken", tags: ["dinner"], instructions: ["Отварить пасту.", "Обжарить курицу со сливками/сметаной."], ingredients: [n("pasta", 90), n("chicken_breast", 140), n("sour_cream", 40), n("garlic", 5), n("spices", 2)] },
  { id: "buckwheat_chicken", name: "Гречка с курицей", cuisine: "russian", meal_type: "lunch", cooking_time: 30, difficulty: "easy", servings: 1, protein_source: "chicken", tags: ["lunch"], instructions: ["Сварить гречку.", "Запечь или обжарить курицу."], ingredients: [n("buckwheat", 80), n("chicken_breast", 150), n("onion", 40), n("sunflower_oil", 8)] },
  { id: "turkey_veg", name: "Индейка с овощами", cuisine: "european", meal_type: "dinner", cooking_time: 35, difficulty: "easy", servings: 1, protein_source: "turkey", tags: ["dinner", "vegetables"], instructions: ["Запечь индейку с овощами."], ingredients: [n("turkey_fillet", 160), n("zucchini", 100), n("bell_pepper", 80), n("olive_oil", 8), n("spices", 2)] },
  { id: "pollock_potato", name: "Минтай с картофелем", cuisine: "russian", meal_type: "dinner", cooking_time: 35, difficulty: "easy", servings: 1, protein_source: "fish", tags: ["dinner"], instructions: ["Запечь рыбу и картофель."], ingredients: [n("pollock", 180), n("potato", 200), n("dill", 5), n("olive_oil", 8)] },
  { id: "salmon_rice", name: "Лосось с рисом", cuisine: "european", meal_type: "dinner", cooking_time: 25, difficulty: "medium", servings: 1, protein_source: "fish", tags: ["dinner"], instructions: ["Запечь лосось.", "Подать с рисом и лимоном."], ingredients: [n("salmon", 140), n("rice", 70), n("lemon", 20), n("broccoli", 80)] },
  { id: "cod_buckwheat", name: "Треска с гречкой", cuisine: "russian", meal_type: "lunch", cooking_time: 30, difficulty: "easy", servings: 1, protein_source: "fish", tags: ["lunch"], instructions: ["Приготовить треску на пару или в духовке.", "Подать с гречкой."], ingredients: [n("cod", 170), n("buckwheat", 70), n("lemon", 15), n("olive_oil", 6)] },
  { id: "chicken_cutlets", name: "Куриные котлеты", cuisine: "russian", meal_type: "lunch", cooking_time: 30, difficulty: "medium", servings: 1, protein_source: "chicken", tags: ["lunch"], instructions: ["Смешать фарш, сформировать котлеты, обжарить."], ingredients: [n("ground_chicken", 160), n("onion", 40), n("eggs", 20), n("bread", 20), n("sunflower_oil", 8)] },
  { id: "turkey_meatballs", name: "Тефтели из индейки с рисом", cuisine: "russian", meal_type: "dinner", cooking_time: 35, difficulty: "medium", servings: 1, protein_source: "turkey", tags: ["dinner"], instructions: ["Сформировать тефтели, тушить в томатном соусе, подать с рисом."], ingredients: [n("ground_turkey", 150), n("rice", 70), n("tomato_paste", 20), n("onion", 40)] },
  { id: "borsch", name: "Борщ", cuisine: "russian", meal_type: "lunch", cooking_time: 40, difficulty: "medium", servings: 1, protein_source: "beef", tags: ["lunch", "vegetables"], instructions: ["Сварить бульон.", "Добавить овощи и свёклу."], ingredients: [n("beef", 80), n("beet", 80), n("cabbage", 80), n("potato", 80), n("carrot", 40), n("sour_cream", 20)] },
  { id: "shchi", name: "Щи", cuisine: "russian", meal_type: "lunch", cooking_time: 40, difficulty: "easy", servings: 1, protein_source: "chicken", tags: ["lunch", "vegetables"], instructions: ["Сварить куриный бульон с капустой."], ingredients: [n("chicken_thigh", 100), n("cabbage", 120), n("carrot", 40), n("potato", 80)] },
  { id: "chicken_soup", name: "Куриный суп", cuisine: "russian", meal_type: "lunch", cooking_time: 35, difficulty: "easy", servings: 1, protein_source: "chicken", tags: ["lunch"], instructions: ["Сварить курицу с овощами и лапшой."], ingredients: [n("chicken_breast", 120), n("carrot", 50), n("onion", 30), n("noodles", 40)] },
  { id: "lentil_soup", name: "Чечевичный суп", cuisine: "mediterranean", meal_type: "lunch", cooking_time: 35, difficulty: "easy", servings: 1, protein_source: "lentils", tags: ["lunch", "vegetarian", "vegetables"], instructions: ["Отварить чечевицу с овощами."], ingredients: [n("lentils", 80), n("carrot", 50), n("onion", 40), n("tomato_paste", 15), n("olive_oil", 8)] },
  { id: "pasta_light_carbonara", name: "Паста с яйцом и сыром", cuisine: "italian", meal_type: "dinner", cooking_time: 20, difficulty: "medium", servings: 1, protein_source: "eggs", tags: ["dinner"], instructions: ["Смешать горячую пасту с яйцом и сыром."], ingredients: [n("spaghetti", 90), n("eggs", 60), n("cheese", 30), n("olive_oil", 6)] },
  { id: "bolognese", name: "Спагетти болоньезе", cuisine: "italian", meal_type: "dinner", cooking_time: 35, difficulty: "medium", servings: 1, protein_source: "beef", tags: ["dinner"], instructions: ["Потушить фарш с томатами.", "Смешать со спагетти."], ingredients: [n("spaghetti", 90), n("ground_beef", 120), n("canned_tomatoes", 120), n("onion", 40)] },
  { id: "plov", name: "Плов с курицей", cuisine: "central_asian", meal_type: "lunch", cooking_time: 40, difficulty: "medium", servings: 1, protein_source: "chicken", tags: ["lunch"], instructions: ["Обжарить курицу с морковью и луком, добавить рис."], ingredients: [n("rice", 80), n("chicken_thigh", 140), n("carrot", 70), n("onion", 50), n("sunflower_oil", 10)] },
  { id: "turkey_stew", name: "Рагу из индейки", cuisine: "european", meal_type: "dinner", cooking_time: 40, difficulty: "easy", servings: 1, protein_source: "turkey", tags: ["dinner", "vegetables"], instructions: ["Тушить индейку с овощами."], ingredients: [n("turkey_fillet", 150), n("carrot", 60), n("zucchini", 80), n("onion", 40), n("tomato_paste", 15)] },
  { id: "chickpea_stew", name: "Овощное рагу с нутом", cuisine: "mediterranean", meal_type: "dinner", cooking_time: 35, difficulty: "easy", servings: 1, protein_source: "chickpeas", tags: ["dinner", "vegetarian", "vegetables"], instructions: ["Тушить нут с овощами и специями."], ingredients: [n("chickpeas", 80), n("zucchini", 80), n("bell_pepper", 70), n("canned_tomatoes", 100), n("olive_oil", 8)] },
  { id: "tofu_stirfry", name: "Тофу стир-фрай", cuisine: "asian", meal_type: "dinner", cooking_time: 20, difficulty: "easy", servings: 1, protein_source: "tofu", tags: ["dinner", "vegetarian", "vegetables"], instructions: ["Обжарить тофу и овощи, добавить соевый соус."], ingredients: [n("tofu", 150), n("broccoli", 80), n("bell_pepper", 70), n("soy_sauce", 12), n("rice", 60)] },
  { id: "greek_salad_chicken", name: "Греческий салат с курицей", cuisine: "mediterranean", meal_type: "lunch", cooking_time: 20, difficulty: "easy", servings: 1, protein_source: "chicken", tags: ["lunch", "salad", "vegetables"], instructions: ["Собрать салат, сверху курица."], ingredients: [n("chicken_breast", 130), n("tomato", 80), n("cucumber", 80), n("feta", 40), n("olive_oil", 8), n("olives", 20)] },
  { id: "caesar_chicken", name: "Цезарь с курицей", cuisine: "european", meal_type: "lunch", cooking_time: 20, difficulty: "easy", servings: 1, protein_source: "chicken", tags: ["lunch", "salad"], instructions: ["Собрать салат с курицей и сыром."], ingredients: [n("chicken_breast", 140), n("lettuce", 80), n("cheese", 20), n("bread", 20), n("olive_oil", 8)] },
  { id: "tuna_salad", name: "Салат с тунцом", cuisine: "mediterranean", meal_type: "lunch", cooking_time: 15, difficulty: "easy", servings: 1, protein_source: "fish", tags: ["lunch", "salad", "vegetables"], instructions: ["Смешать тунец с овощами и яйцом."], ingredients: [n("tuna_can", 90), n("eggs", 60), n("lettuce", 60), n("cucumber", 70), n("olive_oil", 6)] },
  { id: "baked_chicken_potato", name: "Запечённая курица с картофелем", cuisine: "russian", meal_type: "dinner", cooking_time: 40, difficulty: "easy", servings: 1, protein_source: "chicken", tags: ["dinner"], instructions: ["Запечь курицу и картофель со специями."], ingredients: [n("chicken_thigh", 180), n("potato", 200), n("garlic", 5), n("olive_oil", 8)] },
  { id: "chicken_cream", name: "Курица в сливочном соусе", cuisine: "european", meal_type: "dinner", cooking_time: 30, difficulty: "medium", servings: 1, protein_source: "chicken", tags: ["dinner"], instructions: ["Обжарить курицу, тушить в сметане."], ingredients: [n("chicken_breast", 160), n("sour_cream", 50), n("mushroom", 80), n("rice", 60)] },
  { id: "beef_buckwheat", name: "Говядина с гречкой", cuisine: "russian", meal_type: "lunch", cooking_time: 40, difficulty: "medium", servings: 1, protein_source: "beef", tags: ["lunch"], instructions: ["Тушить говядину, подать с гречкой."], ingredients: [n("beef", 140), n("buckwheat", 70), n("onion", 40), n("sunflower_oil", 8)] },
  { id: "shrimp_rice", name: "Креветки с рисом", cuisine: "asian", meal_type: "dinner", cooking_time: 20, difficulty: "easy", servings: 1, protein_source: "fish", tags: ["dinner"], instructions: ["Обжарить креветки с чесноком, подать с рисом."], ingredients: [n("shrimp", 150), n("rice", 70), n("garlic", 5), n("soy_sauce", 10), n("olive_oil", 6)] },
  { id: "chicken_fricassee", name: "Фрикасе из курицы", cuisine: "european", meal_type: "dinner", cooking_time: 35, difficulty: "medium", servings: 1, protein_source: "chicken", tags: ["dinner"], instructions: ["Тушить курицу со сметаной и овощами."], ingredients: [n("chicken_breast", 150), n("carrot", 50), n("peas", 50), n("sour_cream", 40), n("rice", 60)] },
  { id: "bulgur_chicken", name: "Булгур с курицей и овощами", cuisine: "mediterranean", meal_type: "lunch", cooking_time: 30, difficulty: "easy", servings: 1, protein_source: "chicken", tags: ["lunch", "vegetables"], instructions: ["Приготовить булгур, обжарить курицу с овощами."], ingredients: [n("bulgur", 70), n("chicken_breast", 140), n("bell_pepper", 70), n("zucchini", 70)] },
  { id: "quinoa_bowl", name: "Боул с киноа", cuisine: "european", meal_type: "lunch", cooking_time: 25, difficulty: "easy", servings: 1, protein_source: "chicken", tags: ["lunch", "vegetables"], instructions: ["Собрать боул из киноа, курицы и овощей."], ingredients: [n("quinoa", 70), n("chicken_breast", 130), n("spinach", 50), n("cherry_tomato", 70), n("olive_oil", 8)] },
  { id: "baked_potato_cottage", name: "Картофель с творогом", cuisine: "russian", meal_type: "dinner", cooking_time: 35, difficulty: "easy", servings: 1, protein_source: "dairy", tags: ["dinner"], instructions: ["Запечь картофель, подать с творогом и зеленью."], ingredients: [n("potato", 250), n("cottage_cheese", 120), n("dill", 5), n("sour_cream", 20)] },
  { id: "stuffed_zucchini", name: "Кабачки с фаршем", cuisine: "russian", meal_type: "dinner", cooking_time: 40, difficulty: "medium", servings: 1, protein_source: "turkey", tags: ["dinner", "vegetables"], instructions: ["Нафаршировать кабачки, запечь."], ingredients: [n("zucchini", 200), n("ground_turkey", 130), n("rice", 30), n("tomato_paste", 20)] },
  { id: "stuffed_pepper", name: "Перец фаршированный", cuisine: "russian", meal_type: "dinner", cooking_time: 40, difficulty: "medium", servings: 1, protein_source: "chicken", tags: ["dinner", "vegetables"], instructions: ["Нафаршировать перцы рисом и фаршем, тушить."], ingredients: [n("bell_pepper", 180), n("ground_chicken", 130), n("rice", 40), n("tomato_paste", 20)] },
  { id: "cottage_casserole", name: "Творожная запеканка", cuisine: "russian", meal_type: "breakfast", cooking_time: 35, difficulty: "easy", servings: 1, protein_source: "dairy", tags: ["breakfast"], instructions: ["Смешать творог с яйцом, запечь."], ingredients: [n("cottage_cheese", 180), n("eggs", 50), n("semolina", 30)] },
  { id: "fish_cutlets", name: "Рыбные котлеты", cuisine: "russian", meal_type: "dinner", cooking_time: 30, difficulty: "medium", servings: 1, protein_source: "fish", tags: ["dinner"], instructions: ["Измельчить рыбу, сформировать котлеты, обжарить."], ingredients: [n("pollock", 180), n("eggs", 30), n("onion", 30), n("bread", 20), n("sunflower_oil", 8)] },
  { id: "beans_veg", name: "Фасоль с овощами", cuisine: "mediterranean", meal_type: "dinner", cooking_time: 30, difficulty: "easy", servings: 1, protein_source: "beans", tags: ["dinner", "vegetarian", "vegetables"], instructions: ["Тушить фасоль с овощами."], ingredients: [n("beans", 90), n("tomato", 80), n("onion", 40), n("carrot", 50), n("olive_oil", 8)] },
  { id: "hummus_veg", name: "Хумус с овощами и питой", cuisine: "mediterranean", meal_type: "snack", cooking_time: 10, difficulty: "easy", servings: 1, protein_source: "chickpeas", tags: ["snack", "vegetarian"], instructions: ["Подать хумус с питой и овощами."], ingredients: [n("hummus", 80), n("pita", 70), n("cucumber", 60), n("carrot", 40)] },
  { id: "shakshuka", name: "Шакшука", cuisine: "mediterranean", meal_type: "breakfast", cooking_time: 25, difficulty: "easy", servings: 1, protein_source: "eggs", tags: ["breakfast", "vegetables"], instructions: ["Потушить томаты и перец, вбить яйца."], ingredients: [n("eggs", 120), n("tomato", 150), n("bell_pepper", 80), n("onion", 40), n("olive_oil", 8)] },
  { id: "pasta_tuna", name: "Паста с тунцом", cuisine: "italian", meal_type: "lunch", cooking_time: 20, difficulty: "easy", servings: 1, protein_source: "fish", tags: ["lunch"], instructions: ["Смешать пасту с тунцом и томатами."], ingredients: [n("pasta", 90), n("tuna_can", 90), n("canned_tomatoes", 80), n("olive_oil", 6)] },
  { id: "chicken_skewers", name: "Куриные шашлычки с салатом", cuisine: "caucasian", meal_type: "dinner", cooking_time: 30, difficulty: "easy", servings: 1, protein_source: "chicken", tags: ["dinner", "salad"], instructions: ["Запечь курицу, подать с овощным салатом."], ingredients: [n("chicken_breast", 170), n("tomato", 80), n("cucumber", 80), n("lettuce", 50), n("olive_oil", 8)] },
  { id: "udon_chicken", name: "Удон с курицей", cuisine: "asian", meal_type: "dinner", cooking_time: 20, difficulty: "easy", servings: 1, protein_source: "chicken", tags: ["dinner"], instructions: ["Обжарить курицу и овощи, смешать с лапшой."], ingredients: [n("noodles", 120), n("chicken_breast", 140), n("bell_pepper", 70), n("soy_sauce", 12)] },
  { id: "chickpea_curry", name: "Карри с нутом", cuisine: "indian", meal_type: "dinner", cooking_time: 30, difficulty: "easy", servings: 1, protein_source: "chickpeas", tags: ["dinner", "vegetarian"], instructions: ["Тушить нут в кокосовом молоке с карри, подать с рисом."], ingredients: [n("chickpeas", 80), n("coconut_milk", 80), n("curry_paste", 12), n("rice", 70), n("spinach", 40)] },
  { id: "apple_cottage_snack", name: "Творог с яблоком", cuisine: "russian", meal_type: "snack", cooking_time: 5, difficulty: "easy", servings: 1, protein_source: "dairy", tags: ["snack"], instructions: ["Смешать творог с яблоком."], ingredients: [n("cottage_cheese", 120), n("apple", 80)] },
  { id: "yogurt_berries_snack", name: "Йогурт с ягодами", cuisine: "european", meal_type: "snack", cooking_time: 3, difficulty: "easy", servings: 1, protein_source: "dairy", tags: ["snack"], instructions: ["Смешать йогурт с ягодами."], ingredients: [n("greek_yogurt", 150), n("berries", 60)] },
  { id: "rice_cakes_pb", name: "Хлебцы с арахисовой пастой", cuisine: "european", meal_type: "snack", cooking_time: 3, difficulty: "easy", servings: 1, protein_source: "nuts", tags: ["snack"], instructions: ["Намазать хлебцы пастой, добавить банан."], ingredients: [n("rice_cakes", 30), n("peanut_butter", 20), n("banana", 60)] },
  { id: "omelet_dinner", name: "Омлет с грибами на ужин", cuisine: "european", meal_type: "dinner", cooking_time: 15, difficulty: "easy", servings: 1, protein_source: "eggs", tags: ["dinner", "vegetables"], instructions: ["Обжарить грибы, залить яйцами."], ingredients: [n("eggs", 150), n("mushroom", 100), n("spinach", 40), n("olive_oil", 6)] },
  { id: "liver_buckwheat", name: "Куриная печень с гречкой", cuisine: "russian", meal_type: "lunch", cooking_time: 25, difficulty: "easy", servings: 1, protein_source: "chicken", tags: ["lunch"], instructions: ["Обжарить печень с луком, подать с гречкой."], ingredients: [n("chicken_liver", 150), n("buckwheat", 70), n("onion", 50), n("sour_cream", 20)] },
  { id: "herring_potato", name: "Сельдь с картофелем", cuisine: "russian", meal_type: "dinner", cooking_time: 25, difficulty: "easy", servings: 1, protein_source: "fish", tags: ["dinner"], instructions: ["Отварить картофель, подать с сельдью и луком."], ingredients: [n("herring", 100), n("potato", 200), n("onion", 30), n("sunflower_oil", 8)] },
  { id: "side_cucumber_tomato", name: "Салат из огурцов и помидоров", cuisine: "russian", meal_type: "dinner", cooking_time: 10, difficulty: "easy", servings: 1, protein_source: "vegetables", tags: ["salad", "side", "vegetables"], instructions: ["Огурцы и помидоры нарежьте одинаковыми кусками.", "Добавьте тонко нарезанный лук и укроп.", "Заправьте маслом, посолите, перемешайте и дайте постоять 5 минут."], ingredients: [n("cucumber", 100), n("tomato", 100), n("onion", 20), n("sunflower_oil", 8), n("dill", 5)] },
  { id: "side_cabbage", name: "Капустный салат", cuisine: "russian", meal_type: "dinner", cooking_time: 12, difficulty: "easy", servings: 1, protein_source: "vegetables", tags: ["salad", "side", "vegetables"], instructions: ["Капусту тонко нашинкуйте и помните руками с солью.", "Добавьте тёртую морковь.", "Заправьте маслом и уберите в холодильник на 10 минут."], ingredients: [n("cabbage", 120), n("carrot", 40), n("sunflower_oil", 8), n("dill", 5)] },
  { id: "side_greek", name: "Греческий салат", cuisine: "mediterranean", meal_type: "dinner", cooking_time: 12, difficulty: "easy", servings: 1, protein_source: "vegetables", tags: ["salad", "side", "vegetables"], instructions: ["Крупно нарежьте помидоры, огурец и салат.", "Добавьте фету кубиками и оливки.", "Полейте оливковым маслом, не перемешивайте слишком сильно."], ingredients: [n("tomato", 80), n("cucumber", 80), n("lettuce", 50), n("feta", 30), n("olives", 20), n("olive_oil", 8)] },
  { id: "side_beet", name: "Свёкла с чесноком", cuisine: "russian", meal_type: "dinner", cooking_time: 15, difficulty: "easy", servings: 1, protein_source: "vegetables", tags: ["salad", "side", "vegetables"], instructions: ["Отварную свёклу натрите на крупной тёрке.", "Добавьте давленый чеснок, масло и укроп.", "Посолите и охладите 10 минут."], ingredients: [n("beet", 120), n("garlic", 5), n("sunflower_oil", 8), n("dill", 5)] },
  { id: "side_lettuce", name: "Зелёный салат с лимоном", cuisine: "european", meal_type: "dinner", cooking_time: 8, difficulty: "easy", servings: 1, protein_source: "vegetables", tags: ["salad", "side", "vegetables"], instructions: ["Листья порвите руками, огурец нарежьте.", "Смешайте масло с лимонным соком и солью.", "Заправьте прямо перед подачей."], ingredients: [n("lettuce", 80), n("cucumber", 70), n("tomato", 60), n("olive_oil", 8), n("lemon", 15)] },
  { id: "quick_tuna_toast", name: "Тосты с тунцом", cuisine: "european", meal_type: "lunch", cooking_time: 8, difficulty: "easy", servings: 1, protein_source: "fish", tags: ["lunch", "quick"], instructions: ["Поджарьте хлеб.", "Смешайте тунец с огурцом.", "Выложите на тосты."], ingredients: [n("bread", 80), n("tuna_can", 90), n("cucumber", 60), n("tomato", 50)] },
  { id: "quick_chicken_pita", name: "Пита с курицей", cuisine: "mediterranean", meal_type: "lunch", cooking_time: 12, difficulty: "easy", servings: 1, protein_source: "chicken", tags: ["lunch", "quick"], instructions: ["Разогрейте готовую курицу или обжарьте тонкие полоски 5–6 минут.", "Соберите питу с овощами."], ingredients: [n("pita", 80), n("chicken_breast", 120), n("lettuce", 40), n("tomato", 50), n("yogurt", 30)] },
  { id: "quick_cottage_lunch", name: "Творог с овощами", cuisine: "russian", meal_type: "lunch", cooking_time: 5, difficulty: "easy", servings: 1, protein_source: "dairy", tags: ["lunch", "quick"], instructions: ["Выложите творог.", "Нарежьте овощи и смешайте."], ingredients: [n("cottage_cheese", 180), n("cucumber", 80), n("tomato", 80), n("dill", 5)] },
];

const recipes = rawRecipes
  .map((recipe) => {
    const ingredients = recipe.ingredients.filter((ing) => ing.grams > 0 && products.some((p) => p.id === ing.product_id));
    if (ingredients.length === 0) return null;
    return {
      ...recipe,
      ingredients,
      ...nutrition(ingredients),
    };
  })
  .filter(Boolean);

writeFileSync(join(outDir, "stores.json"), JSON.stringify(stores, null, 2));
writeFileSync(join(outDir, "products.json"), JSON.stringify(products, null, 2));
writeFileSync(join(outDir, "store-products.json"), JSON.stringify(storeProducts, null, 2));
writeFileSync(join(outDir, "recipes.json"), JSON.stringify(recipes, null, 2));

console.log(`products=${products.length} storeProducts=${storeProducts.length} recipes=${recipes.length}`);
