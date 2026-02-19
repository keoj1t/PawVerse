const API = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? (window.location.port === "3000" ? "" : "http://localhost:3000")
    : window.location.origin;
let currentUser = null;
let currentLang = localStorage.getItem("lang") || "ru";

// ===================== TOAST =====================
function showToast(msg, type = "info") {
    const c = document.getElementById("toastContainer");
    const t = document.createElement("div");
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// ===================== LOADER =====================
function showLoader() { document.getElementById("loaderOverlay").classList.add("active"); }
function hideLoader() { document.getElementById("loaderOverlay").classList.remove("active"); }

// ===================== AUTH HEADERS =====================
function authHeaders() {
    const token = localStorage.getItem("token");
    return { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) };
}

// ===================== PAGE SWITCHING =====================
function goToPage(page) {
    document.querySelectorAll(".page-section").forEach(s => s.classList.remove("active"));
    const target = document.getElementById(page);
    if (target) target.classList.add("active");

    // Highlight nav: sub-pages highlight 'services'
    const navPage = ["nutrition", "training", "clinicServices", "tracking", "quizzes"].includes(page) ? "services" : page;
    document.querySelectorAll("header .nav-link").forEach(l => {
        l.classList.toggle("active", l.dataset.page === navPage);
    });

    if (page === "clinicServices") loadClinicServices();
    if (page === "nutrition") initNutritionPage();
    if (page === "training") initTrainingPage();
    if (page === "tracking") {
        // Ensure map container is visible before initializing Leaflet
        const section = document.getElementById("tracking");
        if (section) section.style.display = "block";
        setTimeout(() => {
            initTrackingPage();
            if (trackingMap) trackingMap.invalidateSize(); // CRITICAL for maps in hidden/flex containers
        }, 50);
    }

    // Show/hide testimonials ONLY on hero page
    const testimonials = document.getElementById("testimonials");
    if (testimonials) testimonials.style.display = (page === "hero") ? "block" : "none";

    // Show PawBot on ALL pages when logged in
    const bubble = document.getElementById("aiChatBubble");
    if (bubble) bubble.style.display = currentUser ? "flex" : "none";
    // Update PawCoins display
    updatePawCoinsDisplay();
}

function updateNavVisibility() {
    const loggedIn = !!localStorage.getItem("token");
    document.querySelectorAll(".nav-link[data-auth]").forEach(el => {
        const req = el.dataset.auth;
        if (req === "true") el.hidden = !loggedIn;
        if (req === "false") el.hidden = loggedIn;
    });
    // Cabinet button
    const cab = document.getElementById("cabinetToggle");
    if (cab) cab.style.display = loggedIn ? "" : "none";
    updateHeroButton();
}

function updateHeroButton() {
    const btn = document.getElementById("heroCta");
    if (!btn) return;
    const loggedIn = !!localStorage.getItem("token");
    if (loggedIn) {
        btn.textContent = "Смотреть услуги";
        btn.setAttribute("onclick", "goToPage('services')");
    } else {
        btn.textContent = "Начать";
        btn.setAttribute("onclick", "goToPage('auth')");
    }
}

// ===================== REGISTER =====================
async function register(e) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    showLoader();
    try {
        const res = await fetch(`${API}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                phone: form.phone.value.trim(),
                password: form.password.value,
                name: form.uname.value.trim(),
                role: form.role.value,
            }),
        });
        const data = await res.json();
        if (res.ok) {
            showToast("Регистрация успешна! Войдите в аккаунт.", "success");
            switchAuthTab("login");
        } else {
            showToast(data.error || "Ошибка регистрации", "error");
        }
    } catch { showToast("Сервер недоступен", "error"); }
    finally { btn.disabled = false; hideLoader(); }
}

// ===================== LOGIN =====================
async function login(e) {
    if (e && e.preventDefault) e.preventDefault();
    const form = typeof e === "object" && e.target ? e.target : null;
    let phone, password;

    if (form) {
        phone = form.phone.value.trim();
        password = form.password.value;
    } else {
        phone = arguments[0];
        password = arguments[1];
    }

    showLoader();
    try {
        const res = await fetch(`${API}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone, password }),
        });
        const data = await res.json();
        if (data.token) {
            localStorage.setItem("token", data.token);
            showToast("Вход выполнен!", "success");
            await loadUser();
            updateNavVisibility();
            goToPage("hero");
        } else {
            showToast(data.error || "Ошибка входа", "error");
        }
    } catch { showToast("Сервер недоступен", "error"); }
    finally { hideLoader(); }
}

function logout() {
    localStorage.removeItem("token");
    currentUser = null;
    updateNavVisibility();
    goToPage("hero");
    showToast("Вы вышли из аккаунта", "info");
}

// ===================== LOAD USER =====================
async function loadUser() {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
        const res = await fetch(`${API}/me`, { headers: authHeaders() });
        if (!res.ok) { logout(); return; }
        currentUser = await res.json();
        renderProfile();
        loadPets();
        loadBookings();
        if (currentUser.role === "PARTNER") loadPartnerBookings();
        initNutritionPage(); // Refresh pet cards for nutrition
    } catch { /* silent */ }
}

function renderProfile() {
    if (!currentUser) return;
    document.getElementById("profileName").textContent = currentUser.name || "—";
    document.getElementById("profilePhone").textContent = currentUser.phone || "—";
    document.getElementById("profileRole").textContent = currentUser.role === "PARTNER" ? "Партнёр" : "Владелец";
    // Set city
    const citySelect = document.getElementById("profileCitySelect");
    if (citySelect && currentUser.city) citySelect.value = currentUser.city;
    // Show/hide partner tab
    const partnerTab = document.getElementById("cabTabPartner");
    if (partnerTab) partnerTab.style.display = currentUser.role === "PARTNER" ? "" : "none";
}

async function updateUserCity() {
    const city = document.getElementById("profileCitySelect")?.value;
    if (!city || !currentUser) return;
    currentUser.city = city;
    try {
        await fetch(`${API}/auth/city`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ city })
        });
        showToast("Город обновлён!", "success");
    } catch { /* silent */ }
}

// ===================== PETS =====================
let pendingPetAvatarDataUrl = null;

function getPetInitial(name) {
    const raw = String(name || "").trim();
    return raw ? raw[0].toUpperCase() : "?";
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

async function loadPets() {
    try {
        const res = await fetch(`${API}/pets`, { headers: authHeaders() });
        const pets = await res.json();
        const container = document.getElementById("petsList");
        if (!container) return;
        container.innerHTML = "";
        if (pets.length === 0) {
            container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.9rem;">Нет питомцев. Добавьте!</p>';
            return;
        }
        pets.forEach(pet => {
            const el = document.createElement("div");
            el.className = "cab-card pet-card-enhanced";

            const petInitial = getPetInitial(pet.name);
            const safeName = escapeHtml(pet.name);
            const avatarHtml = pet.avatarUrl
                ? `<img src="${pet.avatarUrl}" class="pet-avatar-img" alt="${safeName}">`
                : `<div class="pet-avatar-fallback">${petInitial}</div>`;

            const gpsStatus = pet.deviceId
                ? `<span class="gps-badge online"><i class="fas fa-satellite-dish"></i> ${pet.deviceId}</span>`
                : `<button class="btn btn-xs btn-outline gps-link-btn" onclick="openLinkGpsModal('${pet.id}')"><i class="fas fa-plus"></i> Привязать GPS</button>`;

            const isLost = pet.isLost || false;

            el.innerHTML = `
                <div style="display:flex;gap:15px;align-items:center;margin-bottom:12px;">
                    ${avatarHtml}
                    <div style="flex:1;">
                        <div style="font-weight:800;font-size:1.1rem;display:flex;justify-content:space-between;align-items:center;">
                            ${pet.name}
                            ${gpsStatus}
                        </div>
                        <div style="color:rgba(255,255,255,0.6);font-size:0.85rem;">${pet.breed}, ${pet.age} лет</div>
                    </div>
                </div>
                
                <div class="cab-row"><span class="cab-label">Вес</span><span class="cab-value">${pet.weight} кг</span></div>
                
                <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
                    <a href="https://t.me/pawverse_bot?start=${pet.id}" target="_blank" class="btn btn-xs btn-primary">
                        <i class="fas fa-magic"></i> AI Аватар
                    </a>
                    <button class="btn btn-xs btn-outline" onclick="openAvatarModalForPet('${pet.id}')">
                        <i class="fas fa-image"></i> Аватар
                    </button>
                    <button class="btn btn-xs ${isLost ? 'btn-danger' : 'btn-outline'}" onclick="toggleLostStatus('${pet.id}', ${!isLost})">
                        <i class="fas fa-bullhorn"></i> ${isLost ? 'Я нашел!' : 'Потерялся!'}
                    </button>
                </div>
            `;
            container.appendChild(el);
        });
    } catch (err) { console.error(err); }
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function compressImageFile(file, maxSize = 512, quality = 0.82) {
    const originalDataUrl = await readFileAsDataUrl(file);
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
            const width = Math.max(1, Math.round(img.width * scale));
            const height = Math.max(1, Math.round(img.height * scale));
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = () => resolve(originalDataUrl);
        img.src = originalDataUrl;
    });
}

async function handleAddPetAvatarFileInput(input) {
    const file = input?.files?.[0];
    if (!file) {
        pendingPetAvatarDataUrl = null;
        return;
    }
    try {
        pendingPetAvatarDataUrl = await compressImageFile(file, 512, 0.82);
    } catch {
        pendingPetAvatarDataUrl = null;
        showToast("Не удалось загрузить фото аватара", "error");
    }
}

async function openAvatarModalForPet(petId) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.opacity = "0";

    input.onchange = async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) return;
        try {
            const dataUrl = await compressImageFile(file, 512, 0.82);
            await updatePetAvatar(petId, dataUrl);
        } catch {
            showToast("Не удалось прочитать файл", "error");
        }
    };

    document.body.appendChild(input);
    input.click();
}

async function updatePetAvatar(petId, avatarUrl) {
    showLoader();
    try {
        const res = await fetch(`${API}/pets/${petId}/avatar`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ avatarUrl })
        });
        const responseText = await res.text();
        let payload = {};
        try { payload = responseText ? JSON.parse(responseText) : {}; } catch { payload = {}; }
        if (!res.ok) throw new Error(payload.error || `Ошибка обновления аватара (${res.status})`);
        showToast("Аватар питомца обновлён", "success");
        await loadPets();
        await loadTrackingPets();
    } catch (e) {
        const msg = String(e.message || "");
        if (msg.includes("413") || msg.toLowerCase().includes("payload")) {
            showToast("Файл слишком большой. Попробуйте фото меньшего размера.", "error");
        } else {
            showToast(msg || "Ошибка обновления аватара", "error");
        }
    } finally {
        hideLoader();
    }
}

window.openAvatarModalForPet = openAvatarModalForPet;

async function toggleLostStatus(petId, status) {
    showLoader();
    try {
        const res = await fetch(`${API}/pets/${petId}/lost`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ isLost: status })
        });
        if (res.ok) {
            showToast(status ? "Объявление о пропаже создано!" : "Ура! Питомец нашелся!", "success");
            loadPets();
        } else {
            const d = await res.json();
            showToast(d.error || "Ошибка", "error");
        }
    } catch { showToast("Сервер недоступен", "error"); }
    finally { hideLoader(); }
}

function openLinkGpsModal(petId) {
    const deviceId = prompt("Введите ID вашего GPS-трекера:");
    if (deviceId && deviceId.trim()) {
        linkGpsToPet(petId, deviceId.trim());
    }
}

async function linkGpsToPet(petId, deviceId) {
    showLoader();
    try {
        const res = await fetch(`${API}/pets/${petId}/link-gps`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ deviceId })
        });
        if (res.ok) {
            showToast("GPS трекер привязан!", "success");
            loadPets();
        } else {
            const d = await res.json();
            showToast(d.error || "Ошибка", "error");
        }
    } catch { showToast("Сервер недоступен", "error"); }
    finally { hideLoader(); }
}

async function addPet(e) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    showLoader();
    try {
        const avatarFromUrl = form.petAvatarUrl ? form.petAvatarUrl.value.trim() : "";
        const avatarPayload = pendingPetAvatarDataUrl || avatarFromUrl || null;
        const res = await fetch(`${API}/pets`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
                name: form.petName.value.trim(),
                breed: form.petBreed.value.trim(),
                age: parseInt(form.petAge.value),
                weight: parseFloat(form.petWeight.value),
                avatarUrl: avatarPayload,
                hasGps: form.hasGps ? form.hasGps.checked : false,
                deviceId: form.deviceId ? form.deviceId.value.trim() : null
            }),
        });
        if (res.ok) {
            showToast("Питомец добавлен!", "success");
            form.reset();
            pendingPetAvatarDataUrl = null;
            loadPets();
        } else {
            const d = await res.json();
            showToast(d.error || "Ошибка", "error");
        }
    } catch { showToast("Сервер недоступен", "error"); }
    finally { btn.disabled = false; hideLoader(); }
}
// ===================== GPS TRACKING = [PHASE 4] =====================
let trackingMap = null;
let petMarkers = {};
let trackingUpdateInterval = null;

async function initTrackingPage() {
    const mapContainer = document.getElementById("trackingMap");
    if (!mapContainer) return;

    if (!trackingMap) {
        initTrackingMap();
    }

    loadTrackingPets();

    // Start periodic updates (mock or real)
    if (trackingUpdateInterval) clearInterval(trackingUpdateInterval);
    trackingUpdateInterval = setInterval(loadTrackingPets, 5000);
}

function initTrackingMap() {
    // Default center Astana
    trackingMap = L.map('trackingMap', { zoomControl: false }).setView([51.1694, 71.4491], 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors &copy; <a href=\"https://carto.com/attributions\">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(trackingMap);

    L.control.zoom({ position: 'bottomright' }).addTo(trackingMap);
}

async function loadTrackingPets() {
    try {
        const res = await fetch(`${API}/pets`, { headers: authHeaders() });
        const pets = await res.json();
        const gpsPets = pets.filter(p => p.deviceId);

        const container = document.getElementById("trackingPetList");
        if (!container) return;

        if (gpsPets.length === 0) {
            container.innerHTML = '<p class="empty-list-msg">Нет активных устройств. Добавьте GPS в профиле питомца.</p>';
            // Even if no pets, ensure map is visible (it was already init in initTrackingPage)
            if (trackingMap) trackingMap.invalidateSize();
            return;
        }

        container.innerHTML = "";
        gpsPets.forEach(pet => {
            // Mock location for demo if not present in DB
            const lat = pet.lat || (51.1694 + (Math.random() - 0.5) * 0.02);
            const lng = pet.lng || (71.4491 + (Math.random() - 0.5) * 0.02);

            // Sidebar item
            const item = document.createElement("div");
            item.className = "tracking-pet-item";
            item.onclick = () => focusOnPet(pet.id, lat, lng);
            item.innerHTML = `
                <div style=\"display:flex;gap:12px;align-items:center;\">
                    ${pet.avatarUrl ? `<img src=\"${pet.avatarUrl}\" class=\"tracking-pet-avatar\" alt=\"${escapeHtml(pet.name)}\">` : `<div class=\"tracking-pet-avatar tracking-pet-avatar-fallback\">${getPetInitial(pet.name)}</div>`}
                    <div style=\"flex:1;\">
                        <div style=\"font-weight:700;font-size:0.9rem;\">${pet.name}</div>
                        <div style=\"font-size:0.75rem;color:rgba(255,255,255,0.5);\">${pet.deviceId}</div>
                    </div>
                    <div style=\"font-size:0.7rem;color:#2ecc71;\">? Active</div>
                </div>
            `;
            container.appendChild(item);

            // Map marker
            updatePetMarker(pet, lat, lng);
        });
    } catch (err) { console.error(err); }
}

function updatePetMarker(pet, lat, lng) {
    if (!trackingMap) return;
    const initial = getPetInitial(pet.name);
    const avatarInner = pet.avatarUrl
        ? `<img src="${pet.avatarUrl}" alt="${escapeHtml(pet.name)}" />`
        : `<span>${initial}</span>`;

    const icon = L.divIcon({
        className: 'custom-pet-marker',
        html: `
            <div class=\"pet-marker-container\">
                <div class=\"pet-marker-avatar ${pet.avatarUrl ? '' : 'no-image'}\">${avatarInner}</div>
                <div class=\"pet-marker-pin\"></div>
                ${pet.isLost ? '<div style=\"position:absolute;top:-10px;right:-10px;background:#e74c3c;color:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;box-shadow:0 0 5px #e74c3c;\">!</div>' : ''}
            </div>
        `,
        iconSize: [40, 50],
        iconAnchor: [20, 50]
    });

    if (petMarkers[pet.id]) {
        petMarkers[pet.id].setLatLng([lat, lng]);
        petMarkers[pet.id].setIcon(icon);
    } else {
        petMarkers[pet.id] = L.marker([lat, lng], { icon }).addTo(trackingMap)
            .bindPopup(`<b>${pet.name}</b><br>${pet.isLost ? '<span style=\"color:#e74c3c\">ПОТЕРЯН</span>' : 'В безопасности'}`);
    }
}

function focusOnPet(id, lat, lng) {
    if (trackingMap) {
        trackingMap.flyTo([lat, lng], 16);
        petMarkers[id].openPopup();
    }
}

function recenterMap() {
    if (trackingMap) {
        const group = L.featureGroup(Object.values(petMarkers));
        if (group.getLayers().length > 0) {
            trackingMap.fitBounds(group.getBounds().pad(0.1));
        }
    }
}

function toggleHeatmap() {
    showToast("Функция тепловой карты будет доступна в следующем обновлении", "info");
}

// ===================== CLINIC SERVICES =====================
const cityCoords = {
    "Astana": [51.1694, 71.4491],
    "Almaty": [43.2389, 76.8897],
    "Shymkent": [42.3417, 69.5901]
};
let clinicMap = null;

// Real zoo and vet clinic locations with full details
const realClinicLocations = {
    Astana: [
        { name: "Зооцентр 'Барыс'", type: "vet", lat: 51.1280, lng: 71.4300, icon: "fa-hospital", rating: 4.8, phone: "+7 (7172) 40-50-60", hours: "08:00-22:00", services: ["Вакцинация", "Терапия", "УЗИ"] },
        { name: "ВетКлиника 'Айболит'", type: "vet", lat: 51.1500, lng: 71.4100, icon: "fa-stethoscope", rating: 4.7, phone: "+7 (7172) 22-33-44", hours: "09:00-21:00", services: ["Хирургия", "Стоматология"] },
        { name: "Груминг 'Лапки'", type: "grooming", lat: 51.1350, lng: 71.4550, icon: "fa-cut", rating: 4.9, phone: "+7 (7172) 99-00-11", hours: "10:00-20:00", services: ["Стрижка", "Мытье"] },
        { name: "Groom & Care", type: "grooming", lat: 51.1605, lng: 71.4661, icon: "fa-scissors", rating: 4.6, phone: "+7 (7172) 48-88-41", hours: "10:00-19:00", services: ["Тримминг", "SPA"] }
    ],
    Almaty: [
        { name: "ВетСервис Алматы", type: "vet", lat: 43.2380, lng: 76.8890, icon: "fa-user-md", rating: 4.9, phone: "+7 (727) 300-40-50", hours: "08:00-23:00", services: ["Анализы", "Рентген"] },
        { name: "Alma Vet Family", type: "vet", lat: 43.2500, lng: 76.9100, icon: "fa-clinic-medical", rating: 4.5, phone: "+7 (727) 250-60-70", hours: "09:00-22:00", services: ["Терапия", "Кардиология"] },
        { name: "Grooming Point", type: "grooming", lat: 43.2356, lng: 76.9024, icon: "fa-cut", rating: 4.7, phone: "+7 (727) 377-51-12", hours: "10:00-21:00", services: ["Стрижка", "Мытье"] }
    ],
    Shymkent: [
        { name: "ВетМир", type: "vet", lat: 42.3360, lng: 69.5550, icon: "fa-stethoscope", rating: 4.4, phone: "+7 (7252) 60-11-33", hours: "08:30-20:30", services: ["Общий осмотр", "Прививки"] },
        { name: "Elite Grooming", type: "grooming", lat: 42.3450, lng: 69.6050, icon: "fa-cut", rating: 4.3, phone: "+7 (7252) 55-33-77", hours: "10:00-19:00", services: ["Тримминг", "Ванна"] }
    ]
};
const typeLabels = { vet: "Вет. клиника", grooming: "Груминг" };
const typeColors = { vet: "#e74c3c", grooming: "#9b59b6" };

function renderStars(rating) {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '☆' : '') + '☆'.repeat(empty);
}

async function loadClinicServices() {
    try {
        const citySelect = document.getElementById("profileCitySelect");
        const city = currentUser?.city || (citySelect ? citySelect.value : "Astana");

        let services = [];
        try {
            const res = await fetch(`${API}/services?city=${city}`);
            services = await res.json();
        } catch { /* no backend services */ }

        const coords = cityCoords[city] || cityCoords["Astana"];

        // Leaflet Map
        if (clinicMap) clinicMap.remove();
        clinicMap = L.map('clinicMap').setView(coords, 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(clinicMap);

        const grid = document.getElementById("servicesGrid");
        grid.innerHTML = "";

        const locations = (realClinicLocations[city] || []).filter(loc => ["vet", "grooming"].includes(loc.type));
        locations.forEach(loc => {
            const color = typeColors[loc.type] || "#3498db";

            // Leaflet Marker with colored icon
            const customIcon = L.divIcon({
                html: `<div style="background:${color};color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);"><i class="fas ${loc.icon}" style="font-size:14px;"></i></div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 32],
                className: ''
            });
            L.marker([loc.lat, loc.lng], { icon: customIcon })
                .addTo(clinicMap)
                .bindPopup(`
                    <b>${loc.name}</b><br>
                    ${typeLabels[loc.type]}<br>
                    Рейтинг: ${loc.rating}<br>
                    Время: ${loc.hours || "Не указано"}<br>
                    Телефон: ${loc.phone}<br>
                    <button class="btn btn-sm" style="margin-top:8px;" onclick="openLocalClinicBooking('${loc.name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}','${loc.type}')">Записаться</button>
                `);

            // Rich card
            const card = document.createElement("div");
            card.className = "clinic-card";
            card.innerHTML = `
                <div class="clinic-card-header">
                    <div class="clinic-card-icon" style="background:${color}"><i class="fas ${loc.icon}"></i></div>
                    <div class="clinic-card-info">
                        <div class="clinic-card-name">${loc.name}</div>
                        <div class="clinic-card-type">${typeLabels[loc.type] || loc.type}</div>
                    </div>
                </div>
                <div class="clinic-card-rating">
                    <span class="stars">${renderStars(loc.rating)}</span>
                    <span>${loc.rating}</span>
                </div>
                <div class="clinic-card-phone">
                    <i class="fas fa-phone"></i>
                    <a href="tel:${loc.phone.replace(/[^+\d]/g, '')}" style="color:inherit;text-decoration:none;">${loc.phone}</a>
                </div>
                <div class="clinic-card-phone">
                    <i class="fas fa-clock"></i>
                    <span>${loc.hours || "Не указано"}</span>
                </div>
                <div class="clinic-card-services">
                    ${loc.services.map(s => `<span class="clinic-service-tag">${s}</span>`).join('')}
                </div>
                <div class="clinic-card-footer">
                    <button class="btn btn-sm" onclick="openLocalClinicBooking('${loc.name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}','${loc.type}')">
                        <i class="fas fa-calendar-check"></i> Записаться
                    </button>
                </div>
            `;
            grid.appendChild(card);
        });

        services.forEach(svc => {
            const card = document.createElement("div");
            card.className = "clinic-card";
            const isLoggedIn = !!localStorage.getItem("token");
            card.innerHTML = `
                <div class="clinic-card-header">
                    <div class="clinic-card-icon" style="background:linear-gradient(135deg,#7c3aed,#ff8c42)"><i class="fas fa-paw"></i></div>
                    <div class="clinic-card-info">
                        <div class="clinic-card-name">${svc.title}</div>
                        <div class="clinic-card-type">${svc.description || "Услуга PawVerse"}</div>
                    </div>
                </div>
                <span class="card-badge">${svc.price} ?</span>
                ${isLoggedIn && currentUser?.role === "OWNER" ? `<div class="clinic-card-footer"><button class="btn btn-sm" onclick="openBookingModal('${svc.id}','${svc.title}')"><i class="fas fa-calendar-check"></i> Записаться</button></div>` : ""}
            `;
            grid.appendChild(card);
        });

        if (locations.length === 0 && services.length === 0) {
            grid.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.5);">Нет доступных услуг</p>';
        }

        setTimeout(() => { if (clinicMap) clinicMap.invalidateSize(); }, 200);
    } catch (err) { console.error(err); showToast("Не удалось загрузить карту", "error"); }
}

function openLocalClinicBooking(name, type) {
    const safeName = String(name || "");
    openBookingModal(`local_${safeName}`, safeName, { localServiceType: type || "vet" });
}

// ===================== NUTRITION DIARY (FatSecret) =====================
let searchTimeout = null;
let selectedFoodSource = null;

async function handleFoodInput(e) {
    const val = e.target.value.trim();
    const box = document.getElementById("suggestBox");
    if (selectedFoodDetails && val && val !== selectedFoodDetails.name) {
        selectedFoodDetails = null;
        selectedFoodSource = null;
        const card = document.getElementById("feedProfileCard");
        if (card) card.style.display = "none";
    }
    if (val.length < 2) {
        box.style.display = "none";
        return;
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`${API}/nutrition/search?q=${encodeURIComponent(val)}`, {
                headers: authHeaders()
            });
            const matches = await res.json();

            box.innerHTML = "";
            if (matches && matches.length > 0) {
                box.style.display = "block";
                matches.forEach(m => {
                    const source = m.source === "catalog" ? "Каталог" : "FatSecret";
                    const sourceClass = m.source === "catalog" ? "suggest-source suggest-source-local" : "suggest-source suggest-source-fs";
                    const div = document.createElement("div");
                    div.className = "suggest-item";
                    div.innerHTML = `
                        <div class="suggest-top">
                            <span class="suggest-brand">${m.brand_name || "Общий"}</span>
                            <span class="${sourceClass}">${source}</span>
                        </div>
                        <span class="suggest-name">${m.food_name}</span>
                        <span class="suggest-desc">${m.food_description || ""}</span>
                    `;
                    div.onclick = () => selectFoodSuggestion(m);
                    box.appendChild(div);
                });
            } else {
                box.style.display = "none";
            }
        } catch (err) {
            console.error("FatSecret search error:", err);
        }
    }, 400);
}

let selectedFoodDetails = null;

async function selectFoodSuggestion(food) {
    const box = document.getElementById("suggestBox");
    if (box) box.style.display = "none";
    document.getElementById("foodNameInput").value = food.food_name;
    selectedFoodSource = food.source || "fatsecret";

    if (String(food.food_id || "").startsWith("local:")) {
        selectedFoodDetails = {
            name: food.food_name,
            brand: food.brand_name || "",
            cal: parseFloat(food.calories) || 0,
            pro: parseFloat(food.protein) || 0,
            fat: parseFloat(food.fat) || 0,
            carb: parseFloat(food.carbs) || 0,
            metric_unit: food.metric_serving_unit || "g",
            metric_amount: parseFloat(food.metric_serving_amount) || 100
        };
        recalculateNutrition();
        renderSelectedFeedCard();
        return;
    }

    showLoader();
    try {
        const res = await fetch(`${API}/nutrition/food/${food.food_id}`, {
            headers: authHeaders()
        });
        const details = await res.json();

        // Use the first serving available
        const serving = details.servings?.serving[0] || details.servings?.serving;
        if (serving) {
            selectedFoodDetails = {
                name: food.food_name,
                brand: food.brand_name || "",
                cal: parseFloat(serving.calories) || 0,
                pro: parseFloat(serving.protein) || 0,
                fat: parseFloat(serving.fat) || 0,
                carb: parseFloat(serving.carbohydrate) || 0,
                metric_unit: serving.metric_serving_unit || "g",
                metric_amount: parseFloat(serving.metric_serving_amount) || 100
            };
            recalculateNutrition();
            renderSelectedFeedCard();
        }
    } catch (err) {
        console.error("Error fetching food details:", err);
        showToast("Не удалось загрузить детали продукта", "error");
    } finally {
        hideLoader();
    }
}

function recalculateNutrition() {
    if (!selectedFoodDetails) return;
    const gramsInput = document.getElementById("gramsInput");
    const grams = gramsInput ? parseFloat(gramsInput.value) || 0 : 0;

    // Normalize to 1 gram based on the serving info
    const factor = grams / (selectedFoodDetails.metric_amount || 100);

    const form = document.getElementById("nutritionForm");
    if (form) {
        form.calories.value = (selectedFoodDetails.cal * factor).toFixed(1);
        form.protein.value = (selectedFoodDetails.pro * factor).toFixed(1);
        form.fat.value = (selectedFoodDetails.fat * factor).toFixed(1);
        form.carbs.value = (selectedFoodDetails.carb * factor).toFixed(1);
    }
    renderSelectedFeedCard();
}

function renderSelectedFeedCard() {
    const card = document.getElementById("feedProfileCard");
    if (!card || !selectedFoodDetails) return;
    const grams = parseFloat(document.getElementById("gramsInput")?.value || "0") || 0;
    const factor = grams / (selectedFoodDetails.metric_amount || 100);
    const kcal = (selectedFoodDetails.cal * factor).toFixed(1);
    const pro = (selectedFoodDetails.pro * factor).toFixed(1);
    const fat = (selectedFoodDetails.fat * factor).toFixed(1);
    const carb = (selectedFoodDetails.carb * factor).toFixed(1);
    const perLabel = `на ${selectedFoodDetails.metric_amount || 100}${selectedFoodDetails.metric_unit || "g"}`;
    const sourceText = selectedFoodSource === "catalog" ? "Каталог популярных кормов" : "FatSecret";
    const sourceClass = selectedFoodSource === "catalog" ? "feed-source-chip local" : "feed-source-chip fs";

    card.innerHTML = `
        <div class="feed-profile-head">
            <div>
                <div class="feed-profile-title">${selectedFoodDetails.name}</div>
                <div class="feed-profile-sub">${selectedFoodDetails.brand || "Корм"} · офиц. значения ${perLabel}</div>
            </div>
            <span class="${sourceClass}">${sourceText}</span>
        </div>
        <div class="feed-profile-grid">
            <div class="fp-cell"><span class="fp-label">Ккал</span><span class="fp-value">${selectedFoodDetails.cal}</span></div>
            <div class="fp-cell"><span class="fp-label">Белки</span><span class="fp-value">${selectedFoodDetails.pro} г</span></div>
            <div class="fp-cell"><span class="fp-label">Жиры</span><span class="fp-value">${selectedFoodDetails.fat} г</span></div>
            <div class="fp-cell"><span class="fp-label">Углеводы</span><span class="fp-value">${selectedFoodDetails.carb} г</span></div>
        </div>
        <div class="feed-profile-calc">Для ${grams || 0} г: ${kcal} ккал · Б ${pro} г · Ж ${fat} г · У ${carb} г</div>
    `;
    card.style.display = "block";
}

async function initNutritionPage() {
    const cardContainer = document.getElementById("nutritionPetCards");
    if (!cardContainer) return;

    try {
        const res = await fetch(`${API}/pets`, { headers: authHeaders() });
        const pets = await res.json();
        renderPetCards(pets, "nutritionPetCards", "nutritionPetSelect", (pid) => {
            loadNutrition();
        });
    } catch { /* silent */ }
}

function renderPetCards(pets, containerId, hiddenInputId, onSelect) {
    const container = document.getElementById(containerId);
    const hiddenInput = document.getElementById(hiddenInputId);
    if (!container) return;

    container.innerHTML = "";
    if (pets.length === 0) {
        container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.9rem;">Нет питомцев. Добавьте их в кабинете!</p>';
        return;
    }

    pets.forEach(p => {
        const card = document.createElement("div");
        card.className = "pet-card";
        card.dataset.petId = p.id;
        if (hiddenInput && hiddenInput.value === p.id) card.classList.add("active");

        card.innerHTML = `
            <i class="fas fa-${p.type === 'CAT' ? 'cat' : 'dog'}"></i>
            <div class="pet-card-name">${p.name}</div>
            <div class="pet-card-info">${p.breed}, ${p.weight} кг</div>
        `;

        card.onclick = () => {
            container.querySelectorAll(".pet-card").forEach(c => c.classList.remove("active"));
            card.classList.add("active");
            if (hiddenInput) {
                hiddenInput.value = p.id;
            }
            if (onSelect) onSelect(p.id);
        };
        container.appendChild(card);
    });
}

async function loadNutrition() {
    const petId = document.getElementById("nutritionPetSelect")?.value;
    const form = document.getElementById("nutritionForm");
    const summary = document.getElementById("nutritionSummary");
    const log = document.getElementById("nutritionLog");
    if (!petId) {
        if (form) form.style.display = "none";
        if (summary) summary.style.display = "none";
        if (log) log.style.display = "none";
        return;
    }
    if (form) form.style.display = "";
    if (summary) summary.style.display = "";
    if (log) log.style.display = "";
    try {
        const res = await fetch(`${API}/nutrition?petId=${petId}`, { headers: authHeaders() });
        const entries = await res.json();
        renderNutritionEntries(entries);
    } catch { showToast("Не удалось загрузить записи", "error"); }
}

function renderNutritionEntries(entries) {
    const container = document.getElementById("nutritionEntries");
    if (!container) return;
    container.innerHTML = "";

    const grouped = {};
    entries.forEach(e => {
        const d = new Date(e.date);
        const dayStr = d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
        if (!grouped[dayStr]) grouped[dayStr] = { items: [], cal: 0, pro: 0, fat: 0, carb: 0 };
        grouped[dayStr].items.push(e);
        grouped[dayStr].cal += e.calories;
        grouped[dayStr].pro += e.protein;
        grouped[dayStr].fat += e.fat;
        grouped[dayStr].carb += e.carbs;
    });

    const today = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
    const todayData = grouped[today] || { cal: 0, pro: 0, fat: 0, carb: 0 };
    updateMacroRings(todayData);

    const groupNames = Object.keys(grouped);
    if (groupNames.length === 0) {
        container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.9rem;text-align:center;">Нет записей. Добавьте первую!</p>';
        return;
    }

    groupNames.forEach(day => {
        const data = grouped[day];
        const groupEl = document.createElement("div");
        groupEl.className = "day-group";
        groupEl.innerHTML = `
            <div class="day-header">
                <span class="day-date">${day}</span>
                <span class="day-summary-pill">${data.cal.toFixed(0)} ккал</span>
            </div>
        `;

        data.items.forEach(e => {
            const time = new Date(e.date).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
            const itemEl = document.createElement("div");
            itemEl.className = "nutrition-entry";
            itemEl.innerHTML = `
                <div class="ne-main" style="flex:1;">
                    <div class="ne-food">${e.foodName} <span style="font-size:0.75rem;opacity:0.5;">(${time})</span></div>
                    <div class="ne-macros" style="margin-top:4px;font-size:0.8rem;">
                        <span class="ne-macro"><strong>${e.grams}</strong>г</span>
                        <span class="ne-macro ne-cal"><strong>${e.calories}</strong>ккал</span>
                        <span class="ne-macro">Б<strong>${e.protein}</strong></span>
                        <span class="ne-macro">Ж<strong>${e.fat}</strong></span>
                        <span class="ne-macro">У<strong>${e.carbs}</strong></span>
                    </div>
                </div>
                <button class="ne-delete" onclick="deleteNutritionEntry('${e.id}')"><i class="fas fa-trash-alt"></i></button>
            `;
            groupEl.appendChild(itemEl);
        });
        container.appendChild(groupEl);
    });
}

function updateMacroRings(data) {
    const goals = { cal: 1200, pro: 80, fat: 40, carb: 100 };
    updateRing("ringCalories", data.cal, goals.cal, "totalCalories");
    updateRing("ringProtein", data.pro, goals.pro, "totalProtein");
    updateRing("ringFat", data.fat, goals.fat, "totalFat");
    updateRing("ringCarbs", data.carb, goals.carb, "totalCarbs");
}

function updateRing(id, value, goal, labelId) {
    const el = document.getElementById(id);
    if (!el) return;
    const label = document.getElementById(labelId);
    if (label) label.textContent = value.toFixed(0);
    const progress = el.querySelector(".ring-progress");
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const percentage = Math.min(value / goal, 1);
    const offset = circumference - (percentage * circumference);
    if (progress) progress.style.strokeDashoffset = offset;
}

async function addNutritionEntry(e) {
    e.preventDefault();
    const form = e.target;
    const petId = document.getElementById("nutritionPetSelect")?.value;
    if (!petId) { showToast("Выберите питомца", "error"); return; }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    showLoader();
    try {
        const res = await fetch(`${API}/nutrition`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
                petId,
                foodName: form.foodName.value.trim(),
                grams: parseFloat(form.grams.value),
                calories: parseFloat(form.calories.value),
                protein: parseFloat(form.protein.value),
                fat: parseFloat(form.fat.value),
                carbs: parseFloat(form.carbs.value),
            }),
        });
        if (res.ok) {
            showToast("Запись добавлена!", "success");
            form.reset();
            selectedFoodDetails = null;
            selectedFoodSource = null;
            const feedCard = document.getElementById("feedProfileCard");
            if (feedCard) feedCard.style.display = "none";
            loadNutrition();
        } else {
            const d = await res.json();
            showToast(d.error || "Ошибка", "error");
        }
    } catch { showToast("Сервер недоступен", "error"); }
    finally { btn.disabled = false; hideLoader(); }
}

async function deleteNutritionEntry(id) {
    showLoader();
    try {
        const res = await fetch(`${API}/nutrition/${id}`, { method: "DELETE", headers: authHeaders() });
        if (res.ok) {
            showToast("Удалено", "info");
            loadNutrition();
        }
    } catch { showToast("Ошибка", "error"); }
    finally { hideLoader(); }
}

// ===================== PAWCOINS ECONOMY =====================
function getPawCoins() {
    const uid = currentUser?.id || 'guest';
    return parseInt(localStorage.getItem(`pawcoins_${uid}`)) || 0;
}

function setPawCoins(amount) {
    const uid = currentUser?.id || 'guest';
    localStorage.setItem(`pawcoins_${uid}`, amount);
    updatePawCoinsDisplay();
}

function addPawCoins(amount) {
    const uid = currentUser?.id || 'guest';
    const current = getPawCoins();
    localStorage.setItem(`pawcoins_${uid}`, current + amount);
    updatePawCoinsDisplay();
    return current + amount;
}

function spendPawCoins(amount) {
    const current = getPawCoins();
    if (current < amount) return false;
    const uid = currentUser?.id || 'guest';
    localStorage.setItem(`pawcoins_${uid}`, current - amount);
    updatePawCoinsDisplay();
    return true;
}

function updatePawCoinsDisplay() {
    const el = document.getElementById('pawCoinsCount');
    if (el) el.textContent = getPawCoins();
    const hdr = document.getElementById('pawCoinsHeader');
    if (hdr) hdr.style.display = currentUser ? 'flex' : 'none';
}

// ===================== PAWBOT (AI CHAT AGENT) =====================
let aiChatOpen = false;

function toggleAIChat() {
    aiChatOpen = !aiChatOpen;
    const win = document.getElementById("aiChatWindow");
    if (win) win.style.display = aiChatOpen ? "flex" : "none";
}

async function sendAIMessage(e) {
    e.preventDefault();
    const input = document.getElementById("aiChatInput");
    const msg = input.value.trim();
    if (!msg) return;
    input.value = "";

    appendAIMessage(msg, "user");

    const typing = document.getElementById("aiChatTyping");
    if (typing) typing.style.display = "block";
    const container = document.getElementById("aiChatMessages");
    if (container) container.scrollTop = container.scrollHeight;

    try {
        const res = await fetch(`${API}/chat`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
                message: msg,
                context: {
                    city: currentUser?.city || "Astana",
                    coins: getPawCoins()
                }
            })
        });
        const data = await res.json();
        if (typing) typing.style.display = "none";
        appendAIMessage(data.response || "PawBot: Что-то пошло не так...", "bot");
    } catch (err) {
        console.error("PawBot Error:", err);
        if (typing) typing.style.display = "none";
        appendAIMessage("Ой! Кажется, сервер PawBot временно недоступен. Попробуйте позже!", "bot");
    }
}

function appendAIMessage(text, sender) {
    const container = document.getElementById("aiChatMessages");
    if (!container) return;
    const div = document.createElement("div");
    div.className = `ai-msg ai-msg-${sender}`;
    if (sender === "bot") {
        div.innerHTML = `<div class="ai-msg-avatar"><i class="fas fa-robot"></i></div><div class="ai-msg-text">${text}</div>`;
    } else {
        div.innerHTML = `<div class="ai-msg-text">${text}</div>`;
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ===================== BOOKING MODAL =====================
let selectedServiceId = "";

async function openBookingModal(serviceId, serviceTitle) {
    selectedServiceId = serviceId;
    const nameEl = document.getElementById("bookingServiceName");
    if (nameEl) nameEl.textContent = serviceTitle;

    const hiddenInput = document.getElementById("bookingPetSelect");
    if (hiddenInput) hiddenInput.value = "";

    try {
        const res = await fetch(`${API}/pets`, { headers: authHeaders() });
        const pets = await res.json();
        renderPetCards(pets, "bookingPetCards", "bookingPetSelect");
    } catch { /* silent */ }
    const modal = document.getElementById("bookingModal");
    if (modal) modal.classList.add("active");
}

function closeBookingModal() {
    const modal = document.getElementById("bookingModal");
    if (modal) modal.classList.remove("active");
    selectedServiceId = "";
}

async function submitBooking(e) {
    e.preventDefault();
    const form = e.target;
    const petId = form.petSelect.value;
    const bookingDate = form.bookingDate.value;
    if (!petId || !bookingDate) { showToast("Заполните все поля", "error"); return; }

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    showLoader();
    try {
        const res = await fetch(`${API}/bookings`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ petId, serviceId: selectedServiceId, bookingDate }),
        });
        if (res.ok) {
            showToast("Запись создана!", "success");
            closeBookingModal();
            form.reset();
            loadBookings();
        } else {
            const d = await res.json();
            showToast(d.error || "Ошибка записи", "error");
        }
    } catch { showToast("Сервер недоступен", "error"); }
    finally { btn.disabled = false; hideLoader(); }
}

// ===================== MY BOOKINGS (OWNER) =====================
async function loadBookings() {
    const container = document.getElementById("bookingsList");
    if (!container) return;
    try {
        const res = await fetch(`${API}/bookings`, { headers: authHeaders() });
        const bookings = await res.json();
        container.innerHTML = "";
        if (bookings.length === 0) {
            container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.9rem;">Нет записей</p>';
            return;
        }
        bookings.forEach(b => {
            const date = new Date(b.bookingDate).toLocaleString("ru-RU");
            const el = document.createElement("div");
            el.className = "cab-card";
            el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-weight:800;">${b.service?.title || "Услуга"}</span>
          <span class="status-badge status-${b.status}">${b.status}</span>
        </div>
        <div class="cab-row"><span class="cab-label">Питомец</span><span class="cab-value">${b.pet?.name || "—"}</span></div>
        <div class="cab-row"><span class="cab-label">Дата</span><span class="cab-value">${date}</span></div>
      `;
            container.appendChild(el);
        });
    } catch { /* silent */ }
}

// ===================== PARTNER BOOKINGS =====================
async function loadPartnerBookings() {
    const container = document.getElementById("partnerBookingsList");
    if (!container) return;
    try {
        const res = await fetch(`${API}/bookings/partner`, { headers: authHeaders() });
        if (!res.ok) return;
        const bookings = await res.json();
        container.innerHTML = "";
        if (bookings.length === 0) {
            container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.9rem;">Нет записей</p>';
            return;
        }
        bookings.forEach(b => {
            const date = new Date(b.bookingDate).toLocaleString("ru-RU");
            const el = document.createElement("div");
            el.className = "cab-card";
            const buttons = b.status === "PENDING" ? `
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button class="btn btn-sm btn-success" onclick="updateBookingStatus('${b.id}','CONFIRMED')">Подтвердить</button>
          <button class="btn btn-sm btn-danger" onclick="updateBookingStatus('${b.id}','CANCELLED')">Отменить</button>
        </div>` : "";
            el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-weight:800;">${b.service?.title || "Услуга"}</span>
          <span class="status-badge status-${b.status}">${b.status}</span>
        </div>
        <div class="cab-row"><span class="cab-label">Клиент</span><span class="cab-value">${b.pet?.owner?.name || "—"}</span></div>
        <div class="cab-row"><span class="cab-label">Питомец</span><span class="cab-value">${b.pet?.name || "—"}</span></div>
        <div class="cab-row"><span class="cab-label">Дата</span><span class="cab-value">${date}</span></div>
        ${buttons}
      `;
            container.appendChild(el);
        });
    } catch { /* silent */ }
}

async function updateBookingStatus(id, status) {
    showLoader();
    try {
        const res = await fetch(`${API}/bookings/${id}/status`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ status }),
        });
        if (res.ok) {
            showToast(status === "CONFIRMED" ? "Запись подтверждена!" : "Запись отменена", status === "CONFIRMED" ? "success" : "info");
            loadPartnerBookings();
        } else {
            const d = await res.json();
            showToast(d.error || "Ошибка", "error");
        }
    } catch { showToast("Сервер недоступен", "error"); }
    finally { hideLoader(); }
}

// ===================== AUTH TAB SWITCHING =====================
function switchAuthTab(tab) {
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
    document.querySelectorAll(".auth-form").forEach(f => f.classList.toggle("active", f.id === `${tab}Form`));
}

// ===================== CABINET =====================
function initCabinet() {
    const openBtn = document.getElementById("cabinetToggle");
    const closeBtn = document.getElementById("cabinetClose");
    const backdrop = document.getElementById("cabinetBackdrop");
    const toggle = open => {
        document.body.classList.toggle("cabinet-open", open);
        const drawer = document.getElementById("cabinetDrawer");
        if (drawer) drawer.setAttribute("aria-hidden", !open);
    };
    if (openBtn) openBtn.addEventListener("click", () => toggle(true));
    if (closeBtn) closeBtn.addEventListener("click", () => toggle(false));
    if (backdrop) backdrop.addEventListener("click", () => toggle(false));
    document.addEventListener("keydown", e => { if (e.key === "Escape") toggle(false); });

    document.querySelectorAll(".cab-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".cab-tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".cab-panel").forEach(p => p.classList.remove("active"));
            tab.classList.add("active");
            const panel = document.getElementById(tab.dataset.panel);
            if (panel) panel.classList.add("active");
        });
    });
}

// ===================== THEME =====================
function initTheme() {
    const body = document.body;
    const toggle = document.getElementById("themeToggle");
    if (!toggle) return;
    const apply = theme => {
        if (theme === "light") { body.setAttribute("data-theme", "light"); toggle.innerHTML = '<i class="fa-solid fa-sun"></i>'; }
        else { body.removeAttribute("data-theme"); toggle.innerHTML = '<i class="fa-solid fa-moon"></i>'; }
    };
    const saved = localStorage.getItem("theme");
    apply(saved || "dark");
    toggle.addEventListener("click", () => {
        const next = body.getAttribute("data-theme") === "light" ? "dark" : "light";
        localStorage.setItem("theme", next);
        apply(next);
    });
}

// ===================== LANGUAGE =====================
function initLanguage() {
    const langSwitch = document.getElementById("langSwitch");
    const langToggle = document.getElementById("langToggle");
    const langMenu = document.getElementById("langMenu");
    const langCode = document.getElementById("langCode");
    if (!langSwitch || !langToggle) return;

    const t = {
        ru: {
            code: "RU", nav: ["Главная", "Вход", "Услуги", "Функции", "О нас", "Контакты"], hero: "Забота о питомцах 24/7", heroDesc: "Экосистема услуг для питомцев: GPS-трекер, контроль здоровья, питание, дрессировка и онлайн-ветеринария 24/7", heroCta: "Начать", heroCtaLogged: "Смотреть услуги", authTitle: "Добро пожаловать", authSub: "Войдите или создайте аккаунт", login: "Вход", register: "Регистрация", servTitle: "Услуги PawVerse", servSub: "Выберите нужную услугу для вашего питомца", featTitle: "Инновационные функции", aboutTitle: "О компании", contactTitle: "Свяжитесь с нами",
            hubNutrition: "Питание", hubNutritionDesc: "Дневник питания вашего питомца. Отслеживайте калории, БЖУ и получайте рекомендации от AI-ассистента.",
            hubTraining: "Дрессировка", hubTrainingDesc: "Обучающие видео по дрессировке кошек и собак с субтитрами на 3 языках.",
            hubClinic: "Услуги клиник", hubClinicDesc: "Запишитесь на прием к ветеринару, грумеру или в зоогостиницу в вашем городе.",
            hubGo: "Перейти", backToServices: "Назад к услугам",
            nutritionTitle: "Дневник питания", nutritionSub: "Отслеживайте рацион питомца и получайте рекомендации",
            trainingTitle: "Дрессировка", trainingSub: "Обучающие видео от экспертов PawVerse", trainDogs: "Собаки", trainCats: "Кошки",
            clinicTitle: "Услуги в вашем городе", clinicSub: "Запишитесь на услугу, выберите питомца и удобное время",
            testTitle: "Отзывы наших клиентов", testSub: "Что говорят владельцы питомцев о PawVerse",
            test1Name: "Айгуль К.", test1Pet: "Хозяйка лабрадора", test1Text: "\"PawVerse полностью изменил мой подход к заботе о Барсике! GPS-трекер дает спокойствие, а дневник питания помогает следить за рационом.\"",
            test2Name: "Дамир М.", test2Pet: "Владелец кота", test2Text: "\"Наконец-то все в одном месте: записи к ветеринару, питание и дрессировка. PawBot отвечает на вопросы мгновенно.\"",
            test3Name: "Жанна Н.", test3Pet: "Хозяйка шпица", test3Text: "\"Очень удобно записываться в ветклиники Астаны прямо из приложения. Карта показывает все ближайшие клиники.\"",
            trackingTitle: "GPS-отслеживание", trackingSub: "Следите за безопасностью ваших питомцев в реальном времени",
            activeDevices: "Активные устройства", onlineStatus: "В сети", noDevices: "Нет активных устройств. Добавьте GPS в профиле питомца.",
            quizMenuTitle: "Меню PawCoins", buyCoins: "Купить PawCoins", takeQuizPlaceholder: "Пройти тест", quizQuestionLabel: "Вопрос", quizResultLabel: "Результат", quizCongratsLabel: "Поздравляем!", quizEarnedLabel: "Вы заработали"
        },
        kz: {
            code: "KZ", nav: ["Басты бет", "Кіру", "Қызметтер", "Функциялар", "Біз туралы", "Байланыс"], hero: "Үй жануарларына қамқорлық 24/7", heroDesc: "Үй жануарларына арналған қызметтердің толық экожүйесі: GPS-трекер, денсаулықты бақылау, тамақтану, үйрету және 24/7 онлайн ветеринария", heroCta: "Бастау", heroCtaLogged: "Қызметтерді көру", authTitle: "Қош келдіңіз", authSub: "Жүйеге кіріңіз немесе тіркеліңіз", login: "Кіру", register: "Тіркелу", servTitle: "PawVerse қызметтері", servSub: "Үй жануарыңызға қажет қызметті таңдаңыз", featTitle: "Инновациялық функциялар", aboutTitle: "Компания туралы", contactTitle: "Байланыс",
            hubNutrition: "Тамақтану", hubNutritionDesc: "Үй жануарыңыздың тамақтану күнделігі. Калория мен БЖК көрсеткіштерін қадағалап, AI-кеңес алыңыз.",
            hubTraining: "Үйрету", hubTrainingDesc: "Иттер мен мысықтарды үйретуге арналған оқу видеолары.",
            hubClinic: "Клиника қызметтері", hubClinicDesc: "Ветеринар, грумер немесе зооқонақүй қызметіне ыңғайлы уақытта жазылыңыз.",
            hubGo: "Өту", backToServices: "Қызметтерге оралу",
            nutritionTitle: "Тамақтану күнделігі", nutritionSub: "Үй жануарыңыздың рационын бақылап, ұсыныстар алыңыз",
            trainingTitle: "Үйрету", trainingSub: "PawVerse сарапшыларынан оқу видеолары", trainDogs: "Иттер", trainCats: "Мысықтар",
            clinicTitle: "Сіздің қалаңыздағы қызметтер", clinicSub: "Қызметті таңдап, қолайлы уақытқа жазылыңыз",
            testTitle: "Клиент пікірлері", testSub: "Үй жануарларының иелері PawVerse туралы не дейді",
            test1Name: "Айгүл Қ.", test1Pet: "Лабрадор иесі", test1Text: "\"PawVerse Барсикке күтім жасау тәсілімді түбегейлі өзгертті! GPS-трекер көңілге тыныштық береді, ал тамақтану күнделігі рационды қадағалауға көмектеседі.\"",
            test2Name: "Дамир М.", test2Pet: "Мысық иесі", test2Text: "\"Енді бәрі бір жерде: ветеринарға жазылу, тамақтану және үйрету. PawBot сұрақтарға лезде жауап береді.\"",
            test3Name: "Жанна Н.", test3Pet: "Шпиц иесі", test3Text: "\"Астанадағы ветклиникаларға тікелей қосымша арқылы жазылу өте ыңғайлы. Карта жақын клиникаларды бірден көрсетеді.\"",
            trackingTitle: "GPS бақылау", trackingSub: "Үй жануарларыңыздың қауіпсіздігін нақты уақытта бақылаңыз",
            activeDevices: "Белсенді құрылғылар", onlineStatus: "Желіде", noDevices: "Белсенді құрылғылар жоқ. Үй жануары профилінде GPS қосыңыз.",
            quizMenuTitle: "PawCoins мәзірі", buyCoins: "PawCoins сатып алу", takeQuizPlaceholder: "Тест тапсыру", quizQuestionLabel: "Сұрақ", quizResultLabel: "Нәтиже", quizCongratsLabel: "Құттықтаймыз!", quizEarnedLabel: "Сіз таптыңыз"
        },
        en: {
            code: "EN", nav: ["Home", "Login", "Services", "Features", "About", "Contact"], hero: "Pet Care 24/7", heroDesc: "A complete pet-care ecosystem: GPS tracking, health monitoring, nutrition, training, and 24/7 online veterinary care", heroCta: "Get Started", heroCtaLogged: "View Services", authTitle: "Welcome", authSub: "Sign in or create an account", login: "Login", register: "Register", servTitle: "PawVerse Services", servSub: "Choose the right service for your pet", featTitle: "Innovative Features", aboutTitle: "About Us", contactTitle: "Contact Us",
            hubNutrition: "Nutrition", hubNutritionDesc: "Your pet's nutrition diary. Track calories, macros, and get AI recommendations.",
            hubTraining: "Training", hubTrainingDesc: "Training videos for cats and dogs with subtitles in 3 languages.",
            hubClinic: "Clinic Services", hubClinicDesc: "Book an appointment with a vet, groomer, or pet hotel in your city.",
            hubGo: "Go", backToServices: "Back to Services",
            nutritionTitle: "Nutrition Diary", nutritionSub: "Track your pet's diet and get recommendations",
            trainingTitle: "Training", trainingSub: "Training videos from PawVerse experts", trainDogs: "Dogs", trainCats: "Cats",
            clinicTitle: "Services in Your City", clinicSub: "Book a service and choose a convenient time",
            testTitle: "Customer Reviews", testSub: "What pet owners say about PawVerse",
            test1Name: "Aigul K.", test1Pet: "Labrador Owner", test1Text: "\"PawVerse completely changed how I care for Barsik. The GPS tracker gives peace of mind, and the nutrition diary helps me monitor diet.\"",
            test2Name: "Damir M.", test2Pet: "Cat Owner", test2Text: "\"Finally everything is in one place: vet bookings, nutrition, and training. PawBot answers questions instantly.\"",
            test3Name: "Zhanna N.", test3Pet: "Spitz Owner", test3Text: "\"Booking Astana vet clinics directly from the app is very convenient. The map shows all nearby clinics.\"",
            trackingTitle: "GPS Tracking", trackingSub: "Monitor your pets' safety in real time",
            activeDevices: "Active Devices", onlineStatus: "Online", noDevices: "No active devices. Add GPS in pet profile.",
            quizMenuTitle: "PawCoins Menu", buyCoins: "Buy PawCoins", takeQuizPlaceholder: "Take Quiz", quizQuestionLabel: "Question", quizResultLabel: "Result", quizCongratsLabel: "Congratulations!", quizEarnedLabel: "You earned"
        }
    };

    function applyLang(lang) {
        currentLang = lang;
        document.body.dataset.lang = lang;
        const d = t[lang] || t.ru;
        if (langCode) langCode.textContent = d.code;
        document.querySelectorAll("header .nav-link").forEach((el, i) => { if (d.nav[i]) el.textContent = d.nav[i]; });
        const heroH1 = document.querySelector("#hero .hero-content h1");
        const heroP = document.querySelector("#hero .hero-content p");
        if (heroH1) heroH1.textContent = d.hero;
        if (heroP) heroP.textContent = d.heroDesc;
        const heroCta = document.getElementById("heroCta");
        if (heroCta) heroCta.textContent = localStorage.getItem("token") ? d.heroCtaLogged : d.heroCta;
        const authTitle = document.querySelector("#auth .section-title");
        const authSub = document.querySelector("#auth .section-subtitle");
        if (authTitle) authTitle.textContent = d.authTitle;
        if (authSub) authSub.textContent = d.authSub;
        document.querySelectorAll(".auth-tab").forEach((tab, i) => { tab.textContent = i === 0 ? d.login : d.register; });
        const sTitle = document.querySelector("#services .section-title");
        const sSub = document.querySelector("#services .section-subtitle");
        if (sTitle) sTitle.textContent = d.servTitle;
        if (sSub) sSub.textContent = d.servSub;
        const hubTitles = document.querySelectorAll(".shc-title");
        const hubDescs = document.querySelectorAll(".shc-desc");
        const hubBtns = document.querySelectorAll(".shc-btn");
        if (hubTitles[0]) hubTitles[0].textContent = d.hubNutrition || "Питание";
        if (hubTitles[1]) hubTitles[1].textContent = d.hubTraining || "Дрессировка";
        if (hubTitles[2]) hubTitles[2].textContent = d.hubClinic || "Услуги клиник";
        if (hubDescs[0]) hubDescs[0].textContent = d.hubNutritionDesc || "";
        if (hubDescs[1]) hubDescs[1].textContent = d.hubTrainingDesc || "";
        if (hubDescs[2]) hubDescs[2].textContent = d.hubClinicDesc || "";
        const testimTitle = document.querySelector("#testimonials .section-title");
        const testimSub = document.querySelector("#testimonials .section-subtitle");
        if (testimTitle) testimTitle.textContent = d.testTitle;
        if (testimSub) testimSub.textContent = d.testSub;
        const tCards = document.querySelectorAll(".testimonial-card");
        if (tCards.length >= 3) {
            tCards[0].querySelector("h4").textContent = d.test1Name;
            tCards[0].querySelector("span").textContent = d.test1Pet;
            tCards[0].querySelector(".testimonial-text").textContent = d.test1Text;
            tCards[1].querySelector("h4").textContent = d.test2Name;
            tCards[1].querySelector("span").textContent = d.test2Pet;
            tCards[1].querySelector(".testimonial-text").textContent = d.test2Text;
            tCards[2].querySelector("h4").textContent = d.test3Name;
            tCards[2].querySelector("span").textContent = d.test3Pet;
            tCards[2].querySelector(".testimonial-text").textContent = d.test3Text;
        }
        hubBtns.forEach(b => {
            const icon = b.querySelector('i');
            b.textContent = (d.hubGo || "Перейти") + " ";
            if (icon) b.appendChild(icon);
        });
        document.querySelectorAll(".back-btn").forEach(b => { const icon = b.querySelector('i'); b.textContent = " " + (d.backToServices || "Назад к услугам"); if (icon) b.prepend(icon); });
        const nTitle = document.querySelector("#nutrition .section-title");
        const nSub = document.querySelector("#nutrition .section-subtitle");
        if (nTitle) nTitle.textContent = d.nutritionTitle || "";
        if (nSub) nSub.textContent = d.nutritionSub || "";
        const tTitle = document.querySelector("#training .section-title");
        const tSub = document.querySelector("#training .section-subtitle");
        if (tTitle) tTitle.textContent = d.trainingTitle || "";
        if (tSub) tSub.textContent = d.trainingSub || "";
        const tTabs = document.querySelectorAll(".training-tab");
        if (tTabs[0]) { tTabs[0].innerHTML = `<i class="fas fa-dog"></i> ${d.trainDogs || "Собаки"}`; }
        if (tTabs[1]) { tTabs[1].innerHTML = `<i class="fas fa-cat"></i> ${d.trainCats || "Кошки"}`; }
        const cTitle = document.querySelector("#clinicServices .section-title");
        const cSub = document.querySelector("#clinicServices .section-subtitle");
        if (cTitle) cTitle.textContent = d.clinicTitle || "";
        if (cSub) cSub.textContent = d.clinicSub || "";
        // Tracking Trilingualism
        const trackTitle = document.querySelector("#tracking .section-title");
        const trackSub = document.querySelector("#tracking .section-subtitle");
        const trackSideHead = document.querySelector(".tracking-sidebar-header h3");
        const trackOnline = document.querySelector(".online-indicator");
        if (trackTitle) trackTitle.textContent = d.trackingTitle || "GPS Tracking";
        if (trackSub) trackSub.textContent = d.trackingSub || "";
        if (trackSideHead) trackSideHead.textContent = d.activeDevices || "Active Devices";
        if (trackOnline) trackOnline.textContent = d.onlineStatus || "Online";

        document.querySelectorAll(".lang-option").forEach(btn => { btn.classList.toggle("active", btn.dataset.lang === lang); });
        // Keep training card texts synced with selected UI language.
        if (document.getElementById("trainingGrid")) switchTrainingCategory(currentTrainingCategory);
    }


    langToggle.addEventListener("click", e => { e.stopPropagation(); langSwitch.classList.toggle("open"); });
    document.addEventListener("click", () => langSwitch.classList.remove("open"));
    langMenu.addEventListener("click", e => e.stopPropagation());
    document.querySelectorAll(".lang-option").forEach(btn => {
        btn.addEventListener("click", () => {
            const lang = btn.dataset.lang || "ru";
            localStorage.setItem("lang", lang);
            applyLang(lang);
            langSwitch.classList.remove("open");
        });
    });
    const saved = localStorage.getItem("lang") || "ru";
    applyLang(saved);
}

// ===================== TRAINING VIDEOS =====================
const trainingVideos = {
    dogs: [
        {
            id: 1, title: "Команда 'Сидеть'", titleKz: "Отыру", desc: "Итті отыру?а ?йрету", color: "#FF6B35", free: true,
            subs: [
                { ru: "Покажите лакомство", kz: "Д?мді та?амды к?рсеті?із", en: "Show the treat", img: "dog_sit_1.jpg" },
                { ru: "Медленно поднимите его над головой", kz: "Оны басынан жо?ары баяу к?тері?із", en: "Slowly raise it over the head", img: "dog_sit_2.jpg" },
                { ru: "Собака сядет, чтобы следить за ним", kz: "Ит оны ба?ылау ?шін отырады", en: "The dog will sit to follow it", img: "dog_sit_3.jpg" },
                { ru: "Скажите 'Сидеть!' и дайте награду", kz: "'Отыр!' деп айтып, сыйлы? бері?із", en: "Say 'Sit!' and give the reward", img: "dog_sit_4.jpg" }
            ]
        },

        {
            id: 2, title: "Команда 'Лежать'", titleKz: "Жату", desc: "Итті жату?а ?йрету", color: "#4ECDC4", free: true,
            subs: [
                { ru: "Зажмите лакомство в кулаке", kz: "Д?мді та?амды ж?дыры?ы?ыз?а ?ысы?ыз", en: "Hold the treat in your fist" },
                { ru: "Опустите руку к самому полу", kz: "?олы?ызды еденге дейін т?сірі?із", en: "Lower your hand to the floor" },
                { ru: "Собака ляжет вслед за рукой", kz: "Ит ?олы?ызды? артынан жатады", en: "The dog will lie down following your hand" },
                { ru: "Скажите 'Лежать!' и похвалите", kz: "'Жат!' деп айтып, ма?та?ыз", en: "Say 'Down!' and praise her" }
            ]
        },
        {
            id: 3, title: "Команда 'Ко мне'", titleKz: "Кел ма?ан", desc: "Итті ша?ыруды ?йрету", color: "#45B7D1", free: true,
            subs: [
                { ru: "Сядьте на уровень собаки", kz: "Итпен бір де?гейде отыры?ыз", en: "Sit at the dog's level" },
                { ru: "Радостно позовите её по имени", kz: "Оны атымен ?уанышпен ша?ыры?ыз", en: "Happily call her by name" },
                { ru: "Когда подойдет — бурно похвалите", kz: "Келгенде — ?атты ма?та?ыз", en: "When she comes — praise enthusiastically" }
            ]
        },
        {
            id: 4, title: "Команда 'Место'", titleKz: "Орын", desc: "Итті ?з орнына ?йрету", color: "#96CEB4", free: false, cost: 50,
            subs: [
                { ru: "Укажите на подстилку", kz: "Т?сенішке н?с?а?ыз", en: "Point to the mat" },
                { ru: "Бросьте туда лакомство", kz: "Ол жерге д?мді та?ам таста?ыз", en: "Throw a treat there" },
                { ru: "Скажите 'Место!' когда она зайдет", kz: "Ол кіргенде 'Орын!' деп айты?ыз", en: "Say 'Place!' when she enters" }
            ]
        },
        {
            id: 5, title: "Команда 'Апорт'", titleKz: "Алып кел", desc: "Заттарды алып келуге ?йрету", color: "#FFEAA7", free: false, cost: 75,
            subs: [
                { ru: "Покажите любимую игрушку", kz: "С?йікті ойыншы?ын к?рсеті?із", en: "Show the favorite toy" },
                { ru: "Бросьте её недалеко", kz: "Оны жа?ын жерге таста?ыз", en: "Throw it not too far" },
                { ru: "Скажите 'Апорт!' и ждите возвращения", kz: "'Алып кел!' деп айтып, ?айтуын к?ті?із", en: "Say 'Fetch!' and wait for return" }
            ]
        },
        {
            id: 6, title: "Команда 'Рядом'", titleKz: "?асымда", desc: "Итті ?асы?да ж?руге ?йрету", color: "#74B9FF", free: false, cost: 100,
            subs: [
                { ru: "Держите поводок коротко", kz: "?ар?ыбауды ?ыс?а ?ста?ыз", en: "Keep the leash short" },
                { ru: "Начните движение с левой ноги", kz: "?оз?алысты сол ая?тан баста?ыз", en: "Start moving with the left foot" },
                { ru: "Поворачивайте, придерживая у ноги", kz: "Ая?ы?ызды? жанында ?стап б?рылы?ыз", en: "Turn while keeping her at your leg" }
            ]
        },
        {
            id: 7, title: "Команда 'Голос'", titleKz: "Дауыс", desc: "Итті ?руге ?йрету", color: "#E17055", free: false, cost: 100,
            subs: [
                { ru: "Раззадорьте игрой", kz: "Ойынмен ?ызы?тыры?ыз", en: "Excite with a game" },
                { ru: "Когда гавкнет — сразу дайте еду", kz: "?ргенде — бірден тама? бері?із", en: "When she barks — give food immediately" },
                { ru: "Повторите с командой 'Голос!'", kz: "'?н!' командасымен ?айтала?ыз", en: "Repeat with the 'Speak!' command" }
            ]
        },
        {
            id: 8, title: "Дай лапу", titleKz: "Т?я? бер", desc: "Итті табанын беруге ?йрету", color: "#FDCB6E", free: false, cost: 125,
            subs: [
                { ru: "Пощекочите за подушечки", kz: "Табанын ?ыты?та?ыз", en: "Tickle the paw pads" },
                { ru: "Когда поднимет — пожмите её", kz: "К?тергенде — оны ?ысы?ыз", en: "When she lifts it — shake it" },
                { ru: "Скажите 'Лапу!' и угостите", kz: "'Т?я?!' деп айтып, д?м таттыры?ыз", en: "Say 'Paw!' and treat her" }
            ]
        },
        {
            id: 9, title: "Команда 'Жди'", titleKz: "К?т", desc: "Итті к?туге ?йрету", color: "#A29BFE", free: false, cost: 150,
            subs: [
                { ru: "Посадите собаку", kz: "Итті отыр?ызы?ыз", en: "Ask the dog to sit" },
                { ru: "Сделайте шаг назад", kz: "Арт?а бір ?адам жаса?ыз", en: "Take a step back" },
                { ru: "Если не встала — вернитесь и похвалите", kz: "Т?рмаса — ?айтып келіп ма?та?ыз", en: "If she stayed — return and praise" }
            ]
        },
        {
            id: 10, title: "Кувырок", titleKz: "Аударылу", desc: "Итті аударылу?а ?йрету", color: "#FD79A8", free: false, cost: 200,
            subs: [
                { ru: "Уложите собаку", kz: "Итті жат?ызы?ыз", en: "Ask the dog to lie down" },
                { ru: "Крутите лакомство у носа за спину", kz: "Д?мді та?амды м?рныны? жанынан ар?асына ?арай айналдыры?ыз", en: "Lure with a treat from nose to shoulder" },
                { ru: "Собака перевернется боком", kz: "Ит б?йіріне аударылады", en: "The dog will roll over on its side" }
            ]
        }
    ],
    cats: [
        {
            id: 11, title: "Команда 'Сидеть'", titleKz: "Отыру", desc: "Мысы?ты отыру?а ?йрету", color: "#DDA0DD", free: true,
            subs: [
                { ru: "Привлеките внимание звуком", kz: "Дыбыспен назарын аудары?ыз", en: "Get attention with a sound", img: "cat_sit_1.jpg" },
                { ru: "Заведите лакомство за голову", kz: "Д?мді та?амды басыны? артына апары?ыз", en: "Move the treat behind the head", img: "cat_sit_2.jpg" },
                { ru: "Кошка сядет естественным образом", kz: "Мысы? таби?и т?рде отырады", en: "The cat will sit naturally", img: "cat_sit_3.jpg" }
            ]
        },

        {
            id: 12, title: "Дай лапу", titleKz: "Т?я? бер", desc: "Мысы?ты табанын беруге ?йрету", color: "#98D8C8", free: true,
            subs: [
                { ru: "Положите еду в ладонь", kz: "Тама?ты ала?аны?ыз?а салы?ыз", en: "Place food in your palm" },
                { ru: "Кошка коснется лапой", kz: "Мысы? т?я?ымен тиеді", en: "The cat will touch with a paw" },
                { ru: "Закрепите успех похвалой", kz: "Жетістікті ма?таумен бекіті?із", en: "Reinforce success with praise" }
            ]
        },
        {
            id: 13, title: "Прыжок через обруч", titleKz: "Ше?берден секіру", desc: "Мысы?ты секіруге ?йрету", color: "#F7DC6F", free: true,
            subs: [
                { ru: "Поставьте обруч на пол", kz: "Ше?берді еденге ?ойы?ыз", en: "Place the hoop on the floor" },
                { ru: "Проведите кошку через него", kz: "Мысы?ты ол ар?ылы ?ткізі?із", en: "Lure the cat through it" },
                { ru: "Постепенно поднимайте обруч", kz: "Ше?берді біртіндеп к?тері?із", en: "Gradually raise the hoop" }
            ]
        },
        {
            id: 14, title: "Кликер-тренинг", titleKz: "Кликер-жатты?у", desc: "Кликерді ?олдануды ?йрету", color: "#AED6F1", free: false, cost: 50,
            subs: [
                { ru: "Кликните и сразу дайте еду", kz: "Шерті?із де бірден тама? бері?із", en: "Click and immediately give food" },
                { ru: "Повторите 20 раз", kz: "20 рет ?айтала?ыз", en: "Repeat 20 times" },
                { ru: "Клик теперь означает 'Молодец!'", kz: "Шерту енді 'Жарайсы?!' дегенді білдіреді", en: "Click now means 'Good job!'" }
            ]
        },
        {
            id: 15, title: "Переноска", titleKz: "Тасымалдаушы", desc: "Мысы?ты тасымалдаушы?а ?йрету", color: "#D7BDE2", free: false, cost: 75,
            subs: [
                { ru: "Оставьте переноску открытой в комнате", kz: "Тасымалдаушыны б?лмеде ашы? ?алдыры?ыз", en: "Leave the carrier open in the room" },
                { ru: "Кладите туда вкусняшки иногда", kz: "Кейде ол жерге д?мді та?амдар салы?ыз", en: "Put treats inside occasionally" },
                { ru: "Кошка привыкнет и не будет бояться", kz: "Мысы? ?йреніп, ?оры?пайтын болады", en: "The cat will get used to it and not be afraid" }
            ]
        },
        {
            id: 16, title: "Команда 'Ко мне'", titleKz: "Кел ма?ан", desc: "Мысы?ты келуге ?йрету", color: "#FAB1A0", free: false, cost: 100,
            subs: [
                { ru: "Используйте любимый звук (пакет/банка)", kz: "Сүйікті дыбысты пайдаланыңыз (пакет/қорап)", en: "Use a favorite sound (bag/can)" },
                { ru: "Когда прибежит — дайте самое вкусное", kz: "Ж?гіріп келгенде — е? д?мдісін бері?із", en: "When she runs over — give the best treat" }
            ]
        },
        {
            id: 17, title: "Хай-файв", titleKz: "Бестік бер", desc: "Мысы?ты с?лемдесуге ?йрету", color: "#00B894", free: false, cost: 100,
            subs: [
                { ru: "Поднимите руку над головой кошки", kz: "?олы?ызды мысы?ты? басынан жо?ары к?тері?із", en: "Raise your hand above the cat's head" },
                { ru: "Кошка потянется лапой вверх", kz: "Мысы? т?я?ымен жо?ары созылады", en: "The cat will reach up with a paw" },
                { ru: "Коснитесь её лапы 'Дай пять!'", kz: "Т?я?ына 'Бестік бер!' деп тиі?із", en: "Touch her paw: 'High five!'" }
            ]
        }
    ]
};

let currentTrainingCategory = "dogs";

function initTrainingPage() {
    switchTrainingCategory(currentTrainingCategory);
}

function switchTrainingCategory(cat) {
    currentTrainingCategory = cat;
    document.querySelectorAll(".training-tab").forEach(t => t.classList.toggle("active", t.dataset.category === cat));
    const grid = document.getElementById("trainingGrid");
    if (!grid) return;
    grid.innerHTML = "";

    const videos = trainingVideos[cat] || [];
    const unlocked = JSON.parse(localStorage.getItem("unlockedVideos") || "[]");

    videos.forEach(v => {
        const isBought = v.free || unlocked.includes(v.id);
        const titleKey = currentLang === "en" ? "titleEn" : currentLang === "kz" ? "titleKz" : "title";
        const descKey = currentLang === "en" ? "descEn" : currentLang === "kz" ? "descKz" : "descRu";
        const defaultDesc = currentLang === "en"
            ? `Step-by-step training: ${v.titleEn || v.title}`
            : currentLang === "kz"
                ? `Қадамдап үйрету: ${v.titleKz || v.title}`
                : `Пошаговая тренировка: ${v.title}`;
        const localizedDesc = v[descKey] || defaultDesc;

        const card = document.createElement("div");
        card.className = "card training-card" + (isBought ? "" : " locked");
        card.setAttribute("id", `training-card-${v.id}`);
        card.innerHTML = `
            <div class="card-icon" style="background:${v.color}">
                <i class="fas ${isBought ? 'fa-play' : 'fa-lock'}"></i>
            </div>
            <div class="card-title">${v[titleKey] || v.title}</div>
            <div class="card-desc">${localizedDesc}</div>
            ${isBought
                ? `<button class="btn btn-sm" onclick="playInlineVideo(${v.id})"><i class="fas fa-play"></i> Смотреть</button>`
                : `<button class="btn btn-sm btn-outline" onclick="unlockVideoWithCoins(${v.id}, ${v.cost})">${v.cost} PawCoins Разблокировать</button>`
            }
            <div class="inline-video-area" id="inline-video-${v.id}" style="display:none;"></div>
        `;
        grid.appendChild(card);
    });
}

function unlockVideoWithCoins(id, cost) {
    const coins = getPawCoins();
    if (coins < cost) {
        showToast("Недостаточно PawCoins! Нажмите на монетки в шапке, чтобы пройти викторину", "error");
        return;
    }
    setPawCoins(coins - cost);
    const unlocked = JSON.parse(localStorage.getItem("unlockedVideos") || "[]");
    unlocked.push(id);
    localStorage.setItem("unlockedVideos", JSON.stringify(unlocked));
    updatePawCoinsDisplay();
    switchTrainingCategory(currentTrainingCategory);
    showToast("Видео разблокировано!", "success");
}

let videoTimer = null;
let activeInlineVideoId = null;
const videoPlaybackState = {};
const subtitleLangByVideo = {};

function playInlineVideo(id) {
    if (activeInlineVideoId !== null && activeInlineVideoId !== id) {
        const prevArea = document.getElementById(`inline-video-${activeInlineVideoId}`);
        if (prevArea) { prevArea.style.display = "none"; prevArea.innerHTML = ""; }
        const prevCard = document.getElementById(`training-card-${activeInlineVideoId}`);
        if (prevCard) prevCard.classList.remove("playing");
    }
    if (videoTimer) { clearInterval(videoTimer); videoTimer = null; }

    const all = [...trainingVideos.dogs, ...trainingVideos.cats];
    const v = all.find(x => x.id === id);
    if (!v) return;

    const area = document.getElementById(`inline-video-${id}`);
    const card = document.getElementById(`training-card-${id}`);
    if (!area) return;

    if (area.style.display === "block") {
        area.style.display = "none";
        area.innerHTML = "";
        if (card) card.classList.remove("playing");
        activeInlineVideoId = null;
        return;
    }

    activeInlineVideoId = id;
    subtitleLangByVideo[id] = currentLang;
    if (card) card.classList.add("playing");

    area.innerHTML = `
        <div class="inline-scene" style="background: ${v.color}11">
            ${v.subs.map((s, i) => `
                <img src="assets/training/${s.img || 'placeholder.jpg'}" 
                     class="scene-img ${i === 0 ? 'active' : ''}" 
                     id="scene-img-${id}-${i}"
                     onerror="this.src='https://placehold.co/600x400/333/ff9500?text=PawVerse+Training+AI'">
            `).join('')}
            <div class="inline-subtitles" id="inline-subs-${id}"></div>
        </div>
        <div class="inline-sub-controls">
            <button class="sub-btn ${currentLang === 'ru' ? 'active' : ''}" onclick="switchInlineSub('ru',${id})">RU</button>
            <button class="sub-btn ${currentLang === 'kz' ? 'active' : ''}" onclick="switchInlineSub('kz',${id})">KZ</button>
            <button class="sub-btn ${currentLang === 'en' ? 'active' : ''}" onclick="switchInlineSub('en',${id})">EN</button>
        </div>
    `;
    area.style.display = "block";
    animateInlineSubtitles(v.subs, id);
}

function animateInlineSubtitles(subs, id) {
    const subBox = document.getElementById(`inline-subs-${id}`);
    if (!subBox) return;
    if (videoTimer) clearInterval(videoTimer);
    videoPlaybackState[id] = { subs, step: 0 };

    const renderStep = () => {
        const state = videoPlaybackState[id];
        if (!state) return;
        const lang = subtitleLangByVideo[id] || currentLang;
        const i = state.step % state.subs.length;
        const currentSub = state.subs[i];

        const line = document.createElement("div");
        line.className = "subtitle-line";
        line.textContent = currentSub[lang] || currentSub.ru;
        subBox.innerHTML = "";
        subBox.appendChild(line);

        document.querySelectorAll(`#inline-video-${id} .scene-img`).forEach(img => img.classList.remove("active"));
        const currentImg = document.getElementById(`scene-img-${id}-${i}`);
        if (currentImg) currentImg.classList.add("active");

        state.step += 1;
    };

    renderStep();
    videoTimer = setInterval(renderStep, 3000);
}

function switchInlineSub(lang, id) {
    subtitleLangByVideo[id] = lang;
    document.querySelectorAll(`#inline-video-${id} .sub-btn`).forEach(btn => {
        btn.classList.toggle("active", btn.textContent.toLowerCase() === lang);
    });
    const state = videoPlaybackState[id];
    if (!state) return;
    const currentIndex = Math.max(0, state.step - 1) % state.subs.length;
    const currentSub = state.subs[currentIndex];
    const line = document.querySelector(`#inline-subs-${id} .subtitle-line`);
    if (line) line.textContent = currentSub[lang] || currentSub.ru;
}




// ===================== GOOGLE AUTH =====================
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'; // <-- REPLACE THIS

function signInWithGoogle() {
    if (typeof google === 'undefined' || !google.accounts) {
        showToast("Загрузка Google SDK... Попробуйте через пару секунд", "info");
        return;
    }
    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential
    });
    google.accounts.id.prompt();
}

async function handleGoogleCredential(response) {
    showLoader();
    try {
        const res = await fetch(`${API}/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: response.credential })
        });
        const data = await res.json();
        if (data.token) {
            localStorage.setItem("token", data.token);
            showToast("Вход через Google успешен!", "success");
            await loadUser();
            updateNavVisibility();
            goToPage("hero");
        } else {
            showToast(data.error || "Ошибка Google входа", "error");
        }
    } catch { showToast("Сервер недоступен", "error"); }
    finally { hideLoader(); }
}

// ===================== PAWCOINS MENU & QUIZ =====================
const quizQuestions = [
    {
        qRu: "Сколько часов в день в среднем спит кошка?",
        qKz: "Мысық орташа есеппен күніне неше сағат ұйықтайды?",
        qEn: "How many hours a day does a cat sleep on average?",
        optionsRu: ["8", "12-16", "20", "6"],
        optionsKz: ["8", "12-16", "20", "6"],
        optionsEn: ["8", "12-16", "20", "6"],
        correct: 1, img: "cat_sleep"
    },
    {
        qRu: "Какая порода собак самая маленькая в мире?",
        qKz: "Әлемдегі ең кішкентай ит тұқымы қандай?",
        qEn: "What is the smallest dog breed in the world?",
        optionsRu: ["Пудель", "Йоркшир", "Чихуахуа", "Шпиц"],
        optionsKz: ["Пудель", "Йоркшир", "Чихуахуа", "Шпиц"],
        optionsEn: ["Poodle", "Yorkshire", "Chihuahua", "Spitz"],
        correct: 2, img: "chihuahua"
    },
    {
        qRu: "Какой витамин вырабатывается у собак на солнце?",
        qKz: "Күн астында иттерде қандай дәрумен түзіледі?",
        qEn: "Which vitamin is produced in dogs in the sun?",
        optionsRu: ["A", "B12", "C", "D"],
        optionsKz: ["A", "B12", "C", "D"],
        optionsEn: ["A", "B12", "C", "D"],
        correct: 3, img: "dog_sun"
    },
    {
        qRu: "Сколько зубов у взрослой собаки?",
        qKz: "Ересек иттің неше тісі бар?",
        qEn: "How many teeth does an adult dog have?",
        optionsRu: ["28", "42", "36", "32"],
        optionsKz: ["28", "42", "36", "32"],
        optionsEn: ["28", "42", "36", "32"],
        correct: 1, img: "dog_teeth"
    },
    {
        qRu: "Какое животное может видеть ультрафиолет?",
        qKz: "Қандай жануар ультракүлгін сәулені көре алады?",
        qEn: "Which animal can see ultraviolet light?",
        optionsRu: ["Собака", "Кошка", "Хомяк", "Попугай"],
        optionsKz: ["Ит", "Мысық", "Хомяк", "Тотыұс"],
        optionsEn: ["Dog", "Cat", "Hamster", "Parrot"],
        correct: 1, img: "uv_cat"
    },
    {
        qRu: "Какова нормальная температура тела кошки?",
        qKz: "Мысықтың қалыпты дене температурасы қандай?",
        qEn: "What is the normal body temperature of a cat?",
        optionsRu: ["36.6°C", "37.5°C", "38-39°C", "40°C"],
        optionsKz: ["36.6°C", "37.5°C", "38-39°C", "40°C"],
        optionsEn: ["36.6°C", "37.5°C", "38-39°C", "40°C"],
        correct: 2, img: "cat_temp"
    },
    {
        qRu: "Сколько когтей у кошки обычно?",
        qKz: "Мысықтың әдетте неше тырнағы болады?",
        qEn: "How many claws does a cat usually have?",
        optionsRu: ["16", "18", "20", "22"],
        optionsKz: ["16", "18", "20", "22"],
        optionsEn: ["16", "18", "20", "22"],
        correct: 1, img: "cat_paw"
    }
];

let currentQuizSession = { questions: [], currentIndex: 0, earned: 0 };

function openQuizFromCoins() {
    const modal = document.getElementById("quizModal");
    const container = document.getElementById("quizPopupContent");
    const title = document.getElementById("quizTitle");
    const d = (typeof t !== 'undefined' && t[currentLang]) ? t[currentLang] : { quizMenuTitle: "PawCoins", quizEarnedLabel: "Balance", buyCoins: "Buy", takeQuizPlaceholder: "Quiz" };

    title.textContent = d.quizMenuTitle;

    const currentCoins = getPawCoins();
    container.innerHTML = `
        <div style="text-align:center;margin-bottom:16px;">
            <div style="font-size:2.5rem;">PawCoins</div>
            <div style="font-size:1.4rem;font-weight:800;color:#FFD700;margin:8px 0;">${currentCoins} PawCoins</div>
            <p style="color:rgba(255,255,255,0.6);font-size:0.9rem;">${currentLang === 'ru' ? 'Выберите действие' : currentLang === 'kz' ? 'Әрекетті таңдаңыз' : 'Choose an action'}</p>
        </div>
        <div class="coins-menu-options">
            <button class="coins-menu-btn" onclick="showBuyCoinsStub()">
                <span class="menu-icon">+</span>
                <div class="menu-text">
                    <h3>${d.buyCoins}</h3>
                    <p>${currentLang === 'ru' ? 'Пополнить баланс монет' : currentLang === 'kz' ? 'Монеталар балансын толтыру' : 'Refill your coin balance'}</p>
                </div>
            </button>
            <button class="coins-menu-btn" onclick="startQuizFromMenu()">
                <span class="menu-icon">Q</span>
                <div class="menu-text">
                    <h3>${d.takeQuizPlaceholder}</h3>
                    <p>${currentLang === 'ru' ? 'Ответьте на вопросы и получите монеты' : currentLang === 'kz' ? 'Сұрақтарға жауап беріп, монета алыңыз' : 'Answer questions and earn coins'}</p>
                </div>
            </button>
        </div>
    `;
    modal.classList.add("active");
}


function showBuyCoinsStub() {
    const container = document.getElementById("quizPopupContent");
    const title = document.getElementById("quizTitle");
    title.textContent = "Купить PawCoins";
    container.innerHTML = `
        <div style="text-align:center;padding:30px 10px;">
            <div style="font-size:3rem;margin-bottom:16px;">PawCoins</div>
            <h3 style="color:#ffd34d;margin-bottom:10px;">Скоро!</h3>
            <p style="color:rgba(255,255,255,0.7);font-size:0.95rem;line-height:1.6;">
                Покупка PawCoins будет доступна в следующем обновлении.<br>
                А пока — проходите тесты и зарабатывайте монеты бесплатно.
            </p>
            <button class="btn btn-sm" style="margin-top:20px;" onclick="openQuizFromCoins()">
                <i class="fas fa-arrow-left"></i> Назад
            </button>
        </div>
    `;
}

function startQuizFromMenu() {
    const today = new Date().toDateString();
    const stored = JSON.parse(localStorage.getItem("quizAttempts") || "{}");
    const attempts = stored[today] || 0;

    if (attempts >= 5) {
        const container = document.getElementById("quizPopupContent");
        const title = document.getElementById("quizTitle");
        title.textContent = "Викторина";
        container.innerHTML = `
            <div style="text-align:center;padding:20px;">
                <div style="font-size:3rem;margin-bottom:12px;">i</div>
                <p class="quiz-limited-msg">Вы исчерпали 5 попыток на сегодня.<br>Возвращайтесь завтра!</p>
                <button class="btn btn-sm" style="margin-top:16px;" onclick="openQuizFromCoins()">
                    <i class="fas fa-arrow-left"></i> Назад
                </button>
            </div>
        `;
        return;
    }

    // Pick 3 random questions
    const shuffled = [...quizQuestions].sort(() => Math.random() - 0.5);
    currentQuizSession = { questions: shuffled.slice(0, 3), currentIndex: 0, earned: 0 };
    renderQuizStep();
}

function renderQuizStep() {
    const container = document.getElementById("quizPopupContent");
    const title = document.getElementById("quizTitle");
    const d = (typeof t !== 'undefined' && t[currentLang]) ? t[currentLang] : { quizQuestionLabel: "Question", quizResultLabel: "Result", quizCongratsLabel: "Congrats", quizEarnedLabel: "Earned" };
    const { questions, currentIndex } = currentQuizSession;

    if (currentIndex >= questions.length) {
        // Quiz finished
        const today = new Date().toDateString();
        const stored = JSON.parse(localStorage.getItem("quizAttempts") || "{}");
        stored[today] = (stored[today] || 0) + 1;
        localStorage.setItem("quizAttempts", JSON.stringify(stored));

        title.textContent = d.quizResultLabel;
        container.innerHTML = `
            <div style="text-align:center;padding:20px;">
                <div style="font-size:3rem;margin-bottom:12px;">OK</div>
                <h3 style="color:#ffd34d;margin-bottom:8px;">${d.quizCongratsLabel}</h3>
                <p style="font-size:1.1rem;color:#fff;">${d.quizEarnedLabel} <b>${currentQuizSession.earned} PawCoins</b></p>
                <p style="color:rgba(255,255,255,0.5);font-size:0.85rem;margin-top:8px;">${currentLang === 'ru' ? 'Попыток сегодня' : currentLang === 'kz' ? 'Бүгінгі талпыныстар' : 'Attempts today'}: ${stored[today]}/5</p>
                <button class="btn btn-glow" style="margin-top:20px;width:100%;" onclick="document.getElementById('quizModal').classList.remove('active')">
                    ${currentLang === 'ru' ? 'Отлично!' : currentLang === 'kz' ? 'Тамаша!' : 'Awesome!'}
                </button>
            </div>
        `;
        updatePawCoinsDisplay();
        return;
    }

    const q = questions[currentIndex];
    const qText = currentLang === 'en' ? q.qEn : currentLang === 'kz' ? q.qKz : q.qRu;
    const opts = currentLang === 'en' ? q.optionsEn : currentLang === 'kz' ? q.optionsKz : q.optionsRu;

    title.textContent = `${d.quizQuestionLabel} ${currentIndex + 1}/${questions.length}`;

    let imgHtml = "";
    if (q.img) {
        imgHtml = `
            <div class="quiz-image-container">
                <img src="assets/quiz/${q.img || 'placeholder.jpg'}.jpg" 
                     alt="Quiz Image"
                     onerror="this.src='https://placehold.co/600x400/333/ff9500?text=PawVerse+AI+Quiz'">
            </div>
        `;
    }

    container.innerHTML = `
        <div style="padding:10px 0;">
            ${imgHtml}
            <p class="quiz-question-text">${qText}</p>
            <div style="display:flex;flex-direction:column;gap:12px;">
                ${opts.map((opt, i) => `
                    <button class="coins-menu-btn quiz-opt-btn" onclick="checkQuizAnswer(${i})">
                        <span class="opt-prefix">${String.fromCharCode(64 + (i + 1))}</span>
                        <span class="opt-text">${opt}</span>
                    </button>
                `).join('')}
            </div>
        </div>
    `;
}


function checkQuizAnswer(answerIndex) {
    const { questions, currentIndex } = currentQuizSession;
    const q = questions[currentIndex];
    const correct = answerIndex === q.correct;

    if (correct) {
        addPawCoins(10);
        currentQuizSession.earned += 10;
        showToast("+10 PawCoins!", "success");
        launchConfetti();
    } else {
        const opts = currentLang === 'en' ? q.optionsEn : currentLang === 'kz' ? q.optionsKz : q.optionsRu;
        showToast(`Неправильно. Ответ: ${opts[q.correct]}`, "error");
    }

    currentQuizSession.currentIndex++;
    setTimeout(renderQuizStep, 800);
}

// ===================== STARTUP ENHANCEMENTS =====================

// 1. Animated Counters
function animateCounters() {
    document.querySelectorAll('.hero-counter-number[data-target]').forEach(el => {
        const target = parseInt(el.dataset.target);
        const duration = 2000;
        const step = target / (duration / 16);
        let current = 0;
        const timer = setInterval(() => {
            current += step;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            if (target >= 1000) {
                el.textContent = Math.floor(current).toLocaleString('ru-RU') + '+';
            } else if (target <= 100) {
                el.textContent = Math.floor(current) + '%';
            } else {
                el.textContent = Math.floor(current) + '+';
            }
        }, 16);
    });
}

// 2. Scroll Reveal Observer
function initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// 3. Confetti Burst
function launchConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    const colors = ['#ff9500', '#ffcc00', '#ff6b00', '#7c3aed', '#e25555', '#27ae60', '#3498db'];
    for (let i = 0; i < 40; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDuration = (2 + Math.random() * 2) + 's';
        piece.style.animationDelay = Math.random() * 0.5 + 's';
        piece.style.width = (6 + Math.random() * 8) + 'px';
        piece.style.height = (6 + Math.random() * 8) + 'px';
        piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        container.appendChild(piece);
    }
    setTimeout(() => container.remove(), 4000);
}

// 4. Welcome Onboarding Modal
function showWelcomeModal() {
    if (localStorage.getItem('pawverse_welcomed')) return;
    const modal = document.getElementById('welcomeModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeWelcomeModal() {
    const modal = document.getElementById('welcomeModal');
    if (modal) {
        modal.style.opacity = '0';
        modal.style.transition = 'opacity 0.3s ease';
        setTimeout(() => { modal.style.display = 'none'; }, 300);
    }
    localStorage.setItem('pawverse_welcomed', '1');
    launchConfetti();
}

// 5. Show testimonials on features/about pages
function showTestimonials() {
    const section = document.getElementById('testimonials');
    if (section) section.style.display = 'block';
}

function hideTestimonials() {
    const section = document.getElementById('testimonials');
    if (section) section.style.display = 'none';
}

// ===================== STARTUP =====================
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initCabinet();
    initLanguage();
    updateNavVisibility();
    updatePawCoinsDisplay();

    // Auth forms
    const regForm = document.getElementById("registerForm");
    const logForm = document.getElementById("loginForm");
    if (regForm) regForm.addEventListener("submit", register);
    if (logForm) logForm.addEventListener("submit", login);

    // Pet form
    const petForm = document.getElementById("addPetForm");
    if (petForm) petForm.addEventListener("submit", addPet);

    // Booking forms
    const bookFormText = document.getElementById("bookingFormText");
    const bookFormMedia = document.getElementById("bookingFormMedia");
    if (bookFormText) bookFormText.addEventListener("submit", submitBooking);
    if (bookFormMedia) bookFormMedia.addEventListener("submit", submitBooking);

    // Nutrition form
    const nutForm = document.getElementById("nutritionForm");
    if (nutForm) {
        nutForm.addEventListener("submit", addNutritionEntry);
        const foodInput = document.getElementById("foodNameInput");
        if (foodInput) foodInput.addEventListener("input", handleFoodInput);
        const gramsInput = document.getElementById("gramsInput");
        if (gramsInput) gramsInput.addEventListener("input", recalculateNutrition);
    }

    // Logic for Add Pet Modal Toggles
    const gpsToggle = document.getElementById("addPetGpsToggle");
    if (gpsToggle) {
        gpsToggle.addEventListener("change", e => {
            const group = document.getElementById("gpsDeviceIdGroup");
            if (group) group.style.display = e.target.checked ? "block" : "none";
        });
    }
    const addPetAvatarFile = document.getElementById("addPetAvatarFile");
    if (addPetAvatarFile) {
        addPetAvatarFile.addEventListener("change", e => handleAddPetAvatarFileInput(e.target));
    }

    // Auth tabs
    document.querySelectorAll(".auth-tab").forEach(t => {
        t.addEventListener("click", () => switchAuthTab(t.dataset.tab));
    });

    // Nav links
    document.querySelectorAll("header .nav-link").forEach(link => {
        link.addEventListener("click", e => {
            e.preventDefault();
            goToPage(link.dataset.page);
        });
    });

    // -- Startup Enhancements --
    animateCounters();
    initScrollReveal();
    setTimeout(showWelcomeModal, 800);

    // Load user if token exists
    if (localStorage.getItem("token")) {
        loadUser().then(() => {
            updateNavVisibility();
            updatePawCoinsDisplay();
            goToPage("hero");
        });
    } else {
        goToPage("hero");
    }
});



// ===================== ADVANCED BOOKING LOGIC =====================
let currentBookingServiceId = null;
let currentBookingServiceMeta = {};
let lastAIDiagnosis = "";
let bookingModalEscHandlerBound = false;

function setBookingModalOpenState(isOpen) {
    const modal = document.getElementById("bookingModal");
    if (!modal) return;
    modal.classList.toggle("active", isOpen);
    modal.setAttribute("aria-hidden", isOpen ? "false" : "true");
    document.body.classList.toggle("modal-open", isOpen);
}

function ensureBookingModalCloseHandlers() {
    const modal = document.getElementById("bookingModal");
    if (!modal || modal.dataset.closeHandlersAttached === "1") return;

    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            closeBookingModal();
        }
    });
    modal.dataset.closeHandlersAttached = "1";
}

function openBookingModal(serviceId, serviceName, meta = {}) {
    currentBookingServiceId = serviceId;
    currentBookingServiceMeta = meta;
    if (document.getElementById('bookingServiceName')) document.getElementById('bookingServiceName').textContent = serviceName;
    if (document.getElementById('bookingServiceIdText')) document.getElementById('bookingServiceIdText').value = serviceId;
    if (document.getElementById('bookingServiceIdMedia')) document.getElementById('bookingServiceIdMedia').value = serviceId;

    ensureBookingModalCloseHandlers();
    setBookingModalOpenState(true);

    if (!bookingModalEscHandlerBound) {
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                const modal = document.getElementById("bookingModal");
                if (modal?.classList.contains("active")) {
                    closeBookingModal();
                }
            }
        });
        bookingModalEscHandlerBound = true;
    }

    // Resize map if it exists inside modal (future proofing)
    setTimeout(() => {
        if (clinicMap) clinicMap.invalidateSize();
    }, 200);

    switchBookingTab('text');
    lastAIDiagnosis = "";

    if (document.getElementById('mediaInput')) document.getElementById('mediaInput').value = '';
    if (document.getElementById('aiAnalysisProgress')) document.getElementById('aiAnalysisProgress').style.display = 'none';
    if (document.getElementById('aiAnalysisResult')) document.getElementById('aiAnalysisResult').style.display = 'none';
    if (document.getElementById('mediaUploadArea')) document.getElementById('mediaUploadArea').style.display = 'block';

    // Reset form fields
    const formText = document.getElementById('bookingFormText');
    const formMedia = document.getElementById('bookingFormMedia');
    if (formText) formText.reset();
    if (formMedia) formMedia.reset();

    // Set default date to tomorrow 10:00
    const setDefaultDate = (form) => {
        const dateInput = form?.querySelector('input[name="bookingDate"]');
        if (!dateInput) return;
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        const iso = tomorrow.toISOString().slice(0, 16);
        dateInput.value = iso;
    };
    setDefaultDate(formText);
    setDefaultDate(formMedia);

    loadBookingPets();
}

function closeBookingModal() {
    setBookingModalOpenState(false);
}

function switchBookingTab(tab) {
    document.querySelectorAll('.booking-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.booking-form-content').forEach(c => c.classList.remove('active'));
    const activeTab = document.querySelector(`.booking-tab[data-tab='${tab}']`);
    if (activeTab) activeTab.classList.add('active');
    if (tab === 'text') {
        const f = document.getElementById('bookingFormText');
        if (f) f.classList.add('active');
    } else {
        if (document.getElementById("bookingMediaType")) {
            document.getElementById("bookingMediaType").value = tab;
        }
        const mediaInput = document.getElementById("mediaInput");
        const uploadLabel = document.getElementById("mediaUploadLabel");
        const mediaHint = document.getElementById("mediaModeHint");
        if (mediaInput) mediaInput.setAttribute("accept", tab === "video" ? "video/*" : "image/*");
        if (uploadLabel) uploadLabel.textContent = tab === "video" ? "Нажмите для загрузки видео" : "Нажмите для загрузки фото";
        if (mediaHint) mediaHint.textContent = tab === "video"
            ? "Загрузите видео питомца. PawAI выделит проблемный фрагмент и предложит диагноз."
            : "Загрузите фото питомца. PawAI проанализирует состояние и предложит диагноз.";
        const f = document.getElementById('bookingFormMedia');
        if (f) f.classList.add('active');
    }
}

async function loadBookingPets() {
    try {
        const res = await fetch(`${API}/pets`, { headers: authHeaders() });
        const pets = await res.json();
        if (Array.isArray(pets) && pets.length > 0) {
            const firstPetId = pets[0].id;
            const textHidden = document.getElementById("bookingPetSelectText");
            const mediaHidden = document.getElementById("bookingPetSelectMedia");
            if (textHidden && !textHidden.value) textHidden.value = firstPetId;
            if (mediaHidden && !mediaHidden.value) mediaHidden.value = firstPetId;
        }
        renderPetCards(pets, 'bookingPetCardsText', 'bookingPetSelectText');
        renderPetCards(pets, 'bookingPetCardsMedia', 'bookingPetSelectMedia');
    } catch { showToast('Не удалось загрузить список питомцев', 'error'); }
}

window.handleMediaUpload = function (input) {
    if (!(input.files && input.files[0])) return;
    const file = input.files[0];
    const mediaType = document.getElementById("bookingMediaType")?.value || "photo";
    document.getElementById('mediaUploadArea').style.display = 'none';
    document.getElementById('aiAnalysisProgress').style.display = 'block';
    document.getElementById('aiAnalysisResult').style.display = 'none';

    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const res = await fetch(`${API}/ai/analyze-media`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({
                    mediaType,
                    fileName: file.name,
                    dataUrl: reader.result
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "AI analysis failed");
            lastAIDiagnosis = data.diagnosisName || "undetected";
            document.getElementById('aiResultText').textContent = data.summary || "Анализ завершен";
        } catch (e) {
            console.error(e);
            lastAIDiagnosis = "undetected";
            document.getElementById('aiResultText').textContent = "PawAI не смог уверенно определить состояние. Опишите симптомы в комментарии и выберите дату записи.";
        } finally {
            document.getElementById('aiAnalysisProgress').style.display = 'none';
            document.getElementById('aiAnalysisResult').style.display = 'block';
        }
    };
    reader.readAsDataURL(file);
};

window.proceedToBookingFromAI = function () {
    const aiText = document.getElementById('aiResultText').textContent;
    const petId = document.getElementById('bookingPetSelectMedia').value;
    switchBookingTab('text');
    const comment = document.querySelector("#bookingFormText textarea[name='comment']");
    if (comment) comment.value = `[AI Analysis]: ${aiText}\nЗаболевание: ${lastAIDiagnosis || "не определено"}\n`;
    if (petId) {
        const sel = document.getElementById('bookingPetSelectText');
        if (sel) sel.value = petId;
        const textCards = document.getElementById("bookingPetCardsText");
        if (textCards) {
            textCards.querySelectorAll(".pet-card").forEach((card) => card.classList.remove("active"));
            const matchingCard = textCards.querySelector(`.pet-card[data-pet-id="${petId}"]`);
            if (matchingCard) matchingCard.classList.add("active");
        }
    }
};

async function submitBooking(e) {
    e.preventDefault();
    const form = e.target;
    const isMediaFlow = form.id === "bookingFormMedia";
    const petId = isMediaFlow ? document.getElementById("bookingPetSelectMedia")?.value : document.getElementById("bookingPetSelectText")?.value;
    const bookingDate = form.querySelector('input[name="bookingDate"]')?.value;
    const comment = form.querySelector('textarea[name="comment"]')?.value?.trim();
    if (!petId || !bookingDate) {
        showToast("Выберите питомца и дату записи", "error");
        return;
    }

    const payload = {
        petId,
        serviceId: currentBookingServiceId,
        bookingDate,
        comment,
        requestType: isMediaFlow ? (document.getElementById("bookingMediaType")?.value || "photo") : "text",
        diagnosisName: isMediaFlow ? lastAIDiagnosis : undefined,
        localServiceName: String(currentBookingServiceId || "").startsWith("local_") ? String(currentBookingServiceId).replace("local_", "") : undefined,
        localServiceType: currentBookingServiceMeta.localServiceType,
        city: currentUser?.city || "Astana"
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    showLoader();
    try {
        const res = await fetch(`${API}/bookings`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Ошибка записи");
        showToast("Запись создана!", "success");
        closeBookingModal();
        form.reset();
        loadBookings();
    } catch (err) {
        showToast(err.message || "Ошибка записи", "error");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
        hideLoader();
    }
}




