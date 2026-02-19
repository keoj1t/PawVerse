# Run Instructions

## 1. Требования
- Node.js 18+
- PostgreSQL 14+
- Python 3.10+ (для AI)

## 2. Настройка backend
```powershell
cd backend
npm install
```

Проверь `.env` в `backend/.env`:
- `DATABASE_URL=...`
- `PAW_AI_MODEL_PATH=...` (путь к `best.pt`)
- `PAW_AI_PYTHON=python` (или путь к python.exe)

Синхронизируй схему БД:
```powershell
npx prisma db push
```

Запусти сервер:
```powershell
node server.js
```

API будет доступен на `http://localhost:3000`.

## 3. Настройка Python-зависимостей (AI)
Из корня проекта:
```powershell
pip install -r requirements.txt
```

## 4. Frontend
Frontend раздается backend-ом как статика из `front/`.
Открой в браузере:
- `http://localhost:3000`

## 5. Проверка AI-инференса вручную (опционально)
```powershell
python paw_pal_clean\paw_pal\analyze_media.py <path_to_image_or_video> <path_to_best.pt>
```

