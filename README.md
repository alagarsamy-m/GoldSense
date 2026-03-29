# GoldSense - AI-Powered Gold Price Prediction Platform

An end-to-end MLOps platform that predicts daily gold prices (24k & 22k) for the Indian market using XGBoost, with automated evaluation, drift detection, and self-improving feedback loops.

**Live:** [gold-sense-five.vercel.app](https://gold-sense-five.vercel.app)

---

## What It Does

- Predicts **tomorrow's gold price** in USD/oz and INR/gram (24k & 22k)
- Shows **7-day forecast** with 80% confidence intervals
- Runs a **daily MLOps pipeline** that evaluates yesterday's prediction, logs accuracy, and detects model drift
- **Auto-retrains** when prediction accuracy degrades
- Provides **personalized buy/sell/hold recommendations** via AI chatbot
- Displays **live gold prices** with auto-refresh ticker

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  React 18 + Vite + Tailwind CSS + Recharts + Framer Motion  │
│  Live Ticker | Predictor | Forecast | Accuracy | Chatbot    │
│                    Hosted on Vercel                          │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────────────┐
│                        BACKEND                               │
│           FastAPI + Uvicorn + Supabase + Groq LLM           │
│  /prediction  /user  /chatbot  /health  /status             │
│                    Hosted on Render                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      ML PIPELINE                             │
│  XGBoost (Direction Classifier + Regression + Quantile)     │
│  78 Features | Macro: DXY, VIX, TNX, OIL | Sentiment       │
│  Optuna Tuning | Walk-Forward CV | Drift Detection          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    MLOps PIPELINES                            │
│  Daily: Evaluate → Predict → Deploy (Mon-Fri 7PM UTC)       │
│  Weekly: Full Retrain with Optuna (Monday 6AM UTC)          │
│  Auto-Retrain: Triggered when drift detected                │
│                  GitHub Actions                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Model Performance

| Metric | Value |
|--------|-------|
| Direction Accuracy | 57.8% (hold-out) |
| MAPE | 1.13% |
| RMSE | $67.36 |
| MAE | $41.75 |
| 80% Interval Coverage | 73.2% |
| CV Direction Accuracy | 52.5% (5-fold walk-forward) |
| Training Data | 26 years (2000-2026), 6,256 trading days |
| Features | 78 (price lags, technicals, macro, sentiment) |

### Dual Model Architecture

- **Direction Classifier** (XGBClassifier) — predicts UP/DOWN with confidence score
- **Magnitude Regressor** (XGBRegressor) — predicts log return for price estimation
- **Quantile Models** (q10, q90) — 80% confidence intervals

### Top Features by Importance

| Feature | Category |
|---------|----------|
| `log_return_1` | Recent momentum |
| `bb_lower` | Technical (Bollinger) |
| `vix_rolling_mean_5` | Macro (fear index) |
| `dxy_return` | Macro (USD strength) |
| `oil_return` | Macro (inflation proxy) |
| `gold_dxy_ratio` | Macro (gold/dollar) |
| `log_return_5` | Weekly momentum |

---

## MLOps Pipeline

### Daily Pipeline (Mon-Fri, 7 PM UTC)

```
Fetch latest prices (yfinance)
    ↓
Evaluate yesterday's prediction vs actual
    ↓
Log accuracy to prediction_logs.csv
    ↓
Analyze error patterns (volatility, streaks, bias)
    ↓
Detect drift (MAPE > 2% or Direction < 45%)
    ↓
Generate tomorrow's prediction → pending_prediction.json
    ↓
Commit data + Redeploy backend
    ↓
If drift → Auto-trigger full retrain
```

### Weekly Retrain (Monday, 6 AM UTC)

- Full Optuna hyperparameter tuning (30 trials per model)
- Walk-forward cross-validation (5 folds)
- Retrains both direction classifier and regression model
- Updates quantile models for confidence intervals

### Drift Detection

The system monitors rolling accuracy and auto-retrains when:
- Average MAPE exceeds **2%** over last 7 predictions
- Direction accuracy drops below **45%**
- Error trend is worsening (MAPE increasing by > 0.5%)

---

## Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| React 18 | UI framework |
| Vite | Build tool |
| Tailwind CSS 4 | Styling |
| Recharts | Charts and forecast visualization |
| Framer Motion | Animations |
| Supabase JS | Authentication (Google OAuth) |
| Axios | HTTP client |

### Backend
| Technology | Purpose |
|-----------|---------|
| FastAPI | REST API framework |
| Uvicorn | ASGI server |
| Supabase | Auth + PostgreSQL database |
| Groq (Llama 3.3 70B) | AI chatbot + recommendations |
| VADER Sentiment | News sentiment analysis |

### ML Pipeline
| Technology | Purpose |
|-----------|---------|
| XGBoost | Prediction models (classifier + regressor + quantile) |
| Optuna | Hyperparameter tuning |
| scikit-learn | Walk-forward CV, metrics |
| yfinance | Live market data (gold, USD/INR, DXY, VIX, OIL) |
| pandas + ta | Feature engineering + technical indicators |

### Infrastructure
| Service | Purpose |
|---------|---------|
| Vercel | Frontend hosting |
| Render | Backend hosting (Docker) |
| GitHub Actions | CI/CD (daily evaluate + weekly retrain) |
| Supabase | Database + Auth |

---

## Project Structure

```
GoldSense/
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── LiveTicker/         # Real-time gold price banner
│       │   ├── PricePredictor/     # Tomorrow's prediction (24k + 22k)
│       │   ├── WeeklyForecast/     # 7-day chart with CI bands
│       │   ├── AccuracyLog/        # Prediction vs actual tracking
│       │   ├── Chatbot/            # AI gold advisor
│       │   ├── Recommendations/    # Buy/sell/hold signals
│       │   └── ...
│       ├── pages/
│       │   ├── Home.jsx            # Public landing page
│       │   └── Dashboard.jsx       # Authenticated dashboard
│       └── services/
│           ├── api.js              # API client
│           └── supabase.js         # Auth client
│
├── backend/
│   └── app/
│       ├── main.py                 # FastAPI app with lifespan
│       ├── config.py               # Settings (env vars)
│       ├── routers/
│       │   ├── prediction.py       # /api/prediction/* endpoints
│       │   ├── user.py             # /api/user/* endpoints
│       │   └── chatbot.py          # /api/chatbot/* endpoints
│       └── services/
│           ├── gold_service.py     # ML pipeline interface + caching
│           ├── groq_service.py     # LLM for chat + recommendations
│           └── supabase_service.py # Auth + DB operations
│
├── ml/
│   ├── preprocess.py               # Feature engineering (78 features)
│   ├── train.py                    # Dual model training + Optuna
│   ├── predict.py                  # Prediction pipeline
│   ├── evaluate.py                 # Daily evaluation + drift detection
│   ├── sentiment_service.py        # News sentiment scoring
│   ├── update_data.py              # Dataset updater (yfinance)
│   └── model/
│       ├── gold_model.pkl          # Regression model
│       ├── gold_direction_model.pkl # Direction classifier
│       ├── gold_model_q10.pkl      # Lower quantile (10th percentile)
│       ├── gold_model_q90.pkl      # Upper quantile (90th percentile)
│       ├── model_metadata.json     # Training metrics + params
│       ├── pending_prediction.json # Tomorrow's prediction (for evaluation)
│       └── system_status.json      # MLOps health report
│
├── dataset/
│   ├── Gold Rate.csv               # Gold prices (2000-2026)
│   ├── USD-INR.csv                 # Exchange rates (2000-2026)
│   ├── macro_data.csv              # DXY, VIX, TNX, OIL
│   ├── prediction_logs.csv         # Accuracy history
│   └── sentiment_logs.csv          # Daily sentiment scores
│
├── .github/workflows/
│   ├── daily-evaluate.yml          # Daily MLOps pipeline
│   ├── weekly-retrain.yml          # Weekly model retraining
│   └── deploy-backend.yml          # Auto-deploy on push
│
└── Dockerfile                      # Backend container
```

---

## India Gold Price Conversion

Gold prices are converted from international USD/troy oz to Indian retail prices:

```
Base price (INR/gram) = (USD per oz × USD/INR rate) ÷ 31.1035
24k price = Base × 1.0918  (6% import duty + 3% GST)
22k price = 24k × (22/24)
```

Import duty: **6%** (reduced from 15% in Union Budget July 2024)

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 18+
- Supabase project (for auth + database)
- Groq API key (for AI chatbot)

### Backend

```bash
cd GoldSense

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt
pip install -r ml/requirements.txt

# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_KEY="your-service-key"
export GROQ_API_KEY="your-groq-key"

# Start backend
PYTHONPATH="$PWD/ml:$PWD/backend" python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Create .env
echo 'VITE_API_URL=http://localhost:8000' > .env
echo 'VITE_SUPABASE_URL=https://your-project.supabase.co' >> .env
echo 'VITE_SUPABASE_ANON_KEY=your-anon-key' >> .env

# Start dev server
npm run dev
```

Open **http://localhost:5173**

### Train Model

```bash
cd ml
python update_data.py    # Fetch latest prices
python train.py          # Full train with Optuna (takes ~5 min)
python predict.py        # Test prediction
python evaluate.py       # Run evaluation pipeline
```

---

## API Endpoints

### Public (no auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/prediction/today` | Live gold price (USD + INR 24k/22k) |
| GET | `/api/prediction/tomorrow` | Tomorrow's prediction with confidence interval |
| GET | `/api/prediction/week` | 7-day forecast |
| GET | `/api/prediction/accuracy` | Prediction accuracy logs |
| GET | `/api/prediction/status` | MLOps system health |
| GET | `/api/prediction/sentiment` | Gold market sentiment |
| GET | `/api/prediction/model-info` | Model metadata |
| GET | `/health` | Backend health check |

### Protected (requires Google sign-in)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/user/profile` | User investment profile |
| PUT | `/api/user/profile` | Update profile |
| GET | `/api/user/recommendations` | AI buy/sell/hold recommendation |
| GET | `/api/user/dashboard` | Aggregated dashboard data |
| POST | `/api/chatbot/message` | Send message to AI chatbot |
| GET | `/api/chatbot/history` | Chat history |

---

## Environment Variables

### Backend

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `GROQ_API_KEY` | Yes | Groq API key for LLM |
| `ALPHAVANTAGE_KEY` | No | Alpha Vantage key (improves sentiment) |
| `NEWSAPI_KEY` | No | NewsAPI key (improves sentiment) |
| `ALLOWED_ORIGINS` | No | CORS origins (comma-separated) |

### Frontend

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Backend API URL |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |

### GitHub Actions Secrets

| Secret | Required | Description |
|--------|----------|-------------|
| `RENDER_DEPLOY_HOOK_URL` | Yes | Render deploy webhook URL |
| `ALPHAVANTAGE_KEY` | No | For sentiment analysis |
| `NEWSAPI_KEY` | No | For sentiment analysis |

---

## Contributors

- **Alagarsamy M** — Project owner, core architecture
- **Eswaran J** — MLOps pipeline, model improvements, UI redesign

---

## License

MIT License - see [LICENSE](LICENSE)
