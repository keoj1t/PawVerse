const popularFeeds = [
    {
        id: "royal_canin_mini_adult",
        brand: "Royal Canin",
        name: "Mini Adult",
        aliases: ["royal", "royal canin", "mini adult", "роял", "роял канин"],
        calories: 380,
        protein: 27,
        fat: 16,
        carbs: 35
    },
    {
        id: "royal_canin_maxi_puppy",
        brand: "Royal Canin",
        name: "Maxi Puppy",
        aliases: ["royal", "puppy", "maxi puppy", "роял", "щенок"],
        calories: 397,
        protein: 30,
        fat: 18,
        carbs: 30
    },
    {
        id: "royal_canin_indoor_27",
        brand: "Royal Canin",
        name: "Indoor 27 Cat",
        aliases: ["royal", "indoor", "cat", "роял", "индор"],
        calories: 374,
        protein: 27,
        fat: 13,
        carbs: 36
    },
    {
        id: "pro_plan_sensitive_skin_salmon",
        brand: "Pro Plan",
        name: "Sensitive Skin Salmon",
        aliases: ["pro", "pro plan", "salmon", "проплан", "про план"],
        calories: 410,
        protein: 29,
        fat: 18,
        carbs: 28
    },
    {
        id: "pro_plan_kitten_chicken",
        brand: "Pro Plan",
        name: "Kitten Chicken",
        aliases: ["pro", "kitten", "cat", "проплан", "котенок"],
        calories: 408,
        protein: 41,
        fat: 18,
        carbs: 20
    },
    {
        id: "hills_science_diet_adult",
        brand: "Hill's",
        name: "Science Diet Adult",
        aliases: ["hill", "hills", "science diet", "хиллс"],
        calories: 372,
        protein: 24,
        fat: 14,
        carbs: 40
    },
    {
        id: "hills_prescription_i_d",
        brand: "Hill's",
        name: "Prescription Diet i/d",
        aliases: ["hill", "hills", "i/d", "prescription", "хиллс"],
        calories: 391,
        protein: 22,
        fat: 14,
        carbs: 44
    },
    {
        id: "acana_puppy_recipe",
        brand: "Acana",
        name: "Puppy Recipe",
        aliases: ["acana", "akana", "puppy", "акана"],
        calories: 366,
        protein: 33,
        fat: 20,
        carbs: 22
    },
    {
        id: "orijen_original_dog",
        brand: "Orijen",
        name: "Original Dog",
        aliases: ["orijen", "ориджен", "original"],
        calories: 390,
        protein: 38,
        fat: 18,
        carbs: 19
    },
    {
        id: "brit_care_hypoallergenic",
        brand: "Brit Care",
        name: "Hypoallergenic Adult",
        aliases: ["brit", "brit care", "брит", "hypoallergenic"],
        calories: 385,
        protein: 26,
        fat: 15,
        carbs: 37
    },
    {
        id: "farmina_nd_lamb_blueberry",
        brand: "Farmina N&D",
        name: "Lamb & Blueberry",
        aliases: ["farmina", "n&d", "фармина", "lamb"],
        calories: 395,
        protein: 30,
        fat: 18,
        carbs: 26
    },
    {
        id: "whiskas_adult_chicken",
        brand: "Whiskas",
        name: "Adult Chicken",
        aliases: ["whiskas", "вискас", "cat", "chicken"],
        calories: 356,
        protein: 30,
        fat: 11,
        carbs: 35
    },
    {
        id: "monge_dog_medium",
        brand: "Monge",
        name: "Dog Medium Adult",
        aliases: ["monge", "монж", "medium adult"],
        calories: 392,
        protein: 26,
        fat: 16,
        carbs: 34
    }
];

function normalize(value) {
    return String(value || "").toLowerCase().trim();
}

function scoreMatch(item, q) {
    if (!q) return 0;
    const text = `${item.brand} ${item.name} ${item.aliases.join(" ")}`.toLowerCase();
    if (text.startsWith(q)) return 100;
    if (`${item.brand} ${item.name}`.toLowerCase().includes(q)) return 80;
    if (item.aliases.some(a => a.includes(q))) return 60;
    if (text.includes(q)) return 40;
    return 0;
}

function searchPopularFeeds(query, limit = 8) {
    const q = normalize(query);
    if (!q) return [];
    return popularFeeds
        .map(item => ({ item, score: scoreMatch(item, q) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(x => ({
            food_id: `local:${x.item.id}`,
            food_name: `${x.item.brand} ${x.item.name}`,
            brand_name: x.item.brand,
            food_description: `Per 100g: ${x.item.calories} kcal, P ${x.item.protein}g, F ${x.item.fat}g, C ${x.item.carbs}g`,
            source: "catalog",
            calories: x.item.calories,
            protein: x.item.protein,
            fat: x.item.fat,
            carbs: x.item.carbs,
            metric_serving_amount: 100,
            metric_serving_unit: "g"
        }));
}

module.exports = { searchPopularFeeds };
