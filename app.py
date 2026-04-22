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

import requests
from bs4 import BeautifulSoup
from flask import Flask, render_template, jsonify, request, session, redirect, url_for, g, make_response
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database configuration
DATABASE = os.getenv('DB_NAME', 'assetly.db')
DB_USER = os.getenv('DB_USER', None)
DB_PASSWORD = os.getenv('DB_PASSWORD', None)

app = Flask(__name__, template_folder='templates')
app.secret_key = secrets.token_hex(32)
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

# Define asset categories by their symbols
ASSET_TYPES = {
    "crypto": ["BTC", "ETH", "USDT", "XRP", "BNB", "SOL", "USDC", "TRX", "DOGE", "ADA", "LINK", "XLM", "AVAX", "SHIB", "LTC", "DOT", "UNI", "ATOM", "FIL"],
    "gold_coin": ["IR_GOLD_18K", "IR_GOLD_24K", "IR_GOLD_MELTED", "IR_COIN_1G", "IR_COIN_QUARTER", "IR_COIN_HALF", "IR_COIN_EMAMI", "IR_COIN_BAHAR", "XAUUSD"],
    "currency": ["USDT_IRT", "USD", "EUR", "AED", "GBP", "JPY", "KWD", "AUD", "CAD", "CNY", "TRY", "SAR", "CHF", "INR", "PKR", "IQD", "SYP", "SEK", "QAR", "OMR", "BHD", "AFN", "MYR", "THB", "RUB", "AZN", "AMD", "GEL"],
    "stock": [],  
}
ALL_SYMBOLS = {s: t for t, syms in ASSET_TYPES.items() for s in syms}
RIAL_WALLET_SYMBOL = 'RIAL_WALLET'

# Define file paths for data storage
ASSETS_FILE = 'assets.json'
CHART_DATA_FILE = 'chart_data.json'
COMPARISON_FILE = 'comparison_data.json'
DAILY_PROFIT_FILE = 'daily_profit.json'
PRICES_FILE = 'prices.json'
TSETMC_FILE = 'tsetmc_data.json'

# Database configuration
DATABASE = 'assetly.db'

# Global variables
allAssets = []
current_prices = {'categorized': {}}

# Cache settings
PRICE_CACHE_DURATION = 5  

# --- بورس تهران API ---
BRSAPI_KEY = os.getenv('BRSAPI_KEY')
TSETMC_API_URL = f"https://brsapi.ir/Api/Tsetmc/AllSymbols.php?key={BRSAPI_KEY}&type=1"
TSETMC_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/106.0.0.0",
    "Accept": "application/json, text/plain, */*"
}

# ========== Database Functions ==========

def get_db():
    """Get database connection"""
    if 'db' not in g:
        g.db = sqlite3.connect(DATABASE)
        # Set database password if configured
        if DB_PASSWORD:
            g.db.execute(f"PRAGMA key = '{DB_PASSWORD}'")
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(error):
    """Close database connection"""
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    """Initialize database with all tables"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    db = conn
    
    # Users table
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
    
    # Assets table
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
    
    # Transactions table
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
    
    # Portfolio history (chart data)
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
    
    # Value analysis (comparison data)
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
    
    # Daily profit
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
    
    # Watchlist (favorites)
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
    
    # Investment goals
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
    
    # User sessions (for remember me)
    db.execute('''
        CREATE TABLE IF NOT EXISTS user_sessions (
            session_token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    
    # API Keys table
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
    
    # API Requests log
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

def migrate_json_to_db(user_id):
    """Migrate existing JSON data to database for a user and cleanup JSON files"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    db = conn
    
    # Migrate assets
    if os.path.exists(ASSETS_FILE):
        assets = read_json_file(ASSETS_FILE)
        for asset in assets:
            existing = db.execute(
                'SELECT id FROM assets WHERE user_id = ? AND symbol = ?',
                (user_id, asset['symbol'])
            ).fetchone()
            
            if not existing:
                # همیشه UUID جدید بساز - از id قدیمی استفاده نکن
                asset_id = str(uuid.uuid4())
                
                db.execute(
                    'INSERT INTO assets (id, user_id, symbol, title) VALUES (?, ?, ?, ?)',
                    (asset_id, user_id, asset['symbol'], asset['title'])
                )
                
                for tx in asset.get('transactions', []):
                    db.execute('''
                        INSERT INTO transactions 
                        (transaction_id, asset_id, user_id, type, quantity, price_per_unit, category, comment, date)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        str(uuid.uuid4()),  # همیشه UUID جدید برای تراکنش
                        asset_id,
                        user_id,
                        tx['type'],
                        float(tx['quantity']),
                        float(tx.get('price_per_unit', 0)) if tx.get('price_per_unit') else None,
                        tx.get('category', ''),
                        tx.get('comment', ''),
                        tx.get('date', datetime.now().isoformat())
                    ))
    
    # Migrate chart data
    if os.path.exists(CHART_DATA_FILE):
        chart_data = read_json_file(CHART_DATA_FILE)
        for date, value in chart_data.items():
            db.execute('''
                INSERT OR REPLACE INTO chart_data (user_id, date, total_value)
                VALUES (?, ?, ?)
            ''', (user_id, date, float(value)))
    
    # Migrate comparison data
    if os.path.exists(COMPARISON_FILE):
        comparison_data = read_json_file(COMPARISON_FILE)
        for entry in comparison_data:
            db.execute('''
                INSERT OR REPLACE INTO value_analysis 
                (user_id, date, total_value_toman, usd_price, gold_price_per_gram, equivalent_usd, equivalent_gold_grams)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                user_id,
                entry['date'],
                float(entry.get('total_value_toman', 0)),
                float(entry.get('usd_price', 0)),
                float(entry.get('gold_price_per_gram', 0)),
                float(entry.get('equivalent_usd', 0)),
                float(entry.get('equivalent_gold_grams', 0))
            ))
    
    # Migrate daily profit
    if os.path.exists(DAILY_PROFIT_FILE):
        daily_profit = read_json_file(DAILY_PROFIT_FILE)
        for entry in daily_profit:
            db.execute('''
                INSERT OR REPLACE INTO daily_profit 
                (user_id, date, total_value, total_profit, profit_percent, daily_change, daily_change_percent, 
                 yesterday_value, asset_count, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                user_id,
                entry['date'],
                float(entry.get('total_value', 0)),
                float(entry.get('total_profit', 0)),
                float(entry.get('profit_percent', 0)),
                float(entry.get('daily_change', 0)),
                float(entry.get('daily_change_percent', 0)),
                float(entry.get('yesterday_value', 0)) if entry.get('yesterday_value') else None,
                entry.get('asset_count', 0),
                entry.get('timestamp', datetime.now().isoformat())
            ))
    
    conn.commit()
    conn.close()
    
    # Backup and remove JSON files
    backup_dir = 'json_backups'
    if not os.path.exists(backup_dir):
        os.makedirs(backup_dir)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    for file in [ASSETS_FILE, CHART_DATA_FILE, COMPARISON_FILE, DAILY_PROFIT_FILE]:
        if os.path.exists(file):
            backup_name = f"{backup_dir}/{file}.{timestamp}.backup"
            os.rename(file, backup_name)
            print(f"📁 Moved {file} to {backup_name}")
    
    print(f"✅ Data migrated and JSON files backed up for user {user_id}")
# ========== Utility Functions ==========

def read_json_file(file_path):
    """Reads and returns data from a JSON file."""
    if not os.path.exists(file_path):
        return {} if file_path in [CHART_DATA_FILE, COMPARISON_FILE, TSETMC_FILE] else []
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError:
        print(f"Error decoding JSON from {file_path}. Returning empty data.")
        return {} if file_path in [CHART_DATA_FILE, COMPARISON_FILE, TSETMC_FILE] else []

def get_value_analysis_changes():
    """Calculates changes in value analysis compared to previous days."""
    try:
        user = get_current_user()
        if not user:
            return None
        
        db = get_db()
        
        # Get last two days of value analysis
        rows = db.execute('''
            SELECT * FROM value_analysis 
            WHERE user_id = ? 
            ORDER BY date DESC 
            LIMIT 2
        ''', (user['id'],)).fetchall()
        
        if len(rows) < 2:
            return None
        
        latest = dict(rows[0])
        previous = dict(rows[1])
        
        # Calculate changes
        usd_change = latest['equivalent_usd'] - previous['equivalent_usd']
        gold_change = latest['equivalent_gold_grams'] - previous['equivalent_gold_grams']
        
        usd_change_percent = (usd_change / previous['equivalent_usd'] * 100) if previous['equivalent_usd'] > 0 else 0
        gold_change_percent = (gold_change / previous['equivalent_gold_grams'] * 100) if previous['equivalent_gold_grams'] > 0 else 0
        
        changes = {
            'date': latest['date'],
            'total_value_toman': latest['total_value_toman'],
            'usd_price': latest['usd_price'],
            'gold_price_per_gram': latest['gold_price_per_gram'],
            'equivalent_usd': latest['equivalent_usd'],
            'equivalent_gold_grams': latest['equivalent_gold_grams'],
            'usd_change': round(usd_change, 2),
            'gold_change': round(gold_change, 3),
            'usd_change_percent': round(usd_change_percent, 2),
            'gold_change_percent': round(gold_change_percent, 2)
        }
        
        return changes
        
    except Exception as e:
        print(f"❌ Error calculating value analysis changes: {e}")
        return None

def write_json_file(file_path, data):
    """Writes data to a JSON file."""
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

def read_prices():
    """Reads current prices from JSON file."""
    return read_json_file(PRICES_FILE)

def write_prices(data):
    """Writes prices to JSON file."""
    write_json_file(PRICES_FILE, data)

def init_json_files():
    """Initializes all JSON files if they don't exist."""
    files_to_init = [
        (PRICES_FILE, {}),
        (TSETMC_FILE, [])
    ]
    
    for file_path, default_data in files_to_init:
        if not os.path.exists(file_path):
            write_json_file(file_path, default_data)

def get_gold_price():
    """Fetches the 'AYAR' price using web scraping from chartix.ir."""
    url = "https://chartix.ir/market/saham/BRS00927"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        target_p = soup.find('p', attrs={'data-v-31f00d67': ''})
        if target_p:
            b_tag = target_p.find('b', class_='text-white font-sans')
            if b_tag:
                price_text = b_tag.text.strip().replace(',', '')
                try:
                    price = float(price_text)
                    adjusted_price = float(str(int(price))[:-1])
                    return adjusted_price
                except ValueError:
                    pass
        
        numbers = re.findall(r'\b\d{1,3}(?:,\d{3})*\b', soup.text)
        for num in numbers:
            clean_num = num.replace(',', '')
            if clean_num.isdigit():
                price = int(clean_num)
                if 300000 <= price <= 400000:
                    adjusted_price = float(str(price)[:-1])
                    return float(adjusted_price)
        
        return 35510.0
        
    except Exception as e:
        print(f"Error fetching AYAR price: {e}")
        return 35510.0

def read_tsetmc_data():
    """Reads TSETMC data from JSON file."""
    return read_json_file(TSETMC_FILE)

def write_tsetmc_data(data):
    """Writes TSETMC data to JSON file."""
    write_json_file(TSETMC_FILE, data)

# ========== Authentication Functions ==========

def hash_password(password):
    """Hash a password using SHA-256 with salt"""
    salt = "assetly_salt_2024"
    return hashlib.sha256((password + salt).encode()).hexdigest()

def verify_password(password, password_hash):
    """Verify a password against its hash"""
    return hash_password(password) == password_hash

def generate_session_token():
    """Generate a random session token"""
    return secrets.token_hex(32)

def login_required(f):
    """Decorator to require login for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' in session:
            return f(*args, **kwargs)
        
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
    """Get current logged in user"""
    user_id = session.get('user_id')
    if not user_id:
        return None
    
    db = get_db()
    return db.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()

# ========== بورس تهران Functions ==========

def fetch_tsetmc_data():
    """Fetch and process TSETMC stock market data with complete information."""
    try:
        print("📈 Fetching TSETMC data...")
        response = requests.get(TSETMC_API_URL, headers=TSETMC_HEADERS, timeout=30)
        
        if response.status_code != 200:
            print(f"❌ TSETMC API error: {response.status_code}")
            return None
        
        data = response.json()
        
        processed_data = []
        for item in data:
            if 'l18' in item and 'pl' in item:
                symbol_name = item.get('l18', '').strip()
                company_name = item.get('l30', symbol_name).strip()
                raw_price = item.get('pl', 0)
                raw_change = item.get('plc', 0)
                raw_change_percent = item.get('plp', 0)
                
                if raw_price and str(raw_price).replace('-', '').replace('.', '').isdigit():
                    price_str = str(abs(int(float(raw_price))))
                    if len(price_str) > 1:
                        adjusted_price = int(price_str[:-1])
                    else:
                        adjusted_price = 0
                    if float(raw_price) < 0:
                        adjusted_price = -adjusted_price
                else:
                    adjusted_price = 0
                
                if raw_change and str(raw_change).replace('-', '').replace('.', '').isdigit():
                    change_str = str(abs(int(float(raw_change))))
                    if len(change_str) > 1:
                        adjusted_change = int(change_str[:-1])
                    else:
                        adjusted_change = 0
                    if float(raw_change) < 0:
                        adjusted_change = -adjusted_change
                else:
                    adjusted_change = 0
                
                try:
                    change_percent = float(raw_change_percent) if raw_change_percent else 0
                except (ValueError, TypeError):
                    change_percent = 0
                
                current_time = datetime.now().strftime('%Y-%m-%d %H:%M')
                
                processed_item = {
                    'symbol': symbol_name,
                    'title': company_name,
                    'name': company_name,
                    'price': adjusted_price,
                    'toman_price': adjusted_price,
                    'change_value': adjusted_change,
                    'change_percent': change_percent,
                    'last_update': current_time
                }
                
                processed_data.append(processed_item)
        
        processed_data.sort(key=lambda x: x['symbol'])
        print(f"✅ TSETMC data processed: {len(processed_data)} symbols")
        
        return processed_data
        
    except Exception as e:
        print(f"❌ TSETMC processing error: {e}")
        return None

def update_tsetmc_prices():
    """Update TSETMC prices (called by scheduler)."""
    global current_prices
    
    try:
        new_data = fetch_tsetmc_data()
        
        if new_data:
            if 'categorized' not in current_prices:
                current_prices['categorized'] = {}
            
            current_prices['categorized']['stock'] = new_data
            
            for item in new_data:
                current_prices[item['symbol']] = item['toman_price']
            
            write_tsetmc_data(new_data)
            update_prices_with_stock_data(new_data)
            
            print(f"✅ TSETMC prices updated: {len(new_data)} symbols")
            return True
        else:
            cached_data = read_tsetmc_data()
            if cached_data:
                if 'categorized' not in current_prices:
                    current_prices['categorized'] = {}
                current_prices['categorized']['stock'] = cached_data
                update_prices_with_stock_data(cached_data)
                print(f"⚠️ Using cached TSETMC data: {len(cached_data)} symbols")
            return False
            
    except Exception as e:
        print(f"❌ Error updating TSETMC prices: {e}")
        return False

def update_prices_with_stock_data(stock_data):
    """Add stock data to the main prices.json file."""
    try:
        prices = read_prices()
        if not prices:
            prices = {}
        prices['stock'] = stock_data
        write_prices(prices)
        print(f"   📁 Stock data added to prices.json")
    except Exception as e:
        print(f"   ⚠️ Could not update prices.json with stock data: {e}")

# ========== Price Fetching Logic ==========

def use_cached_prices(error_message=""):
    """Use cached prices when API is unavailable."""
    global current_prices
    
    try:
        cached_prices = read_prices()
        if cached_prices:
            current_prices['categorized'] = cached_prices
            current_prices['last_updated'] = datetime.now(timezone.utc).isoformat()
            current_prices['api_error'] = error_message
            
            for category in cached_prices.values():
                if isinstance(category, list):
                    for item in category:
                        if item['symbol'] == 'USD':
                            current_prices['USD'] = item['price']
                        elif item['symbol'] == 'IR_GOLD_18K':
                            current_prices['GOL18'] = item['price']
                        elif item['symbol'] == 'USDT_IRT':
                            current_prices['usdt_price'] = item['price']
            
            print(f"⚠️ Using cached prices due to: {error_message}")
        else:
            current_prices['USD'] = 150000.0
            current_prices['GOL18'] = 20000000.0
            current_prices['usdt_price'] = 160000.0
            current_prices['api_error'] = error_message
    except Exception as e:
        print(f"❌ Error reading cached prices: {e}")

def fetch_prices():
    """Fetches real-time prices from the new API."""
    global current_prices
    
    last_updated = current_prices.get('last_updated')
    if last_updated:
        try:
            last_time = datetime.fromisoformat(last_updated)
            now = datetime.now(timezone.utc)
            minutes_diff = (now - last_time).total_seconds() / 60
            
            if minutes_diff < PRICE_CACHE_DURATION:
                print(f"🔄 Using cached prices (updated {minutes_diff:.1f} minutes ago)")
                return
        except Exception as e:
            print(f"Error parsing last updated time: {e}")
    
    API_URL = f"https://brsapi.ir/Api/Market/Gold_Currency.php?key={BRSAPI_KEY}"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
    }
    
    try:
        print("📡 Fetching prices from new API...")
        response = requests.get(API_URL, headers=headers, timeout=15)
        
        if response.status_code != 200:
            print(f"⚠️ API returned status code {response.status_code}. Using cached prices.")
            use_cached_prices(f"API error: {response.status_code}")
            return
        
        data = response.json()
        
        processed_prices = {
            "gold_coin": [],
            "currency": [],
            "crypto": []
        }
        
        current_prices[RIAL_WALLET_SYMBOL] = 1.0
        
        usdt_price = None
        
        for item in data.get('currency', []):
            if item['symbol'] == 'USDT_IRT':
                usdt_price = float(item['price'])
                break
        
        # Process gold coins
        for item in data.get('gold', []):
            symbol = item['symbol']
            
            if symbol not in ASSET_TYPES['gold_coin']:
                continue
            
            try:
                price = float(item['price'])
                unit = item['unit']
                
                if symbol == 'XAUUSD' and usdt_price:
                    price_in_toman = price * usdt_price
                    usd_price = price
                elif unit == 'دلار' and usdt_price:
                    price_in_toman = price * usdt_price
                    usd_price = price
                else:
                    price_in_toman = price
                    usd_price = price / usdt_price if usdt_price else None
                
                price_data = {
                    'symbol': symbol,
                    'title': item['name'],
                    'price': price_in_toman,
                    'toman_price': price_in_toman,
                    'usd_price': usd_price,
                    'last_update': f"{item['date']} {item['time']}" if item.get('date') else datetime.now().strftime('%Y-%m-%d %H:%M'),
                    'change_value': item.get('change_value'),
                    'change_percent': item.get('change_percent'),
                    'unit': unit
                }
                
                processed_prices['gold_coin'].append(price_data)
                current_prices[symbol] = price_in_toman
                
            except (ValueError, KeyError) as e:
                print(f"Error processing gold item {symbol}: {e}")
                continue
        
        # Process currency
        for item in data.get('currency', []):
            symbol = item['symbol']
            
            if symbol not in ASSET_TYPES['currency']:
                continue
            
            try:
                price = float(item['price'])
                
                price_data = {
                    'symbol': symbol,
                    'title': item['name'],
                    'price': price,
                    'toman_price': price,
                    'usd_price': price / usdt_price if usdt_price and symbol != 'USDT_IRT' else 1.0,
                    'last_update': f"{item['date']} {item['time']}" if item.get('date') else datetime.now().strftime('%Y-%m-%d %H:%M'),
                    'change_value': item.get('change_value'),
                    'change_percent': item.get('change_percent'),
                    'unit': item.get('unit', 'تومان')
                }
                
                processed_prices['currency'].append(price_data)
                current_prices[symbol] = price
                
                if symbol == 'USD':
                    current_prices['USD'] = price
                elif symbol == 'USDT_IRT':
                    current_prices['usdt_price'] = price
                    current_prices['USDT'] = price
                
            except (ValueError, KeyError) as e:
                print(f"Error processing currency item {symbol}: {e}")
                continue
        
        # Process cryptocurrency
        for item in data.get('cryptocurrency', []):
            symbol = item['symbol']
            
            if symbol not in ASSET_TYPES['crypto']:
                continue
            
            try:
                price_str = str(item['price']).replace(',', '')
                price = float(price_str)
                
                if usdt_price:
                    price_in_toman = price * usdt_price
                else:
                    usd_price_tmp = current_prices.get('USD', 150000)
                    price_in_toman = price * usd_price_tmp
                
                price_data = {
                    'symbol': symbol,
                    'title': item['name'],
                    'price': price_in_toman,
                    'toman_price': price_in_toman,
                    'usd_price': price,
                    'last_update': f"{item['date']} {item['time']}" if item.get('date') else datetime.now().strftime('%Y-%m-%d %H:%M'),
                    'change_percent': item.get('change_percent'),
                    'description': item.get('description', ''),
                    'unit': item.get('unit', 'دلار')
                }
                
                processed_prices['crypto'].append(price_data)
                current_prices[symbol] = price_in_toman
                
            except (ValueError, KeyError) as e:
                print(f"Error processing crypto item {symbol}: {e}")
                continue
        
        # Add AYAR manually
        ayar_price = get_gold_price()
        if ayar_price:
            processed_prices['gold_coin'].append({
                'symbol': 'AYAR',
                'title': 'عیار',
                'price': ayar_price,
                'toman_price': ayar_price,
                'usd_price': ayar_price / usdt_price if usdt_price else None,
                'last_update': datetime.now().strftime('%Y-%m-%d %H:%M'),
                'source': 'chartix.ir'
            })
            current_prices['AYAR'] = ayar_price
        
        # Sort each category
        for category in processed_prices:
            processed_prices[category].sort(key=lambda x: x['symbol'])
        
        # Add GOL18 for backward compatibility
        for item in processed_prices['gold_coin']:
            if item['symbol'] == 'IR_GOLD_18K':
                current_prices['GOL18'] = item['price']
                break
        
        # Load stock data
        try:
            stock_data = read_tsetmc_data()
            if stock_data:
                processed_prices['stock'] = stock_data
                for item in stock_data:
                    current_prices[item['symbol']] = item['toman_price']
                print(f"📈 Stock data loaded into prices: {len(stock_data)} symbols")
        except Exception as e:
            print(f"⚠️ Could not load stock data: {e}")
        
        current_prices['categorized'] = processed_prices
        current_prices['last_updated'] = datetime.now(timezone.utc).isoformat()
        
        write_prices(processed_prices)
        
        if 'api_error' in current_prices:
            del current_prices['api_error']
        
        print(f"✅ Price fetching completed from new API.")
        
    except requests.RequestException as e:
        print(f"❌ Error fetching prices: {e}")
        use_cached_prices(f"خطا در ارتباط با سرور: {str(e)}")
    except Exception as e:
        print(f"❌ Unexpected error in fetch_prices: {e}")
        import traceback
        traceback.print_exc()
        use_cached_prices("خطای غیرمنتظره در دریافت قیمت‌ها")

# ========== Core Logic Functions ==========

def aggregate_assets(user_id):
    """Aggregates transactions for each asset from database"""
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
                    elif tx_type == 'withdrawal':
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
        
        current_price = decimal.Decimal(str(current_prices.get(asset['symbol'], 0)))
        
        break_even_price = decimal.Decimal('0')
        if buy_quantity_sum > 0:
            break_even_price = buy_cost_sum / buy_quantity_sum
        
        current_value = total_quantity * current_price
        
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

# ========== Update Functions for Single User ==========

def update_chart_data_for_user(user_id):
    """Update chart data for a single user"""
    db = get_db()
    aggregated = aggregate_assets(user_id)
    
    total_value = decimal.Decimal('0')
    for asset in aggregated:
        if asset['symbol'] != RIAL_WALLET_SYMBOL:
            total_value += decimal.Decimal(asset['current_value'])
        else:
            total_value += decimal.Decimal(asset['total_quantity'])
    
    today = datetime.now().strftime('%Y-%m-%d')
    
    db.execute('''
        INSERT OR REPLACE INTO chart_data (user_id, date, total_value)
        VALUES (?, ?, ?)
    ''', (user_id, today, float(total_value)))
    db.commit()

def update_value_analysis_for_user(user_id):
    """Update value analysis for a single user"""
    usd_price = current_prices.get('USD', 0)
    gold_price = current_prices.get('GOL18', 0)
    
    if usd_price <= 0 or gold_price <= 0:
        return
    
    db = get_db()
    aggregated = aggregate_assets(user_id)
    
    total_value = decimal.Decimal('0')
    for asset in aggregated:
        if asset['symbol'] != RIAL_WALLET_SYMBOL:
            total_value += decimal.Decimal(asset['current_value'])
        else:
            total_value += decimal.Decimal(asset['total_quantity'])
    
    total_usd = float(total_value) / usd_price if usd_price > 0 else 0
    total_gold = float(total_value) / gold_price if gold_price > 0 else 0
    
    today = datetime.now().strftime('%Y-%m-%d')
    
    db.execute('''
        INSERT OR REPLACE INTO value_analysis 
        (user_id, date, total_value_toman, usd_price, gold_price_per_gram, equivalent_usd, equivalent_gold_grams)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (user_id, today, float(total_value), usd_price, gold_price, total_usd, total_gold))
    db.commit()

def calculate_daily_profit_for_user(user_id):
    """Calculate daily profit for a single user"""
    db = get_db()
    aggregated = aggregate_assets(user_id)
    today = datetime.now().strftime('%Y-%m-%d')
    yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    
    total_value = decimal.Decimal('0')
    total_cost_basis = decimal.Decimal('0')
    
    for asset in aggregated:
        if asset['symbol'] != RIAL_WALLET_SYMBOL:
            total_value += decimal.Decimal(asset['current_value'])
            total_cost_basis += decimal.Decimal(asset['cost_basis'])
        else:
            total_value += decimal.Decimal(asset['total_quantity'])
    
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
    
    total_profit = decimal.Decimal('0')
    for asset in aggregated:
        if asset['symbol'] != RIAL_WALLET_SYMBOL:
            total_profit += decimal.Decimal(asset['profit_loss'])
    
    total_profit_percent = (total_profit / total_cost_basis * 100) if total_cost_basis > 0 else 0
    
    db.execute('''
        INSERT OR REPLACE INTO daily_profit 
        (user_id, date, total_value, total_profit, profit_percent, daily_change, daily_change_percent, 
         yesterday_value, asset_count, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        user_id, today, float(total_value), float(total_profit), float(total_profit_percent),
        float(daily_change), float(daily_change_percent), float(yesterday_value) if yesterday_value else None,
        len([a for a in aggregated if a['symbol'] != RIAL_WALLET_SYMBOL and decimal.Decimal(a['total_quantity']) > 0]),
        datetime.now().isoformat()
    ))
    db.commit()

# ========== Update Functions for All Users (Scheduler) ==========

def update_chart_data_for_all_users():
    """Update chart data for all users"""
    print("📊 Updating chart data for all users...")
    db = get_db()
    
    users = db.execute('SELECT id FROM users').fetchall()
    
    for user in users:
        try:
            update_chart_data_for_user(user['id'])
        except Exception as e:
            print(f"❌ Error updating chart for user {user['id']}: {e}")
    
    print(f"✅ Chart data updated for {len(users)} users")

def update_value_analysis_for_all_users():
    """Update value analysis for all users"""
    print("📈 Updating value analysis for all users...")
    
    usd_price = current_prices.get('USD', 0)
    gold_price = current_prices.get('GOL18', 0)
    
    if usd_price <= 0 or gold_price <= 0:
        print("⚠️ Cannot update value analysis: prices not available")
        return
    
    db = get_db()
    users = db.execute('SELECT id FROM users').fetchall()
    
    for user in users:
        try:
            update_value_analysis_for_user(user['id'])
        except Exception as e:
            print(f"❌ Error updating value analysis for user {user['id']}: {e}")
    
    print(f"✅ Value analysis updated for {len(users)} users")

def calculate_daily_profit_for_all_users():
    """Calculate daily profit for all users"""
    print("💰 Calculating daily profit for all users...")
    
    db = get_db()
    users = db.execute('SELECT id FROM users').fetchall()
    
    for user in users:
        try:
            calculate_daily_profit_for_user(user['id'])
        except Exception as e:
            print(f"❌ Error calculating daily profit for user {user['id']}: {e}")
    
    print(f"✅ Daily profit calculated for {len(users)} users")

# ========== Routes ==========

@app.route('/')
def index():
    """Serve the main HTML page."""
    return render_template('index.html')

@app.route('/markets')
def markets():
    """Markets page"""
    return render_template('markets.html')

# ========== Authentication Routes ==========

@app.route('/api/auth/register', methods=['POST'])
def register():
    """Register a new user"""
    data = request.json
    
    required_fields = ['first_name', 'last_name', 'email', 'phone', 'password']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'فیلد {field} الزامی است'}), 400
    
    db = get_db()
    
    existing = db.execute(
        'SELECT id FROM users WHERE email = ? OR phone = ?',
        (data['email'], data['phone'])
    ).fetchone()
    
    if existing:
        return jsonify({'error': 'این مشخصات قبلاً در سایت ثبت شده است'}), 400
    
    password_hash = hash_password(data['password'])
    
    cursor = db.execute('''
        INSERT INTO users (first_name, last_name, email, phone, password_hash)
        VALUES (?, ?, ?, ?, ?)
    ''', (data['first_name'], data['last_name'], data['email'], data['phone'], password_hash))
    
    user_id = cursor.lastrowid
    
    # Create RIAL_WALLET for new user
    db.execute(
        'INSERT INTO assets (id, user_id, symbol, title) VALUES (?, ?, ?, ?)',
        (str(uuid.uuid4()), user_id, RIAL_WALLET_SYMBOL, 'کیف پول ریالی')
    )
    
    db.commit()
    
    session['user_id'] = user_id
    session.permanent = True
    
    # Create token
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
    """Login user"""
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
    
    if not user:
        return jsonify({'error': 'کاربری با این مشخصات یافت نشد'}), 401
    
    if not verify_password(password, user['password_hash']):
        return jsonify({'error': 'رمز عبور اشتباه است'}), 401
    
    db.execute('UPDATE users SET last_login = ? WHERE id = ?', 
               (datetime.now().isoformat(), user['id']))
    db.commit()
    
    session['user_id'] = user['id']
    session.permanent = True
    
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
    """Logout user"""
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
    """Get current user info"""
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
    """Change user password"""
    user = get_current_user()
    data = request.json
    
    current_password = data.get('current_password')
    new_password = data.get('new_password')
    
    if not current_password or not new_password:
        return jsonify({'error': 'رمز عبور فعلی و جدید الزامی است'}), 400
    
    if not verify_password(current_password, user['password_hash']):
        return jsonify({'error': 'رمز عبور فعلی اشتباه است'}), 401
    
    db = get_db()
    new_hash = hash_password(new_password)
    db.execute('UPDATE users SET password_hash = ? WHERE id = ?', (new_hash, user['id']))
    db.commit()
    
    return jsonify({'success': True})

@app.route('/api/auth/update-profile', methods=['PUT'])
@login_required
def update_profile():
    """Update user profile"""
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

# ========== API Routes ==========

@app.route('/api/assets', methods=['GET'])
@login_required
def get_assets():
    """Returns aggregated asset data."""
    user = get_current_user()
    if not current_prices.get('categorized'):
        fetch_prices()
    aggregated_data = aggregate_assets(user['id'])
    return jsonify(aggregated_data)

@app.route('/api/prices', methods=['GET'])
def get_prices():
    """Returns categorized real-time prices."""
    if 'categorized' not in current_prices or not current_prices['categorized']:
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
    """Returns portfolio chart data."""
    user = get_current_user()
    db = get_db()
    
    rows = db.execute(
        'SELECT date, total_value FROM chart_data WHERE user_id = ? ORDER BY date',
        (user['id'],)
    ).fetchall()
    
    chart_data = {row['date']: row['total_value'] for row in rows}
    return jsonify(chart_data)

@app.route('/api/comparison-data', methods=['GET'])
@login_required
def get_comparison_data():
    """Returns comparison data."""
    user = get_current_user()
    db = get_db()
    
    rows = db.execute(
        'SELECT * FROM value_analysis WHERE user_id = ? ORDER BY date',
        (user['id'],)
    ).fetchall()
    
    return jsonify([dict(row) for row in rows])

@app.route('/api/value-analysis', methods=['GET'])
@login_required
def get_value_analysis():
    """Returns value analysis data with changes."""
    try:
        changes = get_value_analysis_changes()
        if changes:
            return jsonify(changes)
        else:
            # Fallback to just latest data
            user = get_current_user()
            db = get_db()
            
            row = db.execute('''
                SELECT * FROM value_analysis 
                WHERE user_id = ? 
                ORDER BY date DESC 
                LIMIT 1
            ''', (user['id'],)).fetchone()
            
            if row:
                data = dict(row)
                data['usd_change'] = 0
                data['gold_change'] = 0
                data['usd_change_percent'] = 0
                data['gold_change_percent'] = 0
                return jsonify(data)
            
            return jsonify({})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/daily-profit', methods=['GET'])
@login_required
def get_daily_profit():
    """Returns daily profit data."""
    user = get_current_user()
    db = get_db()
    
    rows = db.execute(
        'SELECT * FROM daily_profit WHERE user_id = ? ORDER BY date',
        (user['id'],)
    ).fetchall()
    
    return jsonify([dict(row) for row in rows])

@app.route('/api/today-profit', methods=['GET'])
@login_required
def get_today_profit():
    """Returns today's profit data."""
    user = get_current_user()
    db = get_db()
    today = datetime.now().strftime('%Y-%m-%d')
    
    row = db.execute(
        'SELECT * FROM daily_profit WHERE user_id = ? AND date = ?',
        (user['id'], today)
    ).fetchone()
    
    if row:
        return jsonify(dict(row))
    
    calculate_daily_profit_for_user(user['id'])
    
    row = db.execute(
        'SELECT * FROM daily_profit WHERE user_id = ? AND date = ?',
        (user['id'], today)
    ).fetchone()
    
    if row:
        return jsonify(dict(row))
    
    return jsonify({'error': 'Could not calculate daily profit'}), 500

@app.route('/api/tsetmc', methods=['GET'])
def get_tsetmc_data():
    """Returns TSETMC stock market data."""
    try:
        if 'categorized' in current_prices and 'stock' in current_prices['categorized']:
            stock_data = current_prices['categorized']['stock']
        else:
            stock_data = read_tsetmc_data()
        
        if not stock_data:
            update_tsetmc_prices()
            if 'categorized' in current_prices and 'stock' in current_prices['categorized']:
                stock_data = current_prices['categorized']['stock']
            else:
                stock_data = []
        
        return jsonify(stock_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tsetmc/search', methods=['GET'])
def search_tsetmc():
    """Search TSETMC symbols by name."""
    query = request.args.get('q', '').strip()
    
    if not query:
        return jsonify([])
    
    try:
        if 'categorized' in current_prices and 'stock' in current_prices['categorized']:
            stock_data = current_prices['categorized']['stock']
        else:
            stock_data = read_tsetmc_data()
        
        if not stock_data:
            return jsonify([])
        
        results = []
        query_lower = query.lower()
        
        for item in stock_data:
            symbol_name = item.get('symbol', '').lower()
            company_name = item.get('title', '').lower()
            if query_lower in symbol_name or query_lower in company_name:
                results.append(item)
        
        return jsonify(results[:20])
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/transactions', methods=['POST'])
@login_required
def add_transaction():
    """Adds a new transaction."""
    user = get_current_user()
    data = request.json
    db = get_db()
    
    required_fields = ['symbol', 'type', 'quantity']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400

    tx_type = data['type']
    symbol = data['symbol']
    quantity = data['quantity']
    
    if tx_type in ['buy', 'sell', 'save_profit'] and 'price_per_unit' not in data:
        return jsonify({'error': 'price_per_unit is required'}), 400
    
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
                decimal.Decimal(tx['quantity']) if tx['type'] == 'deposit' else -decimal.Decimal(tx['quantity'])
                for tx in rial_transactions
            )
            
            total_cost = decimal.Decimal(str(quantity)) * decimal.Decimal(str(data['price_per_unit']))
            
            if total_cost > wallet_balance:
                return jsonify({
                    'error': f'موجودی کیف پول کافی نیست. موجودی: {wallet_balance:,.0f} تومان، مورد نیاز: {total_cost:,.0f} تومان'
                }), 400
    
    asset = db.execute(
        'SELECT * FROM assets WHERE user_id = ? AND symbol = ?',
        (user['id'], symbol)
    ).fetchone()
    
    if not asset and symbol != RIAL_WALLET_SYMBOL:
        asset_id = str(uuid.uuid4())
        asset_title = symbol
        
        if 'categorized' in current_prices:
            for category_name, category_items in current_prices['categorized'].items():
                if isinstance(category_items, list):
                    for item in category_items:
                        if isinstance(item, dict) and item.get('symbol') == symbol:
                            asset_title = item.get('title', symbol)
                            break
        
        db.execute(
            'INSERT INTO assets (id, user_id, symbol, title) VALUES (?, ?, ?, ?)',
            (asset_id, user['id'], symbol, asset_title)
        )
    else:
        asset_id = asset['id']
    
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
    
    if tx_type == 'buy' and symbol != RIAL_WALLET_SYMBOL:
        rial_asset = db.execute(
            'SELECT * FROM assets WHERE user_id = ? AND symbol = ?',
            (user['id'], RIAL_WALLET_SYMBOL)
        ).fetchone()
        
        if rial_asset:
            purchase_amount = float(quantity) * float(data['price_per_unit'])
            db.execute('''
                INSERT INTO transactions 
                (transaction_id, asset_id, user_id, type, quantity, price_per_unit, category, comment, date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                str(uuid.uuid4()), rial_asset['id'], user['id'],
                'withdrawal', purchase_amount, 1,
                data.get('category', 'خرید دارایی'),
                f"خرید {quantity} واحد {symbol}",
                data.get('date', datetime.now().isoformat())
            ))
    
    elif tx_type == 'sell' and symbol != RIAL_WALLET_SYMBOL:
        rial_asset = db.execute(
            'SELECT * FROM assets WHERE user_id = ? AND symbol = ?',
            (user['id'], RIAL_WALLET_SYMBOL)
        ).fetchone()
        
        if rial_asset:
            sale_amount = float(quantity) * float(data['price_per_unit'])
            db.execute('''
                INSERT INTO transactions 
                (transaction_id, asset_id, user_id, type, quantity, price_per_unit, category, comment, date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                str(uuid.uuid4()), rial_asset['id'], user['id'],
                'deposit', sale_amount, 1,
                data.get('category', 'فروش دارایی'),
                f"فروش {quantity} واحد {symbol}",
                data.get('date', datetime.now().isoformat())
            ))
    
    elif tx_type == 'save_profit' and symbol != RIAL_WALLET_SYMBOL:
        rial_asset = db.execute(
            'SELECT * FROM assets WHERE user_id = ? AND symbol = ?',
            (user['id'], RIAL_WALLET_SYMBOL)
        ).fetchone()
        
        if rial_asset:
            profit_amount = float(quantity) * float(data['price_per_unit'])
            db.execute('''
                INSERT INTO transactions 
                (transaction_id, asset_id, user_id, type, quantity, price_per_unit, category, comment, date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                str(uuid.uuid4()), rial_asset['id'], user['id'],
                'deposit', profit_amount, 1,
                data.get('category', 'سود سیو شده'),
                f"انتقال سود سیو شده از {symbol}",
                data.get('date', datetime.now().isoformat())
            ))
    
    db.commit()
    
    # Update data for this user
    update_chart_data_for_user(user['id'])
    update_value_analysis_for_user(user['id'])
    calculate_daily_profit_for_user(user['id'])
    
    return jsonify({'success': True, 'transaction_id': transaction_id})

@app.route('/api/transactions/<transaction_id>', methods=['DELETE'])
@login_required
def delete_transaction(transaction_id):
    """Deletes a specific transaction."""
    user = get_current_user()
    db = get_db()
    
    tx = db.execute(
        'SELECT * FROM transactions WHERE transaction_id = ? AND user_id = ?',
        (transaction_id, user['id'])
    ).fetchone()
    
    if not tx:
        return jsonify({'error': 'Transaction not found'}), 404
    
    db.execute('DELETE FROM transactions WHERE transaction_id = ?', (transaction_id,))
    
    # Clean up empty assets
    asset_transactions = db.execute(
        'SELECT COUNT(*) as count FROM transactions WHERE asset_id = ?',
        (tx['asset_id'],)
    ).fetchone()
    
    if asset_transactions['count'] == 0:
        asset = db.execute('SELECT symbol FROM assets WHERE id = ?', (tx['asset_id'],)).fetchone()
        if asset and asset['symbol'] != RIAL_WALLET_SYMBOL:
            db.execute('DELETE FROM assets WHERE id = ?', (tx['asset_id'],))
    
    db.commit()
    
    # Update data for this user
    update_chart_data_for_user(user['id'])
    update_value_analysis_for_user(user['id'])
    calculate_daily_profit_for_user(user['id'])
    
    return jsonify({'success': True})

@app.route('/api/transactions/<transaction_id>', methods=['PUT'])
@login_required
def update_transaction(transaction_id):
    """Updates an existing transaction."""
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
    if 'price_per_unit' in data and data['price_per_unit'] is not None:
        updates.append('price_per_unit = ?')
        params.append(float(data['price_per_unit']))
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
    
    # Update data for this user
    update_chart_data_for_user(user['id'])
    update_value_analysis_for_user(user['id'])
    calculate_daily_profit_for_user(user['id'])
    
    return jsonify({'success': True})

@app.route('/api/watchlist', methods=['GET'])
@login_required
def get_watchlist():
    """Get user watchlist"""
    user = get_current_user()
    db = get_db()
    
    rows = db.execute(
        'SELECT symbol, category FROM watchlist WHERE user_id = ?',
        (user['id'],)
    ).fetchall()
    
    return jsonify([dict(row) for row in rows])

@app.route('/api/watchlist', methods=['POST'])
@login_required
def toggle_watchlist():
    """Toggle watchlist item"""
    user = get_current_user()
    data = request.json
    db = get_db()
    
    existing = db.execute(
        'SELECT 1 FROM watchlist WHERE user_id = ? AND symbol = ?',
        (user['id'], data['symbol'])
    ).fetchone()
    
    if existing:
        db.execute(
            'DELETE FROM watchlist WHERE user_id = ? AND symbol = ?',
            (user['id'], data['symbol'])
        )
        action = 'removed'
    else:
        db.execute(
            'INSERT INTO watchlist (user_id, symbol, category) VALUES (?, ?, ?)',
            (user['id'], data['symbol'], data.get('category'))
        )
        action = 'added'
    
    db.commit()
    return jsonify({'success': True, 'action': action})

@app.route('/api/investment-goal', methods=['GET'])
@login_required
def get_investment_goal():
    """Get user investment goal"""
    user = get_current_user()
    db = get_db()
    
    goal = db.execute(
        'SELECT * FROM investment_goals WHERE user_id = ?',
        (user['id'],)
    ).fetchone()
    
    return jsonify(dict(goal) if goal else {})

@app.route('/api/investment-goal', methods=['POST'])
@login_required
def save_investment_goal():
    """Save user investment goal"""
    user = get_current_user()
    data = request.json
    db = get_db()
    
    db.execute('DELETE FROM investment_goals WHERE user_id = ?', (user['id'],))
    
    db.execute('''
        INSERT INTO investment_goals (user_id, goal_type, target_amount, days, start_date)
        VALUES (?, ?, ?, ?, ?)
    ''', (
        user['id'],
        data['type'],
        float(data['amount']),
        data.get('days'),
        datetime.now().date().isoformat()
    ))
    
    db.commit()
    return jsonify({'success': True})

@app.route('/api/investment-goal', methods=['DELETE'])
@login_required
def delete_investment_goal():
    """Delete user investment goal"""
    user = get_current_user()
    db = get_db()
    
    db.execute('DELETE FROM investment_goals WHERE user_id = ?', (user['id'],))
    db.commit()
    
    return jsonify({'success': True})

# ========== Data Export/Import Routes ==========

@app.route('/api/user/export', methods=['GET'])
@login_required
def export_user_data():
    """Export all user data as JSON"""
    user = get_current_user()
    db = get_db()
    
    export_data = {
        'version': '2.0',
        'export_date': datetime.now().isoformat(),
        'user_name': f"{user['first_name']} {user['last_name']}",
        'data': {}
    }
    
    # Assets and transactions
    assets = db.execute(
        'SELECT * FROM assets WHERE user_id = ?',
        (user['id'],)
    ).fetchall()
    
    export_data['data']['assets'] = []
    for asset in assets:
        asset_dict = dict(asset)
        
        transactions = db.execute(
            'SELECT * FROM transactions WHERE asset_id = ?',
            (asset['id'],)
        ).fetchall()
        
        asset_dict['transactions'] = [dict(tx) for tx in transactions]
        export_data['data']['assets'].append(asset_dict)
    
    # Chart data
    chart_rows = db.execute(
        'SELECT date, total_value FROM chart_data WHERE user_id = ? ORDER BY date',
        (user['id'],)
    ).fetchall()
    export_data['data']['chart_data'] = {row['date']: row['total_value'] for row in chart_rows}
    
    # Value analysis
    value_rows = db.execute(
        'SELECT * FROM value_analysis WHERE user_id = ? ORDER BY date',
        (user['id'],)
    ).fetchall()
    export_data['data']['value_analysis'] = [dict(row) for row in value_rows]
    
    # Daily profit
    profit_rows = db.execute(
        'SELECT * FROM daily_profit WHERE user_id = ? ORDER BY date',
        (user['id'],)
    ).fetchall()
    export_data['data']['daily_profit'] = [dict(row) for row in profit_rows]
    
    # Watchlist
    watchlist_rows = db.execute(
        'SELECT symbol, category FROM watchlist WHERE user_id = ?',
        (user['id'],)
    ).fetchall()
    export_data['data']['watchlist'] = [dict(row) for row in watchlist_rows]
    
    # Investment goal
    goal_row = db.execute(
        'SELECT * FROM investment_goals WHERE user_id = ?',
        (user['id'],)
    ).fetchone()
    export_data['data']['investment_goal'] = dict(goal_row) if goal_row else None
    
    return jsonify(export_data)

@app.route('/api/user/import', methods=['POST'])
@login_required
def import_user_data():
    """Import user data from JSON"""
    user = get_current_user()
    data = request.json
    
    if not data or 'data' not in data:
        return jsonify({'error': 'فایل نامعتبر است'}), 400
    
    if data.get('version', '1.0') not in ['2.0', '1.0']:
        return jsonify({'error': 'نسخه فایل پشتیبان ناسازگار است'}), 400
    
    db = get_db()
    import_data = data['data']
    
    try:
        db.execute('BEGIN TRANSACTION')
        
        # Clear existing user data
        db.execute('DELETE FROM transactions WHERE user_id = ?', (user['id'],))
        db.execute('DELETE FROM assets WHERE user_id = ?', (user['id'],))
        db.execute('DELETE FROM chart_data WHERE user_id = ?', (user['id'],))
        db.execute('DELETE FROM value_analysis WHERE user_id = ?', (user['id'],))
        db.execute('DELETE FROM daily_profit WHERE user_id = ?', (user['id'],))
        db.execute('DELETE FROM watchlist WHERE user_id = ?', (user['id'],))
        db.execute('DELETE FROM investment_goals WHERE user_id = ?', (user['id'],))
        
        # Import assets and transactions
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
                    asset_id,
                    user['id'],
                    tx['type'],
                    tx['quantity'],
                    tx.get('price_per_unit'),
                    tx.get('category'),
                    tx.get('comment'),
                    tx['date'],
                    tx.get('created_at', datetime.now().isoformat())
                ))
        
        # Import chart data
        for date, value in import_data.get('chart_data', {}).items():
            db.execute('''
                INSERT INTO chart_data (user_id, date, total_value)
                VALUES (?, ?, ?)
            ''', (user['id'], date, value))
        
        # Import value analysis
        for entry in import_data.get('value_analysis', []):
            db.execute('''
                INSERT INTO value_analysis 
                (user_id, date, total_value_toman, usd_price, gold_price_per_gram, 
                 equivalent_usd, equivalent_gold_grams)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                user['id'], entry['date'], entry['total_value_toman'],
                entry['usd_price'], entry['gold_price_per_gram'],
                entry['equivalent_usd'], entry['equivalent_gold_grams']
            ))
        
        # Import daily profit
        for entry in import_data.get('daily_profit', []):
            db.execute('''
                INSERT INTO daily_profit 
                (user_id, date, total_value, total_profit, profit_percent, 
                 daily_change, daily_change_percent, yesterday_value, asset_count, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                user['id'], entry['date'], entry['total_value'], entry['total_profit'],
                entry['profit_percent'], entry['daily_change'], entry['daily_change_percent'],
                entry.get('yesterday_value'), entry.get('asset_count'), entry.get('timestamp')
            ))
        
        # Import watchlist
        for item in import_data.get('watchlist', []):
            db.execute('''
                INSERT INTO watchlist (user_id, symbol, category)
                VALUES (?, ?, ?)
            ''', (user['id'], item['symbol'], item.get('category')))
        
        # Import investment goal
        goal = import_data.get('investment_goal')
        if goal:
            db.execute('''
                INSERT INTO investment_goals 
                (user_id, goal_type, target_amount, days, start_date)
                VALUES (?, ?, ?, ?, ?)
            ''', (user['id'], goal['goal_type'], goal['target_amount'], 
                  goal.get('days'), goal['start_date']))
        
        # Recreate RIAL_WALLET if not exists
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
        print(f"Import error: {e}")
        return jsonify({'error': f'خطا در بازیابی اطلاعات: {str(e)}'}), 500

# ========== Public API Routes ==========

@app.route('/api/v1/prices', methods=['GET'])
def public_api_prices():
    """Public API endpoint for prices with API key authentication"""
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Missing or invalid Authorization header. Use: Bearer YOUR_API_KEY'}), 401
    
    api_key = auth_header[7:]
    
    db = get_db()
    key_record = db.execute(
        'SELECT * FROM user_api_keys WHERE api_key = ? AND is_active = 1',
        (api_key,)
    ).fetchone()
    
    if not key_record:
        return jsonify({'error': 'Invalid or inactive API key'}), 401
    
    db.execute('''
        INSERT INTO api_requests (user_id, api_key, endpoint)
        VALUES (?, ?, ?)
    ''', (key_record['user_id'], api_key, '/api/v1/prices'))
    db.commit()
    
    category = request.args.get('category')
    prices_data = read_prices()
    
    if not prices_data:
        return jsonify({'error': 'Prices data not available'}), 503
    
    result = {
        'status': 'success',
        'last_updated': current_prices.get('last_updated', datetime.now(timezone.utc).isoformat()),
        'data': {}
    }
    
    if category:
        if category in prices_data:
            result['data'][category] = prices_data[category]
            result['category'] = category
        else:
            return jsonify({'error': f'Category "{category}" not found. Available: gold_coin, currency, crypto, stock'}), 400
    else:
        result['data'] = {k: v for k, v in prices_data.items() if k != 'api_error'}
    
    return jsonify(result)

@app.route('/api/v1/prices/<category>', methods=['GET'])
def public_api_prices_by_category(category):
    """Public API endpoint for specific category"""
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Missing or invalid Authorization header'}), 401
    
    api_key = auth_header[7:]
    
    db = get_db()
    key_record = db.execute(
        'SELECT * FROM user_api_keys WHERE api_key = ? AND is_active = 1',
        (api_key,)
    ).fetchone()
    
    if not key_record:
        return jsonify({'error': 'Invalid API key'}), 401
    
    db.execute('''
        INSERT INTO api_requests (user_id, api_key, endpoint)
        VALUES (?, ?, ?)
    ''', (key_record['user_id'], api_key, f'/api/v1/prices/{category}'))
    db.commit()
    
    prices_data = read_prices()
    
    if not prices_data:
        return jsonify({'error': 'Prices data not available'}), 503
    
    if category not in prices_data:
        return jsonify({'error': f'Category "{category}" not found'}), 404
    
    return jsonify({
        'status': 'success',
        'last_updated': current_prices.get('last_updated', datetime.now(timezone.utc).isoformat()),
        'category': category,
        'data': prices_data[category]
    })

# ========== API Key Management Routes ==========

@app.route('/api/user/api-key', methods=['GET'])
@login_required
def get_api_key():
    """Get user's API key"""
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
    """Generate new API key for user"""
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
    """Revoke user's API key"""
    user = get_current_user()
    db = get_db()
    
    db.execute('UPDATE user_api_keys SET is_active = 0 WHERE user_id = ?', (user['id'],))
    db.commit()
    
    return jsonify({'success': True})

@app.route('/api/user/api-stats', methods=['GET'])
@login_required
def get_api_stats():
    """Get API usage statistics"""
    user = get_current_user()
    db = get_db()
    
    today = datetime.now().strftime('%Y-%m-%d')
    
    today_requests = db.execute('''
        SELECT COUNT(*) as count FROM api_requests 
        WHERE user_id = ? AND date = ?
    ''', (user['id'], today)).fetchone()
    
    total_requests = db.execute('''
        SELECT COUNT(*) as count FROM api_requests WHERE user_id = ?
    ''', (user['id'],)).fetchone()
    
    return jsonify({
        'today_requests': today_requests['count'] if today_requests else 0,
        'total_requests': total_requests['count'] if total_requests else 0,
        'last_price_update': current_prices.get('last_updated', '-')
    })

# ========== Scheduler ==========
from apscheduler.schedulers.background import BackgroundScheduler

scheduler = BackgroundScheduler()

scheduler.add_job(func=fetch_prices, trigger="interval", minutes=10)
scheduler.add_job(func=update_tsetmc_prices, trigger="interval", minutes=17)
scheduler.add_job(func=update_chart_data_for_all_users, trigger="interval", hours=1)
scheduler.add_job(func=update_value_analysis_for_all_users, trigger="interval", hours=3)
scheduler.add_job(func=calculate_daily_profit_for_all_users, trigger="interval", hours=2)

scheduler.start()

# ========== Initialize ==========
def initialize_app():
    """Initialize the application on startup."""
    with app.app_context():
        init_json_files()
        init_db()
        
        conn = sqlite3.connect(DATABASE)
        conn.row_factory = sqlite3.Row
        db = conn
        
        # Check if there are any users
        user_count = db.execute('SELECT COUNT(*) as count FROM users').fetchone()
        
        if user_count['count'] == 0:
            # Create default user
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
            
            # Check for old JSON files and migrate
            if os.path.exists(ASSETS_FILE):
                migrate_json_to_db(user_id)
            
            print(f"✅ Created default user (ID: {user_id}) - Email: default@assetly.local / Password: admin123")
        else:
            # Check for old JSON files and migrate if needed
            if os.path.exists(ASSETS_FILE):
                print("⚠️ Found old JSON files. Migrating to database...")
                users = db.execute('SELECT id FROM users').fetchall()
                if users:
                    migrate_json_to_db(users[0]['id'])
        
        # Ensure all users have RIAL_WALLET
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
        
        fetch_prices()
        update_tsetmc_prices()
        
        if 'categorized' not in current_prices or not current_prices['categorized']:
            cached_prices = read_prices()
            if cached_prices:
                current_prices['categorized'] = cached_prices
                print("✅ Loaded cached prices on startup")
        
        import time
        time.sleep(1)
        
        print("✅ Application initialized successfully")

with app.app_context():
    initialize_app()

atexit.register(lambda: scheduler.shutdown())

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)