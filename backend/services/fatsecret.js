const CLIENT_ID = "e5cb19e73e2c4fb3968a1c9c06e37f83";
const CLIENT_SECRET = "fcab2d871ff24a9b9e6a0afca0e79883";

let accessToken = null;
let tokenExpiry = null;

async function getAccessToken() {
    if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
        return accessToken;
    }

    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

    try {
        const response = await fetch("https://oauth.fatsecret.com/connect/token", {
            method: "POST",
            headers: {
                "Authorization": `Basic ${auth}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: "grant_type=client_credentials&scope=basic"
        });

        const data = await response.json();
        if (data.access_token) {
            accessToken = data.access_token;
            tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // 1 min buffer
            return accessToken;
        }
        throw new Error("Failed to get FatSecret token");
    } catch (error) {
        console.error("FatSecret Auth Error:", error);
        return null;
    }
}

async function searchFood(expression) {
    const token = await getAccessToken();
    if (!token) return [];

    try {
        const params = new URLSearchParams({
            method: "foods.search",
            search_expression: expression,
            format: "json",
            max_results: 10
        });

        const response = await fetch(`https://platform.fatsecret.com/rest/server.api?${params}`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();
        return data.foods?.food || [];
    } catch (error) {
        console.error("FatSecret Search Error:", error);
        return [];
    }
}

async function getFoodDetails(foodId) {
    const token = await getAccessToken();
    if (!token) return null;

    try {
        const params = new URLSearchParams({
            method: "food.get.v2",
            food_id: foodId,
            format: "json"
        });

        const response = await fetch(`https://platform.fatsecret.com/rest/server.api?${params}`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();
        return data.food || null;
    } catch (error) {
        console.error("FatSecret Details Error:", error);
        return null;
    }
}

module.exports = { searchFood, getFoodDetails };
