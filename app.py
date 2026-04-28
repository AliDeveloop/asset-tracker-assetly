# ============================================================
#  Assetly - پلتفرم مدیریت پورتفوی
#  فایل اصلی سرور Flask
#  نسخه: 3.0.0
# ============================================================

# ============================================================
#  بخش ۱: ایمپورت‌ها و لود تنظیمات
# ============================================================

import json
import os
import uuid
import re
from datetime import datetime, timezone, timedelta
import atexit
import decimal
import sqlite3
import hashlib
import secrets
from functools import wraps
import time

import requests
from bs4 import BeautifulSoup
from flask import Flask, render_template, jsonify, request, session, redirect, url_for, g, make_response
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
from collections import defaultdict

# لود متغیرهای محیطی از فایل .env
load_dotenv()

# ============================================================
#  بخش ۲: ثابت‌ها و کانفیگ‌های全局
# ============================================================

# ---------- تنظیمات پایگاه داده ----------
DATABASE = os.getenv('DB_NAME', 'assetly.db')
DB_USER = os.getenv('DB_USER', None)
DB_PASSWORD = os.getenv('DB_PASSWORD', None)

# ---------- کلیدهای API خارجی ----------
BRSAPI_KEY = os.getenv('BRSAPI_KEY')

# ---------- آدرس‌های API قیمت‌ها ----------
API_GOLD_CURRENCY = f"https://Api.BrsApi.ir/Market/Gold_Currency.php?key={BRSAPI_KEY}"
API_TSETMC = f"https://Api.BrsApi.ir/Tsetmc/AllSymbols.php?key={BRSAPI_KEY}&type=1"

# ---------- هدرهای درخواست‌های HTTP ----------
API_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*"
}

# ---------- تنظیمات کش ----------
PRICE_CACHE_MINUTES = 10  # فاصله زمانی بروزرسانی قیمت‌ها (دقیقه)

# ---------- دسته‌بندی دارایی‌ها و نمادهای هر دسته ----------
ASSET_TYPES = {
    "crypto": [
        "BTC", "ETH", "USDT", "XRP", "BNB", "SOL", "USDC", "TRX",
        "DOGE", "ADA", "LINK", "XLM", "AVAX", "SHIB", "LTC", "DOT",
        "UNI", "ATOM", "FIL"
    ],
    "gold_coin": [
        "IR_GOLD_18K", "IR_GOLD_24K", "IR_GOLD_MELTED",
        "IR_COIN_1G", "IR_COIN_QUARTER", "IR_COIN_HALF",
        "IR_COIN_EMAMI", "IR_COIN_BAHAR", "XAUUSD"
    ],
    "currency": [
        "USDT_IRT", "USD", "EUR", "AED", "GBP", "JPY", "KWD",
        "AUD", "CAD", "CNY", "TRY", "SAR", "CHF", "INR", "PKR",
        "IQD", "SYP", "SEK", "QAR", "OMR", "BHD", "AFN", "MYR",
        "THB", "RUB", "AZN", "AMD", "GEL"
    ],
    "stock": []
}

# مپ معکوس: از نماد به نوع دارایی
ALL_SYMBOLS = {
    symbol: asset_type
    for asset_type, symbols in ASSET_TYPES.items()
    for symbol in symbols
}

# ---------- مسیر فایل‌های کش ----------
PRICES_FILE = 'prices.json'
TSETMC_FILE = 'tsetmc_data.json'
STATUS_FILE = 'status_config.json'

# ---------- ثابت‌های سیستم ----------
RIAL_WALLET_SYMBOL = 'RIAL_WALLET'

# ============================================================
#  بخش ۳: راه‌اندازی اپلیکیشن Flask
# ============================================================

app = Flask(__name__, template_folder='templates')
app.secret_key = secrets.token_hex(32)
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

# ---------- وضعیت گلوبال قیمت‌ها ----------
current_prices = {'categorized': {}}

# ---------- لاگ درخواست‌های API (برای Rate Limiting) ----------
# ساختار: {api_key: [timestamps]}
api_requests_log = defaultdict(list)

# ============================================================
#  بخش ۴: توابع پایگاه داده
# ============================================================

def get_db():
    """
    دریافت کانکشن پایگاه داده
    برای هر درخواست یک کانکشن ساخته و در g ذخیره می‌شود
    """
    if 'db' not in g:
        g.db = sqlite3.connect(DATABASE)
        if DB_PASSWORD:
            g.db.execute(f"PRAGMA key = '{DB_PASSWORD}'")
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(error):
    """
    بستن کانکشن پایگاه داده در پایان هر درخواست
    """
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db():
    """
    ساخت اولیه تمام جداول پایگاه داده
    در صورت عدم وجود، جداول را ایجاد می‌کند
    """
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    db = conn

    # ---------- جدول کاربران ----------
    db.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP,
            is_active BOOLEAN DEFAULT 1
        )
    ''')

    # ---------- جدول دارایی‌ها ----------
    db.execute('''
        CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            title TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, symbol)
        )
    ''')

    # ---------- جدول تراکنش‌ها ----------
    db.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            transaction_id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            quantity REAL NOT NULL,
            price_per_unit REAL,
            category TEXT,
            comment TEXT,
            date TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (asset_id) REFERENCES assets(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    # ---------- جدول داده‌های نمودار ----------
    db.execute('''
        CREATE TABLE IF NOT EXISTS chart_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date DATE NOT NULL,
            total_value REAL NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, date)
        )
    ''')

    # ---------- جدول تحلیل ارزش ----------
    db.execute('''
        CREATE TABLE IF NOT EXISTS value_analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date DATE NOT NULL,
            total_value_toman REAL,
            usd_price REAL,
            gold_price_per_gram REAL,
            equivalent_usd REAL,
            equivalent_gold_grams REAL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, date)
        )
    ''')

    # ---------- جدول سود روزانه ----------
    db.execute('''
        CREATE TABLE IF NOT EXISTS daily_profit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date DATE NOT NULL,
            total_value REAL,
            total_profit REAL,
            profit_percent REAL,
            daily_change REAL,
            daily_change_percent REAL,
            yesterday_value REAL,
            asset_count INTEGER,
            timestamp TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, date)
        )
    ''')

    # ---------- جدول واچ‌لیست ----------
    db.execute('''
        CREATE TABLE IF NOT EXISTS watchlist (
            user_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            category TEXT,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, symbol),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    # ---------- جدول اهداف سرمایه‌گذاری ----------
    db.execute('''
        CREATE TABLE IF NOT EXISTS investment_goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            goal_type TEXT NOT NULL,
            target_amount REAL NOT NULL,
            days INTEGER,
            start_date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id)
        )
    ''')

    # ---------- جدول نشست‌های کاربری ----------
    db.execute('''
        CREATE TABLE IF NOT EXISTS user_sessions (
            session_token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    # ---------- جدول کلیدهای API کاربران ----------
    db.execute('''
        CREATE TABLE IF NOT EXISTS user_api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            api_key TEXT UNIQUE NOT NULL,
            is_active BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    # ---------- جدول لاگ درخواست‌های API ----------
    db.execute('''
        CREATE TABLE IF NOT EXISTS api_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            api_key TEXT,
            endpoint TEXT,
            date DATE DEFAULT CURRENT_DATE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.commit()
    conn.close()
    print("✅ Database initialized successfully")


# ============================================================
#  بخش ۵: توابع کمکی (Helpers)
# ============================================================

def read_json_file(file_path):
    """
    خواندن فایل JSON
    در صورت عدم وجود فایل یا خطا در پارس، مقدار پیش‌فرض برمی‌گرداند
    """
    if not os.path.exists(file_path):
        return [] if file_path == TSETMC_FILE else {}
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError:
        return [] if file_path == TSETMC_FILE else {}


def write_json_file(file_path, data):
    """
    نوشتن داده در فایل JSON
    """
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)


def hash_password(password):
    """
    هش کردن رمز عبور با SHA256 و Salt ثابت
    """
    salt = "assetly_salt_2024"
    return hashlib.sha256((password + salt).encode()).hexdigest()


def verify_password(password, password_hash):
    """
    بررسی تطابق رمز عبور با هش ذخیره شده
    """
    return hash_password(password) == password_hash


def generate_session_token():
    """
    تولید توکن نشست تصادفی
    """
    return secrets.token_hex(32)


# ============================================================
#  بخش ۶: دکوراتورها و توابع احراز هویت
# ============================================================

def login_required(f):
    """
    دکوراتور بررسی احراز هویت
    ابتدا session و سپس Authorization Header را چک می‌کند
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # بررسی session مرورگر
        if 'user_id' in session:
            return f(*args, **kwargs)

        # بررسی توکن در Header
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header[7:]
            db = get_db()
            session_row = db.execute(
                'SELECT user_id FROM user_sessions WHERE session_token = ? AND expires_at > ?',
                (token, datetime.now().isoformat())
            ).fetchone()

            if session_row:
                session['user_id'] = session_row['user_id']
                return f(*args, **kwargs)

        return jsonify({'error': 'لطفاً وارد شوید', 'require_auth': True}), 401

    return decorated_function


def get_current_user():
    """
    دریافت اطلاعات کاربر فعلی از session
    """
    user_id = session.get('user_id')
    if not user_id:
        return None
    db = get_db()
    return db.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()


# ============================================================
#  بخش ۷: توابع Rate Limiting
# ============================================================

def check_rate_limit(api_key):
    """
    بررسی محدودیت نرخ درخواست‌های API

    محدودیت‌ها:
    - ۳ درخواست در دقیقه
    - ۳۰ درخواست در ساعت
    - ۱۰۰ درخواست در روز

    Returns:
        (is_allowed, error_message)
    """
    now = time.time()
    requests = api_requests_log[api_key]

    # حذف درخواست‌های قدیمی‌تر از ۲۴ ساعت
    requests = [t for t in requests if now - t < 86400]
    api_requests_log[api_key] = requests

    # بررسی محدودیت ۱ دقیقه
    last_minute = [t for t in requests if now - t < 60]
    if len(last_minute) >= 3:
        return False, "محدودیت ۳ درخواست در دقیقه. لطفاً صبر کنید."

    # بررسی محدودیت ۱ ساعت
    last_hour = [t for t in requests if now - t < 3600]
    if len(last_hour) >= 30:
        return False, "محدودیت ۳۰ درخواست در ساعت. لطفاً بعداً تلاش کنید."

    # بررسی محدودیت ۲۴ ساعت
    if len(requests) >= 100:
        return False, "محدودیت ۱۰۰ درخواست در روز. فردا دوباره تلاش کنید."

    # ثبت درخواست جدید
    api_requests_log[api_key].append(now)
    return True, None


def get_rate_limit_status(api_key):
    """
    دریافت وضعیت فعلی محدودیت‌های یک کلید API
    """
    now = time.time()
    requests = api_requests_log.get(api_key, [])
    requests = [t for t in requests if now - t < 86400]

    return {
        'minute': {
            'limit': 3,
            'used': len([t for t in requests if now - t < 60]),
            'remaining': 3 - len([t for t in requests if now - t < 60])
        },
        'hour': {
            'limit': 30,
            'used': len([t for t in requests if now - t < 3600]),
            'remaining': 30 - len([t for t in requests if now - t < 3600])
        },
        'day': {
            'limit': 100,
            'used': len(requests),
            'remaining': 100 - len(requests)
        }
    }


# ============================================================
#  بخش ۸: توابع دریافت قیمت‌ها
# ============================================================

def fetch_tsetmc_data():
    """
    دریافت داده‌های بورس تهران از API

    قیمت‌ها را اصلاح (حذف رقم آخر) و پردازش می‌کند
    Returns:
        لیست نمادهای بورس یا None در صورت خطا
    """
    try:
        print("📈 Fetching TSE data...")
        response = requests.get(API_TSETMC, headers=API_HEADERS, timeout=30)

        if response.status_code != 200:
            print(f"❌ خطای API بورس: {response.status_code}")
            return None

        data = response.json()
        processed_data = []

        for item in data:
            if 'l18' not in item or 'pl' not in item:
                continue

            symbol_name = item.get('l18', '').strip()
            company_name = item.get('l30', symbol_name).strip()
            raw_price = item.get('pl', 0)
            raw_change = item.get('plc', 0)

            try:
                change_percent = float(item.get('plp', 0)) if item.get('plp') else 0
            except (ValueError, TypeError):
                change_percent = 0

            # اصلاح قیمت: حذف رقم آخر
            if raw_price and str(raw_price).replace('-', '').replace('.', '').isdigit():
                price_str = str(abs(int(float(raw_price))))
                adjusted_price = int(price_str[:-1]) if len(price_str) > 1 else 0
                if float(raw_price) < 0:
                    adjusted_price = -adjusted_price
            else:
                adjusted_price = 0

            # اصلاح مقدار تغییر
            if raw_change and str(raw_change).replace('-', '').replace('.', '').isdigit():
                change_str = str(abs(int(float(raw_change))))
                adjusted_change = int(change_str[:-1]) if len(change_str) > 1 else 0
                if float(raw_change) < 0:
                    adjusted_change = -adjusted_change
            else:
                adjusted_change = 0

            processed_data.append({
                'symbol': symbol_name,
                'title': company_name,
                'name': company_name,
                'price': adjusted_price,
                'toman_price': adjusted_price,
                'change_value': adjusted_change,
                'change_percent': change_percent,
                'last_update': datetime.now().strftime('%Y-%m-%d %H:%M')
            })

        processed_data.sort(key=lambda x: x['symbol'])
        print(f"✅ TSE data processed: {len(processed_data)} symbols")
        return processed_data

    except Exception as e:
        print(f"❌ خطا در پردازش داده‌های بورس: {e}")
        return None


def update_tsetmc_prices():
    """
    بروزرسانی قیمت‌های بورس در کش
    در صورت خطا از داده‌های ذخیره شده قبلی استفاده می‌کند
    """
    global current_prices

    try:
        new_data = fetch_tsetmc_data()

        if new_data:
            if 'categorized' not in current_prices:
                current_prices['categorized'] = {}
            current_prices['categorized']['stock'] = new_data

            # ثبت تک‌تک نمادهای بورس در current_prices
            for item in new_data:
                current_prices[item['symbol']] = item['toman_price']

            # ذخیره در فایل کش
            write_json_file(TSETMC_FILE, new_data)

            # بروزرسانی فایل اصلی قیمت‌ها
            prices = read_json_file(PRICES_FILE)
            if prices:
                prices['stock'] = new_data
                write_json_file(PRICES_FILE, prices)

            print(f"✅ Stock prices updated: {len(new_data)} symbol")
            return True
        else:
            # استفاده از داده‌های کش شده
            cached_data = read_json_file(TSETMC_FILE)
            if cached_data:
                if 'categorized' not in current_prices:
                    current_prices['categorized'] = {}
                current_prices['categorized']['stock'] = cached_data

                # برای کش هم نمادها رو ثبت کن
                for item in cached_data:
                    current_prices[item['symbol']] = item['toman_price']

                print(f"⚠️ Using cached stock data: {len(cached_data)} symbol")
            return False

    except Exception as e:
        print(f"❌ Error updating stock prices: {e}")
        return False
def fetch_prices():
    """
    دریافت قیمت‌های لحظه‌ای از API اصلی

    قیمت‌های طلا، ارز و رمزارز را دریافت و پردازش می‌کند
    در صورت وجود کش معتبر، از آن استفاده می‌کند
    """
    global current_prices

    # بررسی اعتبار کش
    last_updated = current_prices.get('last_updated')
    if last_updated:
        try:
            last_time = datetime.fromisoformat(last_updated)
            elapsed_minutes = (datetime.now(timezone.utc) - last_time).total_seconds() / 60
            if elapsed_minutes < PRICE_CACHE_MINUTES:
                print(f"🔄 Using price cache ({(PRICE_CACHE_MINUTES - elapsed_minutes):.1f} minutes until update)")
                return
        except Exception:
            pass

    try:
        print("📡 Fetching prices from API...")
        response = requests.get(API_GOLD_CURRENCY, headers=API_HEADERS, timeout=15)

        if response.status_code != 200:
            print(f"⚠️ خطای API اصلی: {response.status_code}")
            load_cached_prices()
            return

        data = response.json()
        processed_prices = {"gold_coin": [], "currency": [], "crypto": []}

        # ---------- پیدا کردن قیمت تتر برای تبدیلات ----------
        usdt_price = None
        for item in data.get('currency', []):
            if item['symbol'] == 'USDT_IRT':
                usdt_price = float(item['price'])
                break

        if not usdt_price:
            usdt_price = current_prices.get('USDT', 160000)

        # ---------- پردازش طلا و سکه ----------
        for item in data.get('gold', []):
            if item['symbol'] not in ASSET_TYPES['gold_coin']:
                continue

            try:
                price = float(item['price'])
                if item['symbol'] == 'XAUUSD' or item.get('unit') == 'دلار':
                    price_in_toman = price * usdt_price
                    usd_price_val = price
                else:
                    price_in_toman = price
                    usd_price_val = price / usdt_price

                processed_prices['gold_coin'].append({
                    'symbol': item['symbol'],
                    'title': item['name'],
                    'price': price_in_toman,
                    'toman_price': price_in_toman,
                    'usd_price': usd_price_val,
                    'last_update': f"{item.get('date', '')} {item.get('time', '')}".strip(),
                    'change_value': item.get('change_value'),
                    'change_percent': item.get('change_percent')
                })
                current_prices[item['symbol']] = price_in_toman
            except Exception as e:
                print(f"⚠️ Error processing gold {item['symbol']}: {e}")

        # ---------- پردازش ارزها ----------
        for item in data.get('currency', []):
            if item['symbol'] not in ASSET_TYPES['currency']:
                continue

            try:
                price = float(item['price'])
                processed_prices['currency'].append({
                    'symbol': item['symbol'],
                    'title': item['name'],
                    'price': price,
                    'toman_price': price,
                    'usd_price': price / usdt_price if item['symbol'] != 'USDT_IRT' else 1.0,
                    'last_update': f"{item.get('date', '')} {item.get('time', '')}".strip(),
                    'change_value': item.get('change_value'),
                    'change_percent': item.get('change_percent')
                })
                current_prices[item['symbol']] = price

                # ذخیره قیمت‌های کلیدی
                if item['symbol'] == 'USD':
                    current_prices['USD'] = price
                elif item['symbol'] == 'USDT_IRT':
                    current_prices['usdt_price'] = price
            except Exception as e:
                print(f"⚠️ Error processing currency {item['symbol']}: {e}")

        # ---------- پردازش رمزارزها ----------
        for item in data.get('cryptocurrency', []):
            if item['symbol'] not in ASSET_TYPES['crypto']:
                continue

            try:
                price_str = str(item['price']).replace(',', '')
                price = float(price_str)
                price_in_toman = price * usdt_price

                processed_prices['crypto'].append({
                    'symbol': item['symbol'],
                    'title': item['name'],
                    'price': price_in_toman,
                    'toman_price': price_in_toman,
                    'usd_price': price,
                    'last_update': f"{item.get('date', '')} {item.get('time', '')}".strip(),
                    'change_percent': item.get('change_percent')
                })
                current_prices[item['symbol']] = price_in_toman
            except Exception as e:
                print(f"⚠️ Error processing crypto {item['symbol']}: {e}")

        # ---------- مرتب‌سازی و ذخیره ----------
        for category in processed_prices:
            processed_prices[category].sort(key=lambda x: x['symbol'])

        # اضافه کردن داده‌های بورس
        if 'stock' in current_prices.get('categorized', {}):
            processed_prices['stock'] = current_prices['categorized']['stock']
        else:
            stock_data = read_json_file(TSETMC_FILE)
            if stock_data:
                processed_prices['stock'] = stock_data

        current_prices['categorized'] = processed_prices
        current_prices['last_updated'] = datetime.now(timezone.utc).isoformat()
        current_prices.pop('api_error', None)

        write_json_file(PRICES_FILE, processed_prices)
        print(f"✅ Prices were successfully updated.")

    except Exception as e:
        print(f"❌ خطا در دریافت قیمت‌ها: {e}")
        load_cached_prices()


def load_cached_prices():
    """
    لود قیمت‌ها از فایل کش در صورت خطا در API
    """
    global current_prices

    try:
        cached = read_json_file(PRICES_FILE)
        if cached:
            current_prices['categorized'] = cached
            current_prices['last_updated'] = datetime.now(timezone.utc).isoformat()
            current_prices['api_error'] = "Using cached prices"

            for category_data in cached.values():
                if isinstance(category_data, list):
                    for item in category_data:
                        current_prices[item['symbol']] = item.get('toman_price', item.get('price', 0))

            print("⚠️ Cached prices loaded")
    except Exception as e:
        print(f"❌ Error loading price cache: {e}")

# ============================================================
#  بخش ۹: توابع محاسبات پورتفوی
# ============================================================

def aggregate_assets(user_id):
    """
    محاسبه اطلاعات تجمیعی دارایی‌های یک کاربر

    تمام تراکنش‌ها را پردازش کرده و موجودی، قیمت سر به سر،
    ارزش فعلی و سود/زیان هر دارایی را محاسبه می‌کند
    """
    db = get_db()

    assets = db.execute(
        'SELECT * FROM assets WHERE user_id = ? ORDER BY symbol',
        (user_id,)
    ).fetchall()

    aggregated = []

    for asset in assets:
        transactions = db.execute(
            'SELECT * FROM transactions WHERE asset_id = ? ORDER BY date',
            (asset['id'],)
        ).fetchall()

        # متغیرهای محاسباتی با decimal برای دقت بالا
        total_quantity = decimal.Decimal('0')
        total_cost = decimal.Decimal('0')
        buy_quantity_sum = decimal.Decimal('0')
        buy_cost_sum = decimal.Decimal('0')

        processed_transactions = []

        for tx in transactions:
            tx_type = tx['type']
            tx_quantity = decimal.Decimal(str(tx['quantity']))

            if tx_type in ['buy', 'sell', 'save_profit']:
                tx_price = decimal.Decimal(str(tx['price_per_unit']))
                tx_cost = tx_quantity * tx_price
            else:
                tx_price = decimal.Decimal('0')
                tx_cost = decimal.Decimal('0')

            # ---------- محاسبه تأثیر هر نوع تراکنش ----------
            if tx_type == 'buy':
                total_quantity += tx_quantity
                total_cost += tx_cost
                buy_quantity_sum += tx_quantity
                buy_cost_sum += tx_cost
            elif tx_type == 'sell':
                if buy_quantity_sum > 0:
                    cost_basis_reduction = (tx_quantity / buy_quantity_sum) * buy_cost_sum
                    buy_cost_sum -= cost_basis_reduction
                buy_quantity_sum -= tx_quantity
                total_quantity -= tx_quantity
                total_cost -= tx_cost
            elif tx_type == 'save_profit':
                if buy_quantity_sum > 0:
                    cost_basis_reduction = (tx_quantity / buy_quantity_sum) * buy_cost_sum
                    buy_cost_sum -= cost_basis_reduction
                buy_quantity_sum -= tx_quantity
                total_quantity -= tx_quantity
                total_cost -= tx_cost
            elif tx_type in ('deposit', 'withdrawal'):
                if asset['symbol'] == RIAL_WALLET_SYMBOL:
                    if tx_type == 'deposit':
                        total_quantity += tx_quantity
                    else:
                        total_quantity -= tx_quantity

            processed_transactions.append({
                'transaction_id': tx['transaction_id'],
                'date': tx['date'],
                'type': tx['type'],
                'quantity': str(tx_quantity),
                'price_per_unit': str(tx_price) if tx_type in ['buy', 'sell', 'save_profit'] else None,
                'category': tx['category'],
                'comment': tx['comment']
            })

        # ---------- محاسبه قیمت فعلی و سر به سر ----------
        current_price = decimal.Decimal(str(current_prices.get(asset['symbol'], 0)))

        break_even_price = decimal.Decimal('0')
        if buy_quantity_sum > 0:
            break_even_price = buy_cost_sum / buy_quantity_sum

        current_value = total_quantity * current_price

        # ---------- محاسبه سود/زیان ----------
        if asset['symbol'] != RIAL_WALLET_SYMBOL:
            cost_basis = buy_cost_sum
            profit_loss = current_value - cost_basis
            return_pct = (profit_loss / cost_basis) * 100 if cost_basis > 0 else 0
        else:
            cost_basis = total_quantity
            profit_loss = decimal.Decimal('0')
            return_pct = 0

        aggregated.append({
            'id': asset['id'],
            'symbol': asset['symbol'],
            'title': asset['title'],
            'type': ALL_SYMBOLS.get(asset['symbol'], 'wallet') if asset['symbol'] != RIAL_WALLET_SYMBOL else 'wallet',
            'current_price': str(current_price),
            'total_quantity': str(total_quantity),
            'cost_basis': str(cost_basis),
            'break_even_price': str(break_even_price),
            'current_value': str(current_value),
            'profit_loss': str(profit_loss),
            'return_pct': str(return_pct),
            'transactions': processed_transactions
        })

    return aggregated


def calculate_total_value(user_id):
    """
    محاسبه ارزش کل پورتفوی یک کاربر (شامل کیف پول ریالی)
    """
    aggregated = aggregate_assets(user_id)
    total = decimal.Decimal('0')
    for asset in aggregated:
        if asset['symbol'] != RIAL_WALLET_SYMBOL:
            total += decimal.Decimal(asset['current_value'])
        else:
            total += decimal.Decimal(asset['total_quantity'])
    return float(total)


# ============================================================
#  بخش ۱۰: توابع بروزرسانی - تک‌کاربره
# ============================================================

def update_chart_data_for_user(user_id):
    """
    بروزرسانی داده‌های نمودار برای یک کاربر
    ارزش کل امروز را در جدول chart_data ذخیره می‌کند
    """
    try:
        db = get_db()
        today = datetime.now().strftime('%Y-%m-%d')
        total_value = calculate_total_value(user_id)

        db.execute('''
            INSERT OR REPLACE INTO chart_data (user_id, date, total_value)
            VALUES (?, ?, ?)
        ''', (user_id, today, total_value))
        db.commit()
        return True
    except Exception as e:
        print(f"❌ خطا در بروزرسانی نمودار کاربر {user_id}: {e}")
        return False


def update_value_analysis_for_user(user_id):
    """
    بروزرسانی تحلیل ارزش برای یک کاربر
    معادل دلاری و طلایی پورتفوی را محاسبه می‌کند
    """
    usd_price = current_prices.get('USD', 0)
    gold_price = None

    for item in current_prices.get('categorized', {}).get('gold_coin', []):
        if item.get('symbol') == 'IR_GOLD_18K':
            gold_price = item.get('toman_price', item.get('price', 0))
            break

    if not gold_price:
        gold_price = current_prices.get('GOL18', 0)

    if usd_price <= 0 or not gold_price or gold_price <= 0:
        return False

    try:
        db = get_db()
        today = datetime.now().strftime('%Y-%m-%d')
        total_value = decimal.Decimal(str(calculate_total_value(user_id)))

        total_usd = float(total_value) / float(usd_price)
        total_gold = float(total_value) / float(gold_price)

        db.execute('''
            INSERT OR REPLACE INTO value_analysis
            (user_id, date, total_value_toman, usd_price, gold_price_per_gram,
             equivalent_usd, equivalent_gold_grams)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, today, float(total_value), float(usd_price), float(gold_price),
              total_usd, total_gold))
        db.commit()
        return True
    except Exception as e:
        print(f"❌ خطا در بروزرسانی تحلیل ارزش کاربر {user_id}: {e}")
        return False


def calculate_daily_profit_for_user(user_id):
    """
    محاسبه سود/زیان روزانه برای یک کاربر
    تغییرات نسبت به دیروز را محاسبه و ذخیره می‌کند
    """
    try:
        db = get_db()
        today = datetime.now().strftime('%Y-%m-%d')
        yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')

        aggregated = aggregate_assets(user_id)

        total_value = decimal.Decimal('0')
        total_cost_basis = decimal.Decimal('0')

        for asset in aggregated:
            if asset['symbol'] != RIAL_WALLET_SYMBOL:
                total_value += decimal.Decimal(asset['current_value'])
                total_cost_basis += decimal.Decimal(asset['cost_basis'])
            else:
                total_value += decimal.Decimal(asset['total_quantity'])

        # محاسبه تغییر نسبت به دیروز
        yesterday_row = db.execute(
            'SELECT total_value FROM daily_profit WHERE user_id = ? AND date = ?',
            (user_id, yesterday)
        ).fetchone()

        if yesterday_row:
            yesterday_value = decimal.Decimal(str(yesterday_row['total_value']))
            daily_change = total_value - yesterday_value
            daily_change_percent = (daily_change / yesterday_value) * 100 if yesterday_value > 0 else 0
        else:
            daily_change = decimal.Decimal('0')
            daily_change_percent = 0
            yesterday_value = None

        # محاسبه سود کل
        total_profit = decimal.Decimal('0')
        for asset in aggregated:
            if asset['symbol'] != RIAL_WALLET_SYMBOL:
                total_profit += decimal.Decimal(asset['profit_loss'])

        total_profit_percent = (total_profit / total_cost_basis * 100) if total_cost_basis > 0 else 0
        asset_count = len([a for a in aggregated if decimal.Decimal(a['total_quantity']) > 0])

        db.execute('''
            INSERT OR REPLACE INTO daily_profit
            (user_id, date, total_value, total_profit, profit_percent, daily_change,
             daily_change_percent, yesterday_value, asset_count, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id, today, float(total_value), float(total_profit),
            float(total_profit_percent), float(daily_change),
            float(daily_change_percent),
            float(yesterday_value) if yesterday_value else None,
            asset_count, datetime.now().isoformat()
        ))
        db.commit()
        return True
    except Exception as e:
        print(f"❌ خطا در محاسبه سود روزانه کاربر {user_id}: {e}")
        return False


# ============================================================
#  بخش ۱۱: توابع بروزرسانی - همه کاربران
# ============================================================

def update_chart_data_for_all_users():
    """
    بروزرسانی داده‌های نمودار برای تمام کاربران
    """
    print("📊 Updating chart data for all users...")
    db = get_db()
    users = db.execute('SELECT id FROM users').fetchall()

    success = 0
    for user in users:
        if update_chart_data_for_user(user['id']):
            success += 1

    print(f"✅ Charts updated for {success} out of {len(users)} users")


def update_value_analysis_for_all_users():
    """
    بروزرسانی تحلیل ارزش برای تمام کاربران
    """
    print("📈 Updating value analysis for all users...")
    db = get_db()
    users = db.execute('SELECT id FROM users').fetchall()

    success = 0
    for user in users:
        if update_value_analysis_for_user(user['id']):
            success += 1

    print(f"✅ Value analysis updated for {success} out of {len(users)} users")


def calculate_daily_profit_for_all_users():
    """
    محاسبه سود روزانه برای تمام کاربران
    """
    print("💰 Calculating daily profit for all users...")
    db = get_db()
    users = db.execute('SELECT id FROM users').fetchall()

    success = 0
    for user in users:
        if calculate_daily_profit_for_user(user['id']):
            success += 1

    print(f"✅ Daily profit calculated for {success} out of {len(users)} users")


# ============================================================
#  بخش ۱۲: روت‌های احراز هویت
# ============================================================

@app.route('/api/auth/register', methods=['POST'])
def register():
    """
    ثبت‌نام کاربر جدید
    بعد از ثبت‌نام، کیف پول ریالی و توکن نشست ساخته می‌شود
    """
    data = request.json

    # بررسی فیلدهای اجباری
    for field in ['first_name', 'last_name', 'email', 'phone', 'password']:
        if not data.get(field):
            return jsonify({'error': f'فیلد {field} الزامی است'}), 400

    db = get_db()

    # بررسی تکراری نبودن ایمیل یا تلفن
    existing = db.execute(
        'SELECT id FROM users WHERE email = ? OR phone = ?',
        (data['email'], data['phone'])
    ).fetchone()

    if existing:
        return jsonify({'error': 'این مشخصات قبلاً ثبت شده است'}), 400

    # ساخت کاربر
    password_hash = hash_password(data['password'])

    cursor = db.execute('''
        INSERT INTO users (first_name, last_name, email, phone, password_hash)
        VALUES (?, ?, ?, ?, ?)
    ''', (data['first_name'], data['last_name'], data['email'], data['phone'], password_hash))

    user_id = cursor.lastrowid

    # ساخت کیف پول ریالی پیش‌فرض
    db.execute(
        'INSERT INTO assets (id, user_id, symbol, title) VALUES (?, ?, ?, ?)',
        (str(uuid.uuid4()), user_id, RIAL_WALLET_SYMBOL, 'کیف پول ریالی')
    )

    db.commit()

    # تنظیم نشست
    session['user_id'] = user_id
    session.permanent = True

    # ساخت توکن
    token = generate_session_token()
    expires_at = datetime.now() + timedelta(days=30)

    db.execute('''
        INSERT INTO user_sessions (session_token, user_id, expires_at)
        VALUES (?, ?, ?)
    ''', (token, user_id, expires_at.isoformat()))
    db.commit()

    resp = jsonify({
        'success': True,
        'user': {
            'id': user_id,
            'first_name': data['first_name'],
            'last_name': data['last_name'],
            'email': data['email'],
            'phone': data['phone']
        },
        'token': token
    })

    resp.set_cookie('auth_token', token, max_age=30*24*60*60, httponly=True, samesite='Lax')
    return resp


@app.route('/api/auth/login', methods=['POST'])
def login():
    """
    ورود کاربر
    پشتیبانی از ورود با ایمیل یا شماره تلفن
    """
    data = request.json
    identifier = data.get('identifier')
    password = data.get('password')

    if not identifier or not password:
        return jsonify({'error': 'ایمیل/تلفن و رمز عبور الزامی است'}), 400

    db = get_db()
    user = db.execute(
        'SELECT * FROM users WHERE (email = ? OR phone = ?) AND is_active = 1',
        (identifier, identifier)
    ).fetchone()

    if not user or not verify_password(password, user['password_hash']):
        return jsonify({'error': 'اطلاعات وارد شده اشتباه است'}), 401

    # بروزرسانی آخرین ورود
    db.execute('UPDATE users SET last_login = ? WHERE id = ?',
               (datetime.now().isoformat(), user['id']))
    db.commit()

    # تنظیم نشست
    session['user_id'] = user['id']
    session.permanent = True

    # ساخت توکن
    token = generate_session_token()
    expires_at = datetime.now() + timedelta(days=30)

    db.execute('''
        INSERT OR REPLACE INTO user_sessions (session_token, user_id, expires_at)
        VALUES (?, ?, ?)
    ''', (token, user['id'], expires_at.isoformat()))
    db.commit()

    resp = jsonify({
        'success': True,
        'user': {
            'id': user['id'],
            'first_name': user['first_name'],
            'last_name': user['last_name'],
            'email': user['email'],
            'phone': user['phone']
        },
        'token': token
    })

    resp.set_cookie('auth_token', token, max_age=30*24*60*60, httponly=True, samesite='Lax')
    return resp


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """
    خروج کاربر
    توکن نشست را حذف و کوکی را پاک می‌کند
    """
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header[7:]
        db = get_db()
        db.execute('DELETE FROM user_sessions WHERE session_token = ?', (token,))
        db.commit()

    session.pop('user_id', None)
    resp = jsonify({'success': True})
    resp.set_cookie('auth_token', '', max_age=0)
    return resp


@app.route('/api/auth/me', methods=['GET'])
@login_required
def get_me():
    """
    دریافت اطلاعات کاربر فعلی
    """
    user = get_current_user()
    if not user:
        return jsonify({'error': 'کاربر یافت نشد'}), 404

    return jsonify({
        'id': user['id'],
        'first_name': user['first_name'],
        'last_name': user['last_name'],
        'email': user['email'],
        'phone': user['phone']
    })


@app.route('/api/auth/change-password', methods=['POST'])
@login_required
def change_password():
    """
    تغییر رمز عبور کاربر
    """
    user = get_current_user()
    data = request.json

    if not data.get('current_password') or not data.get('new_password'):
        return jsonify({'error': 'رمز عبور فعلی و جدید الزامی است'}), 400

    if not verify_password(data['current_password'], user['password_hash']):
        return jsonify({'error': 'رمز عبور فعلی اشتباه است'}), 401

    db = get_db()
    db.execute('UPDATE users SET password_hash = ? WHERE id = ?',
               (hash_password(data['new_password']), user['id']))
    db.commit()

    return jsonify({'success': True})


@app.route('/api/auth/update-profile', methods=['PUT'])
@login_required
def update_profile():
    """
    بروزرسانی پروفایل کاربر (نام و نام خانوادگی)
    """
    user = get_current_user()
    data = request.json
    db = get_db()

    updates = []
    params = []

    if data.get('first_name'):
        updates.append('first_name = ?')
        params.append(data['first_name'])
    if data.get('last_name'):
        updates.append('last_name = ?')
        params.append(data['last_name'])

    if updates:
        params.append(user['id'])
        db.execute(f'UPDATE users SET {", ".join(updates)} WHERE id = ?', params)
        db.commit()

    return jsonify({'success': True})


# ============================================================
#  بخش ۱۳: روت‌های داده‌ها (Assets, Prices, Charts)
# ============================================================

@app.route('/api/assets', methods=['GET'])
@login_required
def get_assets():
    """
    دریافت لیست دارایی‌های کاربر با محاسبات تجمیعی
    """
    user = get_current_user()
    if not current_prices.get('categorized'):
        fetch_prices()
    return jsonify(aggregate_assets(user['id']))


@app.route('/api/prices', methods=['GET'])
def get_prices():
    """
    دریافت قیمت‌های لحظه‌ای تمام بازارها (عمومی)
    """
    if not current_prices.get('categorized'):
        fetch_prices()

    result = current_prices.get('categorized', {})
    if 'api_error' in current_prices:
        result['api_error'] = current_prices['api_error']
    if 'last_updated' in current_prices:
        result['last_updated'] = current_prices['last_updated']

    return jsonify(result)


@app.route('/api/chart-data', methods=['GET'])
@login_required
def get_chart_data():
    """
    دریافت داده‌های نمودار ارزش پورتفوی در طول زمان
    """
    user = get_current_user()
    db = get_db()

    rows = db.execute(
        'SELECT date, total_value FROM chart_data WHERE user_id = ? ORDER BY date',
        (user['id'],)
    ).fetchall()

    return jsonify({row['date']: row['total_value'] for row in rows})


# ============================================================
#  بخش ۱۴: روت‌های تحلیل و گزارش
# ============================================================

@app.route('/api/value-analysis', methods=['GET'])
@login_required
def get_value_analysis():
    """
    دریافت تحلیل ارزش پورتفوی (معادل دلاری و طلایی)
    شامل تغییرات نسبت به روز قبل
    """
    user = get_current_user()
    db = get_db()

    rows = db.execute('''
        SELECT * FROM value_analysis
        WHERE user_id = ?
        ORDER BY date DESC
        LIMIT 2
    ''', (user['id'],)).fetchall()

    if not rows:
        return jsonify({})

    latest = dict(rows[0])

    if len(rows) > 1:
        previous = dict(rows[1])
        latest['usd_change'] = round(latest['equivalent_usd'] - previous['equivalent_usd'], 2)
        latest['gold_change'] = round(latest['equivalent_gold_grams'] - previous['equivalent_gold_grams'], 3)
        latest['usd_change_percent'] = round(
            (latest['usd_change'] / previous['equivalent_usd'] * 100) if previous['equivalent_usd'] > 0 else 0, 2
        )
        latest['gold_change_percent'] = round(
            (latest['gold_change'] / previous['equivalent_gold_grams'] * 100) if previous['equivalent_gold_grams'] > 0 else 0, 2
        )
    else:
        latest['usd_change'] = 0
        latest['gold_change'] = 0
        latest['usd_change_percent'] = 0
        latest['gold_change_percent'] = 0

    return jsonify(latest)


@app.route('/api/comparison-data', methods=['GET'])
@login_required
def get_comparison_data():
    """
    دریافت تاریخچه کامل تحلیل ارزش
    """
    user = get_current_user()
    db = get_db()

    rows = db.execute(
        'SELECT * FROM value_analysis WHERE user_id = ? ORDER BY date',
        (user['id'],)
    ).fetchall()

    return jsonify([dict(row) for row in rows])


@app.route('/api/today-profit', methods=['GET'])
@login_required
def get_today_profit():
    """
    دریافت سود/زیان امروز
    اگر محاسبه نشده باشد، به‌صورت خودکار محاسبه می‌کند
    """
    user = get_current_user()
    db = get_db()
    today = datetime.now().strftime('%Y-%m-%d')

    row = db.execute(
        'SELECT * FROM daily_profit WHERE user_id = ? AND date = ?',
        (user['id'], today)
    ).fetchone()

    if not row:
        calculate_daily_profit_for_user(user['id'])
        row = db.execute(
            'SELECT * FROM daily_profit WHERE user_id = ? AND date = ?',
            (user['id'], today)
        ).fetchone()

    return jsonify(dict(row) if row else {'error': 'No data'})


@app.route('/api/daily-profit', methods=['GET'])
@login_required
def get_daily_profit_history():
    """
    دریافت تاریخچه سود روزانه
    """
    user = get_current_user()
    db = get_db()

    rows = db.execute(
        'SELECT * FROM daily_profit WHERE user_id = ? ORDER BY date',
        (user['id'],)
    ).fetchall()

    return jsonify([dict(row) for row in rows])


# ============================================================
#  بخش ۱۵: روت‌های تراکنش‌ها
# ============================================================

@app.route('/api/transactions', methods=['POST'])
@login_required
def add_transaction():
    """
    ثبت تراکنش جدید

    برای خرید، موجودی کیف پول ریالی بررسی می‌شود
    برای فروش و سیو سود، موجودی دارایی بررسی می‌شود
    تراکنش‌های buy/sell/save_profit به‌صورت خودکار
    تراکنش متناظر در کیف پول ایجاد می‌کنند
    """
    user = get_current_user()
    data = request.json
    db = get_db()

    if not all(field in data for field in ['symbol', 'type', 'quantity']):
        return jsonify({'error': 'Missing required fields'}), 400

    tx_type = data['type']
    symbol = data['symbol']
    quantity = data['quantity']

    if tx_type in ['buy', 'sell', 'save_profit'] and 'price_per_unit' not in data:
        return jsonify({'error': 'price_per_unit is required'}), 400

    # ---------- بررسی موجودی کیف پول برای خرید ----------
    if tx_type == 'buy' and symbol != RIAL_WALLET_SYMBOL:
        rial_asset = db.execute(
            'SELECT * FROM assets WHERE user_id = ? AND symbol = ?',
            (user['id'], RIAL_WALLET_SYMBOL)
        ).fetchone()

        if rial_asset:
            rial_transactions = db.execute(
                'SELECT type, quantity FROM transactions WHERE asset_id = ?',
                (rial_asset['id'],)
            ).fetchall()

            wallet_balance = sum(
                decimal.Decimal(str(tx['quantity'])) if tx['type'] == 'deposit'
                else -decimal.Decimal(str(tx['quantity']))
                for tx in rial_transactions
            )

            total_cost = decimal.Decimal(str(quantity)) * decimal.Decimal(str(data['price_per_unit']))

            if total_cost > wallet_balance:
                return jsonify({
                    'error': f'موجودی کیف پول کافی نیست. موجودی: {wallet_balance:,.0f} تومان'
                }), 400

    # ---------- پیدا کردن یا ساخت دارایی ----------
    asset = db.execute(
        'SELECT * FROM assets WHERE user_id = ? AND symbol = ?',
        (user['id'], symbol)
    ).fetchone()

    # اگر دارایی وجود نداره و نوع تراکنش فروش یا سیو سود باشه = ارور
    if not asset and tx_type in ['sell', 'save_profit'] and symbol != RIAL_WALLET_SYMBOL:
        return jsonify({
            'error': f'شما مالک "{symbol}" نیستید. ابتدا باید این دارایی را خریداری کنید.'
        }), 400

    if not asset:
        asset_id = str(uuid.uuid4())
        asset_title = symbol

        for category_items in current_prices.get('categorized', {}).values():
            if isinstance(category_items, list):
                for item in category_items:
                    if item.get('symbol') == symbol:
                        asset_title = item.get('title') or item.get('name') or symbol
                        break

        db.execute(
            'INSERT INTO assets (id, user_id, symbol, title) VALUES (?, ?, ?, ?)',
            (asset_id, user['id'], symbol, asset_title)
        )
    else:
        asset_id = asset['id']

    # ============================================================
    # 🔥 بررسی موجودی دارایی برای فروش و سیو سود
    # ============================================================
    if tx_type in ['sell', 'save_profit'] and symbol != RIAL_WALLET_SYMBOL:
        # محاسبه موجودی فعلی از روی تمام تراکنش‌های قبلی این دارایی
        txs = db.execute(
            'SELECT type, quantity FROM transactions WHERE asset_id = ? ORDER BY date',
            (asset_id,)
        ).fetchall()

        current_holding = decimal.Decimal('0')
        for tx in txs:
            qty = decimal.Decimal(str(tx['quantity']))
            if tx['type'] == 'buy':
                current_holding += qty
            elif tx['type'] in ['sell', 'save_profit']:
                current_holding -= qty

        requested_qty = decimal.Decimal(str(quantity))

        if requested_qty > current_holding:
            return jsonify({
                'error': (
                    f'موجودی شما کافی نیست!\n'
                    f'موجودی فعلی {symbol}: {float(current_holding):.8f}\n'
                    f'مقدار درخواستی: {float(requested_qty):.8f}'
                )
            }), 400

    # ---------- ثبت تراکنش اصلی ----------
    transaction_id = str(uuid.uuid4())
    db.execute('''
        INSERT INTO transactions
        (transaction_id, asset_id, user_id, type, quantity, price_per_unit, category, comment, date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        transaction_id, asset_id, user['id'],
        tx_type, float(quantity),
        float(data['price_per_unit']) if tx_type in ['buy', 'sell', 'save_profit'] else None,
        data.get('category', ''),
        data.get('comment', ''),
        data.get('date', datetime.now().isoformat())
    ))

    # ---------- تراکنش خودکار کیف پول ----------
    rial_asset = db.execute(
        'SELECT * FROM assets WHERE user_id = ? AND symbol = ?',
        (user['id'], RIAL_WALLET_SYMBOL)
    ).fetchone()

    if rial_asset:
        tx_amount = float(quantity) * float(data.get('price_per_unit', 0))

        if tx_type == 'buy' and symbol != RIAL_WALLET_SYMBOL:
            db.execute('''
                INSERT INTO transactions
                (transaction_id, asset_id, user_id, type, quantity, price_per_unit, category, comment, date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                str(uuid.uuid4()), rial_asset['id'], user['id'],
                'withdrawal', tx_amount, 1,
                data.get('category', 'خرید دارایی'),
                f"خرید {quantity} {symbol}",
                data.get('date', datetime.now().isoformat())
            ))
        elif tx_type == 'sell' and symbol != RIAL_WALLET_SYMBOL:
            db.execute('''
                INSERT INTO transactions
                (transaction_id, asset_id, user_id, type, quantity, price_per_unit, category, comment, date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                str(uuid.uuid4()), rial_asset['id'], user['id'],
                'deposit', tx_amount, 1,
                data.get('category', 'فروش دارایی'),
                f"فروش {quantity} {symbol}",
                data.get('date', datetime.now().isoformat())
            ))
        elif tx_type == 'save_profit' and symbol != RIAL_WALLET_SYMBOL:
            db.execute('''
                INSERT INTO transactions
                (transaction_id, asset_id, user_id, type, quantity, price_per_unit, category, comment, date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                str(uuid.uuid4()), rial_asset['id'], user['id'],
                'deposit', tx_amount, 1,
                data.get('category', 'سود سیو شده'),
                f"انتقال سود از {symbol}",
                data.get('date', datetime.now().isoformat())
            ))

    db.commit()

    # بروزرسانی همه تحلیل‌ها
    update_chart_data_for_user(user['id'])
    update_value_analysis_for_user(user['id'])
    calculate_daily_profit_for_user(user['id'])

    return jsonify({'success': True, 'transaction_id': transaction_id})

@app.route('/api/transactions/<transaction_id>', methods=['PUT'])
@login_required
def update_transaction(transaction_id):
    """
    ویرایش یک تراکنش موجود
    فقط فیلدهای quantity, price_per_unit, category, comment, date قابل ویرایش هستند
    """
    user = get_current_user()
    data = request.json
    db = get_db()

    tx = db.execute(
        'SELECT * FROM transactions WHERE transaction_id = ? AND user_id = ?',
        (transaction_id, user['id'])
    ).fetchone()

    if not tx:
        return jsonify({'error': 'Transaction not found'}), 404

    updates = []
    params = []

    if 'quantity' in data:
        updates.append('quantity = ?')
        params.append(float(data['quantity']))
    if 'price_per_unit' in data:
        updates.append('price_per_unit = ?')
        params.append(float(data['price_per_unit']) if data['price_per_unit'] else None)
    if 'category' in data:
        updates.append('category = ?')
        params.append(data['category'])
    if 'comment' in data:
        updates.append('comment = ?')
        params.append(data['comment'])
    if 'date' in data:
        updates.append('date = ?')
        params.append(data['date'])

    if updates:
        params.append(transaction_id)
        db.execute(f'UPDATE transactions SET {", ".join(updates)} WHERE transaction_id = ?', params)
        db.commit()

        update_chart_data_for_user(user['id'])
        update_value_analysis_for_user(user['id'])
        calculate_daily_profit_for_user(user['id'])

    return jsonify({'success': True})


@app.route('/api/transactions/<transaction_id>', methods=['DELETE'])
@login_required
def delete_transaction(transaction_id):
    """
    حذف یک تراکنش
    اگر آخرین تراکنش دارایی باشد، خود دارایی هم حذف می‌شود (به جز کیف پول)
    """
    user = get_current_user()
    db = get_db()

    tx = db.execute(
        'SELECT * FROM transactions WHERE transaction_id = ? AND user_id = ?',
        (transaction_id, user['id'])
    ).fetchone()

    if not tx:
        return jsonify({'error': 'Transaction not found'}), 404

    db.execute('DELETE FROM transactions WHERE transaction_id = ?', (transaction_id,))

    # اگر تراکنش آخر بوده، دارایی رو هم حذف کن
    remaining = db.execute(
        'SELECT COUNT(*) as count FROM transactions WHERE asset_id = ?',
        (tx['asset_id'],)
    ).fetchone()

    if remaining['count'] == 0:
        asset = db.execute('SELECT symbol FROM assets WHERE id = ?', (tx['asset_id'],)).fetchone()
        if asset and asset['symbol'] != RIAL_WALLET_SYMBOL:
            db.execute('DELETE FROM assets WHERE id = ?', (tx['asset_id'],))

    db.commit()

    update_chart_data_for_user(user['id'])
    update_value_analysis_for_user(user['id'])
    calculate_daily_profit_for_user(user['id'])

    return jsonify({'success': True})


# ============================================================
#  بخش ۱۶: روت‌های واچ‌لیست و هدف‌گذاری
# ============================================================

@app.route('/api/watchlist', methods=['GET', 'POST'])
@login_required
def handle_watchlist():
    """
    مدیریت واچ‌لیست کاربر
    GET: دریافت لیست
    POST: افزودن/حذف (تغییر وضعیت)
    """
    user = get_current_user()
    db = get_db()

    if request.method == 'GET':
        rows = db.execute(
            'SELECT symbol, category FROM watchlist WHERE user_id = ?',
            (user['id'],)
        ).fetchall()
        return jsonify([dict(row) for row in rows])

    # POST: toggle
    data = request.json
    existing = db.execute(
        'SELECT 1 FROM watchlist WHERE user_id = ? AND symbol = ?',
        (user['id'], data['symbol'])
    ).fetchone()

    if existing:
        db.execute('DELETE FROM watchlist WHERE user_id = ? AND symbol = ?',
                   (user['id'], data['symbol']))
        action = 'removed'
    else:
        db.execute('INSERT INTO watchlist (user_id, symbol, category) VALUES (?, ?, ?)',
                   (user['id'], data['symbol'], data.get('category')))
        action = 'added'

    db.commit()
    return jsonify({'success': True, 'action': action})


@app.route('/api/investment-goal', methods=['GET', 'POST', 'DELETE'])
@login_required
def handle_investment_goal():
    """
    مدیریت هدف سرمایه‌گذاری
    GET: دریافت هدف فعلی
    POST: ذخیره هدف جدید (هدف قبلی حذف می‌شود)
    DELETE: حذف هدف
    """
    user = get_current_user()
    db = get_db()

    if request.method == 'GET':
        goal = db.execute(
            'SELECT * FROM investment_goals WHERE user_id = ?',
            (user['id'],)
        ).fetchone()
        return jsonify(dict(goal) if goal else {})

    elif request.method == 'POST':
        data = request.json
        db.execute('DELETE FROM investment_goals WHERE user_id = ?', (user['id'],))
        db.execute('''
            INSERT INTO investment_goals (user_id, goal_type, target_amount, days, start_date)
            VALUES (?, ?, ?, ?, ?)
        ''', (user['id'], data['type'], float(data['amount']),
              data.get('days'), datetime.now().date().isoformat()))
        db.commit()
        return jsonify({'success': True})

    elif request.method == 'DELETE':
        db.execute('DELETE FROM investment_goals WHERE user_id = ?', (user['id'],))
        db.commit()
        return jsonify({'success': True})


# ============================================================
#  بخش ۱۷: روت‌های ورودی/خروجی اطلاعات
# ============================================================

@app.route('/api/user/export', methods=['GET'])
@login_required
def export_user_data():
    """
    خروجی گرفتن از تمام اطلاعات کاربر
    شامل دارایی‌ها، تراکنش‌ها، نمودارها، تحلیل‌ها و تنظیمات
    """
    user = get_current_user()
    db = get_db()

    export_data = {
        'version': '2.0',
        'export_date': datetime.now().isoformat(),
        'user_name': f"{user['first_name']} {user['last_name']}",
        'data': {}
    }

    # دارایی‌ها و تراکنش‌ها
    assets = db.execute('SELECT * FROM assets WHERE user_id = ?', (user['id'],)).fetchall()
    export_data['data']['assets'] = []
    for asset in assets:
        asset_dict = dict(asset)
        transactions = db.execute(
            'SELECT * FROM transactions WHERE asset_id = ?', (asset['id'],)
        ).fetchall()
        asset_dict['transactions'] = [dict(tx) for tx in transactions]
        export_data['data']['assets'].append(asset_dict)

    # داده‌های نمودار
    chart_rows = db.execute(
        'SELECT date, total_value FROM chart_data WHERE user_id = ? ORDER BY date',
        (user['id'],)
    ).fetchall()
    export_data['data']['chart_data'] = {row['date']: row['total_value'] for row in chart_rows}

    # تحلیل ارزش
    value_rows = db.execute(
        'SELECT * FROM value_analysis WHERE user_id = ? ORDER BY date',
        (user['id'],)
    ).fetchall()
    export_data['data']['value_analysis'] = [dict(row) for row in value_rows]

    # سود روزانه
    profit_rows = db.execute(
        'SELECT * FROM daily_profit WHERE user_id = ? ORDER BY date',
        (user['id'],)
    ).fetchall()
    export_data['data']['daily_profit'] = [dict(row) for row in profit_rows]

    # واچ‌لیست
    watchlist_rows = db.execute(
        'SELECT symbol, category FROM watchlist WHERE user_id = ?',
        (user['id'],)
    ).fetchall()
    export_data['data']['watchlist'] = [dict(row) for row in watchlist_rows]

    # هدف سرمایه‌گذاری
    goal_row = db.execute(
        'SELECT * FROM investment_goals WHERE user_id = ?',
        (user['id'],)
    ).fetchone()
    export_data['data']['investment_goal'] = dict(goal_row) if goal_row else None

    return jsonify(export_data)


@app.route('/api/user/import', methods=['POST'])
@login_required
def import_user_data():
    """
    بازیابی اطلاعات از فایل پشتیبان
    تمام داده‌های فعلی حذف و با داده‌های فایل جایگزین می‌شود
    """
    user = get_current_user()
    data = request.json

    if not data or 'data' not in data:
        return jsonify({'error': 'فایل نامعتبر است'}), 400

    db = get_db()
    import_data = data['data']

    try:
        db.execute('BEGIN TRANSACTION')

        # حذف تمام داده‌های فعلی
        db.execute('DELETE FROM transactions WHERE user_id = ?', (user['id'],))
        db.execute('DELETE FROM assets WHERE user_id = ?', (user['id'],))
        db.execute('DELETE FROM chart_data WHERE user_id = ?', (user['id'],))
        db.execute('DELETE FROM value_analysis WHERE user_id = ?', (user['id'],))
        db.execute('DELETE FROM daily_profit WHERE user_id = ?', (user['id'],))
        db.execute('DELETE FROM watchlist WHERE user_id = ?', (user['id'],))
        db.execute('DELETE FROM investment_goals WHERE user_id = ?', (user['id'],))

        # بازیابی دارایی‌ها و تراکنش‌ها
        for asset in import_data.get('assets', []):
            asset_id = asset.get('id', str(uuid.uuid4()))
            db.execute('''
                INSERT INTO assets (id, user_id, symbol, title, created_at)
                VALUES (?, ?, ?, ?, ?)
            ''', (asset_id, user['id'], asset['symbol'], asset['title'],
                  asset.get('created_at', datetime.now().isoformat())))

            for tx in asset.get('transactions', []):
                db.execute('''
                    INSERT INTO transactions
                    (transaction_id, asset_id, user_id, type, quantity, price_per_unit,
                     category, comment, date, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    tx.get('transaction_id', str(uuid.uuid4())),
                    asset_id, user['id'], tx['type'], tx['quantity'],
                    tx.get('price_per_unit'), tx.get('category'), tx.get('comment'),
                    tx['date'], tx.get('created_at', datetime.now().isoformat())
                ))

        # بازیابی نمودار
        for date, value in import_data.get('chart_data', {}).items():
            db.execute('INSERT INTO chart_data (user_id, date, total_value) VALUES (?, ?, ?)',
                       (user['id'], date, value))

        # بازیابی تحلیل ارزش
        for entry in import_data.get('value_analysis', []):
            db.execute('''
                INSERT INTO value_analysis
                (user_id, date, total_value_toman, usd_price, gold_price_per_gram,
                 equivalent_usd, equivalent_gold_grams)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (user['id'], entry['date'], entry['total_value_toman'],
                  entry['usd_price'], entry['gold_price_per_gram'],
                  entry['equivalent_usd'], entry['equivalent_gold_grams']))

        # بازیابی سود روزانه
        for entry in import_data.get('daily_profit', []):
            db.execute('''
                INSERT INTO daily_profit
                (user_id, date, total_value, total_profit, profit_percent,
                 daily_change, daily_change_percent, yesterday_value, asset_count, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (user['id'], entry['date'], entry['total_value'], entry['total_profit'],
                  entry['profit_percent'], entry['daily_change'], entry['daily_change_percent'],
                  entry.get('yesterday_value'), entry.get('asset_count'), entry.get('timestamp')))

        # بازیابی واچ‌لیست
        for item in import_data.get('watchlist', []):
            db.execute('INSERT INTO watchlist (user_id, symbol, category) VALUES (?, ?, ?)',
                       (user['id'], item['symbol'], item.get('category')))

        # بازیابی هدف
        goal = import_data.get('investment_goal')
        if goal:
            db.execute('''
                INSERT INTO investment_goals (user_id, goal_type, target_amount, days, start_date)
                VALUES (?, ?, ?, ?, ?)
            ''', (user['id'], goal['goal_type'], goal['target_amount'],
                  goal.get('days'), goal['start_date']))

        # اطمینان از وجود کیف پول ریالی
        rial_exists = db.execute(
            'SELECT id FROM assets WHERE user_id = ? AND symbol = ?',
            (user['id'], RIAL_WALLET_SYMBOL)
        ).fetchone()

        if not rial_exists:
            db.execute(
                'INSERT INTO assets (id, user_id, symbol, title) VALUES (?, ?, ?, ?)',
                (str(uuid.uuid4()), user['id'], RIAL_WALLET_SYMBOL, 'کیف پول ریالی')
            )

        db.commit()
        return jsonify({'success': True, 'message': 'اطلاعات با موفقیت بازیابی شد'})

    except Exception as e:
        db.execute('ROLLBACK')
        print(f"❌ خطا در بازیابی اطلاعات: {e}")
        return jsonify({'error': f'خطا در بازیابی اطلاعات: {str(e)}'}), 500


# ============================================================
#  بخش ۱۸: روت‌های مدیریت API
# ============================================================

@app.route('/api/<api_key>', methods=['GET'])
def simple_api_browser(api_key):
    """
    API عمومی برای دریافت قیمت‌ها (با Rate Limiting)
    قابل استفاده در مرورگر
    """
    db = get_db()

    # اعتبارسنجی کلید
    key_record = db.execute(
        'SELECT * FROM user_api_keys WHERE api_key = ? AND is_active = 1',
        (api_key,)
    ).fetchone()

    if not key_record:
        return jsonify({'error': 'Invalid API key', 'status': 'error'}), 401

    # بررسی محدودیت نرخ
    is_allowed, error_msg = check_rate_limit(api_key)
    if not is_allowed:
        rate_status = get_rate_limit_status(api_key)
        return jsonify({
            'error': error_msg,
            'status': 'rate_limited',
            'rate_limit': rate_status,
            'message': 'شما از محدودیت درخواست عبور کرده‌اید'
        }), 429

    # ثبت درخواست
    db.execute('INSERT INTO api_requests (user_id, api_key, endpoint) VALUES (?, ?, ?)',
               (key_record['user_id'], api_key, '/api/browser'))
    db.commit()

    # دریافت قیمت‌ها
    prices_data = read_json_file(PRICES_FILE)

    if not prices_data:
        return jsonify({'error': 'Prices not available'}), 503

    rate_status = get_rate_limit_status(api_key)

    return jsonify({
        'status': 'success',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'last_updated': current_prices.get('last_updated', 'unknown'),
        'rate_limit': rate_status,
        'data': prices_data
    })


@app.route('/api/rate-limit-status/<api_key>', methods=['GET'])
def get_api_rate_status(api_key):
    """
    دریافت وضعیت محدودیت‌های یک کلید API
    """
    db = get_db()

    key_record = db.execute(
        'SELECT * FROM user_api_keys WHERE api_key = ? AND is_active = 1',
        (api_key,)
    ).fetchone()

    if not key_record:
        return jsonify({'error': 'Invalid API key'}), 401

    return jsonify({
        'api_key_preview': api_key[:8] + '...',
        'rate_limit': get_rate_limit_status(api_key)
    })


@app.route('/api/user/api-key', methods=['GET'])
@login_required
def get_api_key():
    """
    دریافت کلید API فعال کاربر
    """
    user = get_current_user()
    db = get_db()
    api_key = db.execute(
        'SELECT api_key FROM user_api_keys WHERE user_id = ? AND is_active = 1',
        (user['id'],)
    ).fetchone()
    return jsonify({'api_key': api_key['api_key'] if api_key else None})


@app.route('/api/user/api-key', methods=['POST'])
@login_required
def generate_api_key():
    """
    ساخت کلید API جدید
    کلیدهای قبلی غیرفعال می‌شوند
    """
    user = get_current_user()
    db = get_db()

    db.execute('UPDATE user_api_keys SET is_active = 0 WHERE user_id = ?', (user['id'],))

    new_key = f"assetly_{secrets.token_hex(24)}"
    db.execute('''
        INSERT INTO user_api_keys (user_id, api_key, is_active, created_at)
        VALUES (?, ?, 1, ?)
    ''', (user['id'], new_key, datetime.now().isoformat()))
    db.commit()

    return jsonify({'api_key': new_key})


@app.route('/api/user/api-key', methods=['DELETE'])
@login_required
def revoke_api_key():
    """
    حذف (غیرفعال‌سازی) کلید API کاربر
    """
    user = get_current_user()
    db = get_db()
    db.execute('UPDATE user_api_keys SET is_active = 0 WHERE user_id = ?', (user['id'],))
    db.commit()
    return jsonify({'success': True})


@app.route('/api/user/api-stats', methods=['GET'])
@login_required
def get_api_stats():
    """
    دریافت آمار استفاده از API برای کاربر
    """
    user = get_current_user()
    db = get_db()
    today = datetime.now().strftime('%Y-%m-%d')

    today_requests = db.execute(
        'SELECT COUNT(*) as count FROM api_requests WHERE user_id = ? AND date = ?',
        (user['id'], today)
    ).fetchone()

    total_requests = db.execute(
        'SELECT COUNT(*) as count FROM api_requests WHERE user_id = ?',
        (user['id'],)
    ).fetchone()

    return jsonify({
        'today_requests': today_requests['count'] if today_requests else 0,
        'total_requests': total_requests['count'] if total_requests else 0,
        'last_price_update': current_prices.get('last_updated', '-')
    })


# ============================================================
#  بخش ۱۹: API عمومی
# ============================================================

@app.route('/api/v1/prices', methods=['GET'])
def public_api_prices():
    """
    API عمومی نسخه ۱ برای دریافت قیمت‌ها
    نیاز به Authorization Header با کلید API
    پشتیبانی از فیلتر category
    """
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Missing Authorization header'}), 401

    api_key = auth_header[7:]
    db = get_db()

    key_record = db.execute(
        'SELECT * FROM user_api_keys WHERE api_key = ? AND is_active = 1',
        (api_key,)
    ).fetchone()

    if not key_record:
        return jsonify({'error': 'Invalid API key'}), 401

    # بررسی محدودیت
    is_allowed, error_msg = check_rate_limit(api_key)
    if not is_allowed:
        return jsonify({'error': error_msg, 'status': 'rate_limited'}), 429

    db.execute('INSERT INTO api_requests (user_id, api_key, endpoint) VALUES (?, ?, ?)',
               (key_record['user_id'], api_key, '/api/v1/prices'))
    db.commit()

    category = request.args.get('category')
    prices_data = read_json_file(PRICES_FILE)

    if not prices_data:
        return jsonify({'error': 'Prices not available'}), 503

    if category:
        if category in prices_data:
            return jsonify({
                'status': 'success',
                'category': category,
                'data': {category: prices_data[category]}
            })
        return jsonify({'error': f'Category "{category}" not found'}), 400

    return jsonify({
        'status': 'success',
        'last_updated': current_prices.get('last_updated', ''),
        'data': prices_data
    })


# ============================================================
#  بخش ۲۰: روت‌های داده‌های بورس
# ============================================================

@app.route('/api/tsetmc', methods=['GET'])
def get_tsetmc_data():
    """
    دریافت تمام داده‌های بورس
    """
    if 'categorized' in current_prices and 'stock' in current_prices['categorized']:
        return jsonify(current_prices['categorized']['stock'])

    data = read_json_file(TSETMC_FILE)
    return jsonify(data if data else [])


@app.route('/api/tsetmc/search', methods=['GET'])
def search_tsetmc():
    """
    جستجو در نمادهای بورس
    """
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify([])

    stock_data = current_prices.get('categorized', {}).get('stock', [])
    if not stock_data:
        stock_data = read_json_file(TSETMC_FILE)

    query_lower = query.lower()
    results = [
        item for item in stock_data
        if query_lower in item.get('symbol', '').lower()
        or query_lower in item.get('title', '').lower()
    ]

    return jsonify(results[:20])


# ============================================================
#  بخش ۲۱: روت‌های صفحات
# ============================================================

@app.route('/')
def index():
    """صفحه اصلی داشبورد"""
    return render_template('index.html')


@app.route('/markets')
def markets():
    """صفحه نمای بازارها"""
    return render_template('markets.html')


@app.route('/roadmap')
def roadmap():
    """صفحه نقشه راه"""
    return render_template('roadmap.html')


@app.route('/about')
def about():
    """صفحه درباره سازنده"""
    return render_template('about.html')


@app.route('/status')
def system_status():
    """صفحه وضعیت سیستم"""
    status_data = read_json_file(STATUS_FILE)
    return render_template('status.html',
                           services=status_data.get('services', {}),
                           last_updated=status_data.get('last_updated', 'نامشخص'))


# ============================================================
#  بخش ۲۲: مدیریت خطاها
# ============================================================

@app.errorhandler(404)
def page_not_found(e):
    """صفحه ۴۰۴ سفارشی"""
    return render_template('404.html'), 404


# ============================================================
#  بخش ۲۳: زمان‌بند (Scheduler)
# ============================================================

scheduler = BackgroundScheduler()

# قیمت‌ها هر ۱۰ دقیقه
scheduler.add_job(func=fetch_prices, trigger="interval", minutes=10)
# بورس هر ۱۷ دقیقه (برای پخش شدن بار)
scheduler.add_job(func=update_tsetmc_prices, trigger="interval", minutes=17)
# نمودار هر ۱ ساعت
scheduler.add_job(func=update_chart_data_for_all_users, trigger="interval", hours=1)
# تحلیل ارزش هر ۳ ساعت
scheduler.add_job(func=update_value_analysis_for_all_users, trigger="interval", hours=3)
# سود روزانه هر ۲ ساعت
scheduler.add_job(func=calculate_daily_profit_for_all_users, trigger="interval", hours=2)

scheduler.start()


# ============================================================
#  بخش ۲۴: راه‌اندازی اولیه
# ============================================================

def initialize_app():
    """
    راه‌اندازی اولیه اپلیکیشن
    - ساخت جداول
    - ایجاد کاربر پیش‌فرض (در صورت عدم وجود)
    - ساخت کیف پول ریالی برای کاربران موجود
    - اولین دریافت قیمت‌ها
    """
    with app.app_context():
        init_db()

        conn = sqlite3.connect(DATABASE)
        conn.row_factory = sqlite3.Row
        db = conn

        user_count = db.execute('SELECT COUNT(*) as count FROM users').fetchone()

        # ایجاد کاربر پیش‌فرض اگر هیچ کاربری وجود ندارد
        if user_count['count'] == 0:
            password_hash = hash_password('admin123')
            cursor = db.execute('''
                INSERT INTO users (first_name, last_name, email, phone, password_hash)
                VALUES (?, ?, ?, ?, ?)
            ''', ('کاربر', 'پیش‌فرض', 'default@assetly.local', '09120000000', password_hash))

            user_id = cursor.lastrowid

            db.execute(
                'INSERT INTO assets (id, user_id, symbol, title) VALUES (?, ?, ?, ?)',
                (str(uuid.uuid4()), user_id, RIAL_WALLET_SYMBOL, 'کیف پول ریالی')
            )

            conn.commit()
            print(f"✅ Default user created (ID: {user_id})")
        else:
            # ساخت کیف پول ریالی برای کاربرانی که ندارند
            users = db.execute('SELECT id FROM users').fetchall()
            for user in users:
                rial_exists = db.execute(
                    'SELECT id FROM assets WHERE user_id = ? AND symbol = ?',
                    (user['id'], RIAL_WALLET_SYMBOL)
                ).fetchone()

                if not rial_exists:
                    db.execute(
                        'INSERT INTO assets (id, user_id, symbol, title) VALUES (?, ?, ?, ?)',
                        (str(uuid.uuid4()), user['id'], RIAL_WALLET_SYMBOL, 'کیف پول ریالی')
                    )

        conn.commit()
        conn.close()

        # اولین دریافت قیمت‌ها
        fetch_prices()
        update_tsetmc_prices()

        # ساخت داده‌های اولیه برای همه کاربران
        print("📊 Building initial data for all users...")
        update_chart_data_for_all_users()
        update_value_analysis_for_all_users()
        calculate_daily_profit_for_all_users()

        print("✅ Application startup complete")


# اجرای راه‌اندازی اولیه
with app.app_context():
    initialize_app()

# بستن زمان‌بند در هنگام خروج
atexit.register(lambda: scheduler.shutdown())


# ============================================================
#  بخش ۲۵: اجرای برنامه
# ============================================================

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000)