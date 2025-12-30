import json
import os
import uuid
import re
from datetime import datetime, timezone, timedelta
import atexit
import decimal

import requests
from bs4 import BeautifulSoup
from flask import Flask, render_template, jsonify, request
from apscheduler.schedulers.background import BackgroundScheduler

# --- Configuration ---
app = Flask(__name__, template_folder='templates')

# Define asset categories by their symbols
ASSET_TYPES = {
    "crypto": ["USDT", "BITCOIN", "XRP", "ETH", "BNB", "TRX", "BCH", "DOGE", "LTC", "SOL", "XMR", "DASH", "EOS", "TON", "DOT", "ADA", "AVAX", "FIL", "XLM", "SHIB", "VET", "LINK", "MATIC", "ATOM", "UNI"],
    "gold_coin": ["AYAR", "EMAMI1", "GOL18", "OUNCE", "MITHQAL", "AZADI1_4", "AZADI1_2", "AZADI1", "AZADI1G"],
    "currency": ["USD", "EUR", "GBP", "AED", "CNY", "TRY", "RUB", "CAD", "CHF", "OMR", "NOK", "AZN", "DKK", "MYR", "AFN", "KWD", "SEK", "AUD", "THB", "SGD", "JPY", "MEXUSD"],
    "stock": [],
}
ALL_SYMBOLS = {s: t for t, syms in ASSET_TYPES.items() for s in syms}
RIAL_WALLET_SYMBOL = 'RIAL_WALLET'

# Define file paths for data storage
ASSETS_FILE = 'assets.json'
CHART_DATA_FILE = 'chart_data.json'
COMPARISON_FILE = 'comparison_data.json'
DAILY_PROFIT_FILE = 'daily_profit.json'
PRICES_FILE = 'prices.json'  # فایل کش قیمت‌ها

# Global variables
allAssets = []
current_prices = {'categorized': {}}

# Cache settings
PRICE_CACHE_DURATION = 5  # minutes

# --- Utility Functions ---

def read_json_file(file_path):
    """Reads and returns data from a JSON file."""
    if not os.path.exists(file_path):
        return {} if file_path in [CHART_DATA_FILE, COMPARISON_FILE] else []
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError:
        print(f"Error decoding JSON from {file_path}. Returning empty data.")
        return {} if file_path in [CHART_DATA_FILE, COMPARISON_FILE] else []

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
        (ASSETS_FILE, []),
        (CHART_DATA_FILE, {}),
        (COMPARISON_FILE, []),
        (DAILY_PROFIT_FILE, []),
        (PRICES_FILE, {})  # اضافه کردن فایل قیمت‌ها
    ]
    
    for file_path, default_data in files_to_init:
        if not os.path.exists(file_path):
            write_json_file(file_path, default_data)
    
    # Ensure RIAL_WALLET exists
    assets = read_json_file(ASSETS_FILE)
    if not any(asset['symbol'] == RIAL_WALLET_SYMBOL for asset in assets):
        assets.append({
            "id": str(uuid.uuid4()),
            "symbol": RIAL_WALLET_SYMBOL,
            "title": "کیف پول ریالی",
            "transactions": []
        })
        write_json_file(ASSETS_FILE, assets)

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
        
        # روش ۱: جستجوی مستقیم
        target_p = soup.find('p', attrs={'data-v-31f00d67': ''})
        if target_p:
            b_tag = target_p.find('b', class_='text-white font-sans')
            if b_tag:
                price_text = b_tag.text.strip().replace(',', '')
                try:
                    price = float(price_text)
                    # حذف رقم آخر (مثلاً 355105 → 35510)
                    adjusted_price = float(str(int(price))[:-1])
                    print(f"Found AYAR price: {price:,.0f} → Adjusted: {adjusted_price:,.0f} تومان")
                    return adjusted_price
                except ValueError:
                    print(f"Could not convert price: {price_text}")
        
        # روش ۲: جستجوی "آخرین قیمت"
        for p_tag in soup.find_all('p'):
            if 'آخرین قیمت' in p_tag.text:
                b_tags = p_tag.find_all('b', class_=lambda x: x and 'text-white' in x)
                for b in b_tags:
                    price_text = b.text.strip().replace(',', '')
                    if price_text.isdigit():
                        try:
                            price = float(price_text)
                            # حذف رقم آخر
                            adjusted_price = float(str(int(price))[:-1])
                            print(f"Found AYAR price (method 2): {price:,.0f} → Adjusted: {adjusted_price:,.0f} تومان")
                            return adjusted_price
                        except ValueError:
                            continue
        
        # روش ۳: جستجوی عدد
        numbers = re.findall(r'\b\d{1,3}(?:,\d{3})*\b', soup.text)
        for num in numbers:
            clean_num = num.replace(',', '')
            if clean_num.isdigit():
                price = int(clean_num)
                if 300000 <= price <= 400000:
                    # حذف رقم آخر
                    adjusted_price = float(str(price)[:-1])
                    print(f"Found AYAR price (method 3): {price:,.0f} → Adjusted: {adjusted_price:,.0f} تومان")
                    return float(adjusted_price)
        
        print("Warning: Could not find AYAR price on the page")
        # قیمت پیش‌فرض با حذف رقم آخر
        default_price = 355105
        adjusted_default = float(str(default_price)[:-1])
        return adjusted_default
        
    except requests.RequestException as e:
        print(f"Error fetching AYAR price: {e}")
        default_price = 355105
        adjusted_default = float(str(default_price)[:-1])
        return adjusted_default
    except Exception as e:
        print(f"Unexpected error in get_gold_price: {e}")
        default_price = 355105
        adjusted_default = float(str(default_price)[:-1])
        return adjusted_default

def read_comparison_data():
    """Reads comparison data from JSON file."""
    return read_json_file(COMPARISON_FILE)

def write_comparison_data(data):
    """Writes comparison data to JSON file."""
    write_json_file(COMPARISON_FILE, data)

def read_daily_profit():
    """Reads daily profit data from JSON file."""
    return read_json_file(DAILY_PROFIT_FILE)

def write_daily_profit(data):
    """Writes daily profit data to JSON file."""
    write_json_file(DAILY_PROFIT_FILE, data)

# --- Price Fetching Logic ---

def use_cached_prices(error_message=""):
    """Use cached prices when API is unavailable."""
    global current_prices
    
    try:
        cached_prices = read_prices()
        if cached_prices:
            current_prices['categorized'] = cached_prices
            current_prices['last_updated'] = datetime.now(timezone.utc).isoformat()
            current_prices['api_error'] = error_message
            
            # Extract USD and Gold prices from cached data
            for category in cached_prices.values():
                if isinstance(category, list):
                    for item in category:
                        if item['symbol'] == 'USD':
                            current_prices['USD'] = item['price']
                        elif item['symbol'] == 'GOL18':
                            current_prices['GOL18'] = item['price']
                        elif item['symbol'] == 'USDT':
                            current_prices['usdt_price'] = item['price']
            
            print(f"⚠️ Using cached prices due to: {error_message}")
        else:
            print("⚠️ No cached prices available")
            # Set default prices if no cache
            current_prices['USD'] = 124050.0
            current_prices['GOL18'] = 12689180.0
            current_prices['api_error'] = error_message
    except Exception as e:
        print(f"❌ Error reading cached prices: {e}")
        current_prices['api_error'] = f"{error_message} (و خطا در خواندن کش)"

def fetch_prices():
    """Fetches real-time prices from external APIs with fallback to cached prices."""
    global current_prices
    
    # Check if we're rate limited
    rate_limited_until = current_prices.get('rate_limited_until')
    if rate_limited_until:
        try:
            limited_until = datetime.fromisoformat(rate_limited_until)
            now = datetime.now(timezone.utc)
            if now < limited_until:
                remaining = (limited_until - now).total_seconds() / 60
                print(f"⚠️ Rate limited. Using cached prices for {remaining:.1f} more minutes.")
                use_cached_prices("محدودیت درخواست")
                return
            else:
                # Remove rate limit flag if expired
                if 'rate_limited_until' in current_prices:
                    del current_prices['rate_limited_until']
        except Exception as e:
            print(f"Error parsing rate limit time: {e}")
    
    # Check cache validity
    last_updated = current_prices.get('last_updated')
    if last_updated:
        try:
            last_time = datetime.fromisoformat(last_updated)
            now = datetime.now(timezone.utc)
            minutes_diff = (now - last_time).total_seconds() / 60
            
            # If less than cache duration, use cache
            if minutes_diff < PRICE_CACHE_DURATION:
                print(f"🔄 Using cached prices (updated {minutes_diff:.1f} minutes ago)")
                return
        except Exception as e:
            print(f"Error parsing last updated time: {e}")
    
    # 1. Fetch API data with proper headers
    api_url = 'https://baha24.com/api/v1/price'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://baha24.com/'
    }
    
    try:
        print("📡 Fetching prices from baha24.com...")
        response = requests.get(api_url, headers=headers, timeout=15)
        
        # Handle rate limiting
        if response.status_code == 429:
            print("⚠️ Rate limited by baha24.com API. Using cached prices.")
            current_prices['rate_limited_until'] = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
            use_cached_prices("محدودیت درخواست از API")
            return
        
        response.raise_for_status()
        data = response.json()
        
        # 2. Process API data
        processed_prices = {}
        for asset_type in ASSET_TYPES.keys():
            processed_prices[asset_type] = []

        # Add RIAL_WALLET price (always 1 Toman)
        current_prices[RIAL_WALLET_SYMBOL] = 1.0

        # First pass: find USDT price
        usdt_price = 0
        for item in data:
            if item['symbol'] == 'USDT' and 'sell' in item:
                usdt_price = float(item['sell'])
                break
        
        # Second pass: process all items
        for item in data:
            symbol = item['symbol']
            
            # Use 'sell' price from API
            if 'sell' in item:
                price = float(item['sell'])
            else:
                print(f"Warning: 'sell' field not found for {symbol}")
                continue
                
            title = item['title']
            
            if symbol in ALL_SYMBOLS:
                asset_type = ALL_SYMBOLS[symbol]
                
                # Convert ALL crypto prices from USD to Toman
                if asset_type == 'crypto':
                    if usdt_price > 0:
                        # All crypto prices from API are in USD, convert to Toman
                        price_in_toman = price * usdt_price
                        price_data = {
                            'symbol': symbol,
                            'title': title,
                            'price': price_in_toman,  # Price in Toman
                            'toman_price': price_in_toman,
                            'usd_price': price,  # Keep original USD price
                            'last_update': item.get('last_update', '')
                        }
                    else:
                        print(f"Warning: USDT price not found for {symbol}")
                        continue
                else:
                    # For non-crypto assets, price is already in Toman
                    price_data = {
                        'symbol': symbol,
                        'title': title,
                        'price': price,
                        'toman_price': price,
                        'usd_price': price / usdt_price if usdt_price > 0 and symbol != 'USDT' else None,
                        'last_update': item.get('last_update', '')
                    }
                
                processed_prices[asset_type].append(price_data)
                current_prices[symbol] = price_data['price']
        
        # 3. Fetch and add AYAR
        ayar_price = get_gold_price()
        if ayar_price:
            # Add to gold_coin category
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
            print(f"✓ AYAR added to gold_coin: {ayar_price:,.0f} تومان")
        
        # 4. Sort categories for better display
        for category in processed_prices:
            processed_prices[category].sort(key=lambda x: x['symbol'])
        
        # Update global state
        current_prices['categorized'] = processed_prices
        current_prices['last_updated'] = datetime.now(timezone.utc).isoformat()
        current_prices['usdt_price'] = usdt_price
        
        # Save to prices.json cache
        write_prices(processed_prices)
        
        # Clear any API error flag
        if 'api_error' in current_prices:
            del current_prices['api_error']
        
        # Log summary
        print(f"✅ Price fetching completed and saved to cache. USDT price: {usdt_price:,.0f} تومان")
        for category, items in processed_prices.items():
            if items:
                sample = items[0]
                print(f"  {category}: {len(items)} items, sample: {sample['symbol']} = {sample['price']:,.0f} تومان")
        
    except requests.RequestException as e:
        print(f"❌ Error fetching prices: {e}")
        use_cached_prices(f"خطا در ارتباط با سرور: {str(e)}")
    except Exception as e:
        print(f"❌ Unexpected error in fetch_prices: {e}")
        use_cached_prices("خطای غیرمنتظره در دریافت قیمت‌ها")

# --- Core Logic ---

def aggregate_assets(assets):
    """
    Aggregates transactions for each asset to calculate current quantity,
    break-even price, and total cost.
    """
    aggregated = []
    
    for asset in assets:
        symbol = asset['symbol']
        transactions = sorted(asset.get('transactions', []), key=lambda x: x['date'])
        
        # Initialize
        total_quantity = decimal.Decimal('0')
        total_cost = decimal.Decimal('0')
        buy_quantity_sum = decimal.Decimal('0') 
        buy_cost_sum = decimal.Decimal('0')

        # Processing transactions
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
                if symbol == RIAL_WALLET_SYMBOL:
                    if tx_type == 'deposit':
                        total_quantity += tx_quantity
                    elif tx_type == 'withdrawal':
                        total_quantity -= tx_quantity

            # Store processed transaction
            tx['quantity'] = str(tx_quantity)
            if tx_type in ['buy', 'sell', 'save_profit']:
                tx['price_per_unit'] = str(tx_price)
                tx['cost'] = str(tx_cost)
            processed_transactions.append(tx)

        # Final calculations
        current_price = decimal.Decimal(str(current_prices.get(symbol, 0)))
        
        break_even_price = decimal.Decimal('0')
        if buy_quantity_sum > 0:
            break_even_price = buy_cost_sum / buy_quantity_sum
        
        current_value = total_quantity * current_price
        
        if symbol != RIAL_WALLET_SYMBOL:
            cost_basis = buy_cost_sum
            profit_loss = current_value - cost_basis
            return_pct = (profit_loss / cost_basis) * 100 if cost_basis > 0 else 0
        else:
            cost_basis = total_quantity
            profit_loss = decimal.Decimal('0')
            return_pct = 0
            
        aggregated.append({
            'id': asset['id'],
            'symbol': symbol,
            'title': asset['title'],
            'type': ALL_SYMBOLS.get(symbol, 'wallet') if symbol != RIAL_WALLET_SYMBOL else 'wallet',
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

def update_chart_data():
    """Calculates and stores the total portfolio value for chart history."""
    global allAssets
    
    assets = read_json_file(ASSETS_FILE)
    aggregated_assets = aggregate_assets(assets)
    allAssets = aggregated_assets
    
    total_value = decimal.Decimal('0')
    for asset in aggregated_assets:
        if asset['symbol'] != RIAL_WALLET_SYMBOL:
            total_value += decimal.Decimal(asset['current_value'])
        else:
            total_value += decimal.Decimal(asset['total_quantity'])
    
    chart_data = read_json_file(CHART_DATA_FILE)
    today = datetime.now().strftime('%Y-%m-%d')
    chart_data[today] = float(total_value)
    
    write_json_file(CHART_DATA_FILE, chart_data)
    print(f"📊 Chart updated: {today} = {float(total_value):,.0f} تومان")

# --- Value Analysis Functions ---

def update_value_analysis():
    """Updates value analysis data with current portfolio value and prices."""
    try:
        # Get current prices
        usd_price = current_prices.get('USD', 0)
        gold_price = current_prices.get('GOL18', 0)
        
        if usd_price <= 0 or gold_price <= 0:
            print("⚠️ Cannot update value analysis: prices not available")
            return
        
        # Calculate total portfolio value
        assets = read_json_file(ASSETS_FILE)
        aggregated = aggregate_assets(assets)
        
        total_value = decimal.Decimal('0')
        for asset in aggregated:
            if asset['symbol'] != RIAL_WALLET_SYMBOL:
                total_value += decimal.Decimal(asset['current_value'])
            else:
                total_value += decimal.Decimal(asset['total_quantity'])
        
        # Calculate equivalents
        total_usd = float(total_value) / usd_price if usd_price > 0 else 0
        total_gold = float(total_value) / gold_price if gold_price > 0 else 0
        
        # Get comparison data
        comparison_data = read_comparison_data()
        
        # Add/update today's entry
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Check if entry for today exists
        existing_index = next((i for i, entry in enumerate(comparison_data) if entry['date'] == today), -1)
        
        new_entry = {
            'date': today,
            'total_value_toman': float(total_value),
            'usd_price': usd_price,
            'gold_price_per_gram': gold_price,
            'equivalent_usd': total_usd,
            'equivalent_gold_grams': total_gold
        }
        
        if existing_index >= 0:
            # Update existing entry
            comparison_data[existing_index] = new_entry
            print(f"🔄 Updated value analysis for {today}")
        else:
            # Add new entry
            comparison_data.append(new_entry)
            print(f"➕ Added value analysis for {today}")
        
        # Keep only last 365 days
        if len(comparison_data) > 365:
            comparison_data = comparison_data[-365:]
        
        write_comparison_data(comparison_data)
        print(f"📈 Value analysis updated for {today}")
        
    except Exception as e:
        print(f"❌ Error updating value analysis: {e}")

def get_value_analysis_changes():
    """Calculates changes in value analysis compared to previous days."""
    try:
        comparison_data = read_comparison_data()
        if len(comparison_data) < 2:
            return None
        
        # Sort by date
        sorted_data = sorted(comparison_data, key=lambda x: x['date'])
        
        latest = sorted_data[-1]
        previous = sorted_data[-2]
        
        changes = {
            'date': latest['date'],
            'total_value_toman': latest['total_value_toman'],
            'usd_price': latest['usd_price'],
            'gold_price_per_gram': latest['gold_price_per_gram'],
            'equivalent_usd': latest['equivalent_usd'],
            'equivalent_gold_grams': latest['equivalent_gold_grams'],
            'usd_change': 0,
            'gold_change': 0,
            'usd_change_percent': 0,
            'gold_change_percent': 0
        }
        
        # Calculate changes if we have previous data
        if previous['equivalent_usd'] > 0:
            changes['usd_change'] = latest['equivalent_usd'] - previous['equivalent_usd']
            changes['usd_change_percent'] = (changes['usd_change'] / previous['equivalent_usd']) * 100
        
        if previous['equivalent_gold_grams'] > 0:
            changes['gold_change'] = latest['equivalent_gold_grams'] - previous['equivalent_gold_grams']
            changes['gold_change_percent'] = (changes['gold_change'] / previous['equivalent_gold_grams']) * 100
        
        return changes
        
    except Exception as e:
        print(f"❌ Error calculating value analysis changes: {e}")
        return None

def calculate_daily_profit():
    """Calculates and saves daily profit/loss with correct yesterday comparison."""
    global allAssets
    
    try:
        assets = read_json_file(ASSETS_FILE)
        aggregated_assets = aggregate_assets(assets)
        allAssets = aggregated_assets
        
        # Calculate total portfolio value (شامل کیف پول ریالی)
        total_value = decimal.Decimal('0')
        total_cost_basis = decimal.Decimal('0')
        
        for asset in aggregated_assets:
            if asset['symbol'] != RIAL_WALLET_SYMBOL:
                total_value += decimal.Decimal(asset['current_value'])
                total_cost_basis += decimal.Decimal(asset['cost_basis'])
            else:
                # برای کیف پول ریالی، total_quantity = موجودی
                total_value += decimal.Decimal(asset['total_quantity'])
        
        # Get daily profit data
        daily_profit_data = read_daily_profit()
        today = datetime.now().strftime('%Y-%m-%d')
        
        # پیدا کردن ارزش دیروز به درستی
        yesterday_value = None
        yesterday = datetime.now() - timedelta(days=1)
        yesterday_str = yesterday.strftime('%Y-%m-%d')
        
        # جستجوی رکورد دقیق دیروز
        for entry in daily_profit_data:
            if entry['date'] == yesterday_str:
                yesterday_value = decimal.Decimal(str(entry['total_value']))
                print(f"✅ Found yesterday's value from {yesterday_str}: {yesterday_value:,.0f}")
                break
        
        # اگر دیروز پیدا نشد، از آخرین رکورد قبل از امروز استفاده کن
        if yesterday_value is None and daily_profit_data:
            # مرتب کردن بر اساس تاریخ
            sorted_data = sorted(daily_profit_data, key=lambda x: x['date'])
            
            # پیدا کردن آخرین تاریخ قبل از امروز
            prev_entries = [e for e in sorted_data if e['date'] < today]
            if prev_entries:
                latest_entry = prev_entries[-1]
                yesterday_value = decimal.Decimal(str(latest_entry['total_value']))
                print(f"⚠️ Using {latest_entry['date']} as yesterday's value: {yesterday_value:,.0f}")
            else:
                print("ℹ️ No previous day data found for comparison")
        
        # محاسبه تغییر روزانه
        if yesterday_value is not None and yesterday_value > 0:
            daily_change = total_value - yesterday_value
            daily_change_percent = (daily_change / yesterday_value) * 100
        else:
            daily_change = decimal.Decimal('0')
            daily_change_percent = 0
            print("ℹ️ No valid yesterday value found, daily change set to 0")
        
        # محاسبه سود کل از دارایی‌های غیرریالی
        total_profit = decimal.Decimal('0')
        for asset in aggregated_assets:
            if asset['symbol'] != RIAL_WALLET_SYMBOL:
                total_profit += decimal.Decimal(asset['profit_loss'])
        
        # درصد سود کل
        total_profit_percent = (total_profit / total_cost_basis * 100) if total_cost_basis > 0 else 0
        
        # ذخیره یا آپدیت رکورد امروز
        new_entry = {
            'date': today,
            'total_value': float(total_value),
            'total_profit': float(total_profit),
            'profit_percent': float(total_profit_percent),
            'daily_change': float(daily_change),
            'daily_change_percent': float(daily_change_percent),
            'asset_count': len([a for a in assets if a['symbol'] != 'RIAL_WALLET' and decimal.Decimal(a.get('total_quantity', 0)) > 0]),
            'yesterday_value': float(yesterday_value) if yesterday_value else None,
            'timestamp': datetime.now().isoformat()
        }
        
        # بررسی وجود رکورد امروز
        existing_index = -1
        for i, entry in enumerate(daily_profit_data):
            if entry['date'] == today:
                existing_index = i
                break
        
        if existing_index >= 0:
            daily_profit_data[existing_index] = new_entry
            print(f"🔄 Updated existing entry for {today}")
        else:
            daily_profit_data.append(new_entry)
            print(f"➕ Added new entry for {today}")
        
        # نگه داشتن فقط 90 روز آخر
        if len(daily_profit_data) > 90:
            daily_profit_data = daily_profit_data[-90:]
        
        write_daily_profit(daily_profit_data)
        
        # لاگ اطلاعات
        print(f"📊 Daily Profit Summary for {today}:")
        print(f"   Total Value: {float(total_value):,.0f} تومان")
        print(f"   Yesterday Value: {float(yesterday_value) if yesterday_value else 'N/A':,.0f}")
        print(f"   Daily Change: {float(daily_change):,.0f} تومان ({daily_change_percent:.2f}%)")
        print(f"   Total Profit: {float(total_profit):,.0f} تومان ({total_profit_percent:.2f}%)")
        
        return new_entry
        
    except Exception as e:
        print(f"❌ Error calculating daily profit: {e}")
        import traceback
        traceback.print_exc()
        return None

# --- Routes ---

@app.route('/')
def index():
    """Serve the main HTML page."""
    return render_template('index.html')

@app.route('/api/assets', methods=['GET'])
def get_assets():
    """Returns aggregated asset data."""
    global allAssets
    assets = read_json_file(ASSETS_FILE)
    if not current_prices.get('categorized'):
        fetch_prices()
    aggregated_data = aggregate_assets(assets)
    allAssets = aggregated_data
    return jsonify(aggregated_data)

@app.route('/api/prices', methods=['GET'])
def get_prices():
    """Returns categorized real-time prices."""
    if 'categorized' not in current_prices or not current_prices['categorized']:
        fetch_prices()
    
    # Return prices with any API error message
    result = current_prices.get('categorized', {})
    if 'api_error' in current_prices:
        result['api_error'] = current_prices['api_error']
    if 'last_updated' in current_prices:
        result['last_updated'] = current_prices['last_updated']
    
    return jsonify(result)

@app.route('/api/chart-data', methods=['GET'])
def get_chart_data():
    """Returns portfolio chart data."""
    chart_data = read_json_file(CHART_DATA_FILE)
    return jsonify(chart_data)

@app.route('/api/comparison-data', methods=['GET'])
def get_comparison_data():
    """Returns comparison data."""
    comparison_data = read_comparison_data()
    return jsonify(comparison_data)

@app.route('/api/value-analysis', methods=['GET'])
def get_value_analysis():
    """Returns value analysis data with changes."""
    try:
        changes = get_value_analysis_changes()
        if changes:
            return jsonify(changes)
        else:
            # Return latest data even without changes
            comparison_data = read_comparison_data()
            if comparison_data:
                latest = sorted(comparison_data, key=lambda x: x['date'])[-1]
                return jsonify(latest)
            return jsonify({})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/daily-profit', methods=['GET'])
def get_daily_profit():
    """Returns daily profit data."""
    try:
        daily_data = read_daily_profit()
        return jsonify(daily_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/today-profit', methods=['GET'])
def get_today_profit():
    """Returns today's profit data."""
    try:
        daily_data = read_daily_profit()
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Find today's entry
        today_entry = next((entry for entry in daily_data if entry['date'] == today), None)
        
        if today_entry:
            return jsonify(today_entry)
        else:
            # Calculate fresh if not exists
            new_entry = calculate_daily_profit()
            if new_entry:
                return jsonify(new_entry)
            else:
                return jsonify({'error': 'Could not calculate daily profit'}), 500
                
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/transactions', methods=['POST'])
def add_transaction():
    """Adds a new transaction."""
    data = request.json
    
    required_fields = ['symbol', 'type', 'quantity']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400

    tx_type = data['type']
    symbol = data['symbol']
    quantity = data['quantity']
    
    if tx_type in ['buy', 'sell', 'save_profit'] and 'price_per_unit' not in data:
        return jsonify({'error': 'price_per_unit is required'}), 400

    assets = read_json_file(ASSETS_FILE)
    
    # Check wallet balance for buy transactions
    if tx_type == 'buy' and symbol != RIAL_WALLET_SYMBOL:
        rial_wallet = next((a for a in assets if a['symbol'] == RIAL_WALLET_SYMBOL), None)
        if rial_wallet:
            wallet_balance = sum(
                decimal.Decimal(tx['quantity']) if tx['type'] == 'deposit' else -decimal.Decimal(tx['quantity'])
                for tx in rial_wallet.get('transactions', [])
            )
            total_cost = decimal.Decimal(str(quantity)) * decimal.Decimal(str(data['price_per_unit']))
            
            if total_cost > wallet_balance:
                return jsonify({
                    'error': f'موجودی کیف پول کافی نیست. موجودی: {wallet_balance:,.0f} تومان، مورد نیاز: {total_cost:,.0f} تومان'
                }), 400
    
    # Find or create asset
    asset_group = next((a for a in assets if a['symbol'] == symbol), None)
    
    if not asset_group and symbol != RIAL_WALLET_SYMBOL:
        asset_title = symbol
        for category in current_prices.get('categorized', {}).values():
            for item in category:
                if item['symbol'] == symbol:
                    asset_title = item['title']
                    break
        
        asset_group = {
            "id": str(uuid.uuid4()),
            "symbol": symbol,
            "title": asset_title,
            "transactions": []
        }
        assets.append(asset_group)
    elif symbol == RIAL_WALLET_SYMBOL:
        asset_group = next((a for a in assets if a['symbol'] == RIAL_WALLET_SYMBOL), None)
    
    if not asset_group:
         return jsonify({'error': 'Asset not found'}), 400

    # Create transaction
    transaction = {
        'transaction_id': str(uuid.uuid4()),
        'date': data.get('date', datetime.now(timezone.utc).isoformat()),
        'type': tx_type,
        'quantity': str(quantity),
        'category': data.get('category', 'بدون دسته‌بندی'),
        'comment': data.get('comment', ''),
    }

    if tx_type in ['buy', 'sell', 'save_profit']:
        transaction['price_per_unit'] = str(data['price_per_unit'])
    
    # Handle save_profit
    if tx_type == 'save_profit':
        asset_group['transactions'].append(transaction)
        
        # Add deposit to RIAL_WALLET
        rial_wallet = next((a for a in assets if a['symbol'] == RIAL_WALLET_SYMBOL), None)
        transfer_amount = decimal.Decimal(str(quantity)) * decimal.Decimal(str(data['price_per_unit']))
        
        if rial_wallet:
             rial_wallet['transactions'].append({
                'transaction_id': str(uuid.uuid4()),
                'date': data.get('date', datetime.now(timezone.utc).isoformat()),
                'type': 'deposit',
                'quantity': str(transfer_amount),
                'price_per_unit': '1',
                'category': data.get('category', 'سود سیو شده'),
                'comment': f"انتقال سود سیو شده از {asset_group['title']}"
            })
    
    elif tx_type == 'buy':
        # Deduct from wallet
        rial_wallet = next((a for a in assets if a['symbol'] == RIAL_WALLET_SYMBOL), None)
        purchase_amount = decimal.Decimal(str(quantity)) * decimal.Decimal(str(data['price_per_unit']))
        
        if rial_wallet:
            rial_wallet['transactions'].append({
                'transaction_id': str(uuid.uuid4()),
                'date': data.get('date', datetime.now(timezone.utc).isoformat()),
                'type': 'withdrawal',
                'quantity': str(purchase_amount),
                'price_per_unit': '1',
                'category': data.get('category', 'خرید دارایی'),
                'comment': f"خرید {quantity} واحد {asset_group['title']}"
            })
        
        asset_group['transactions'].append(transaction)
        
    elif tx_type == 'sell':
        asset_group['transactions'].append(transaction)
        
        # Add to wallet
        rial_wallet = next((a for a in assets if a['symbol'] == RIAL_WALLET_SYMBOL), None)
        sale_amount = decimal.Decimal(str(quantity)) * decimal.Decimal(str(data['price_per_unit']))
        
        if rial_wallet:
            rial_wallet['transactions'].append({
                'transaction_id': str(uuid.uuid4()),
                'date': data.get('date', datetime.now(timezone.utc).isoformat()),
                'type': 'deposit',
                'quantity': str(sale_amount),
                'price_per_unit': '1',
                'category': data.get('category', 'فروش دارایی'),
                'comment': f"فروش {quantity} واحد {asset_group['title']}"
            })
        
    elif tx_type in ['deposit', 'withdrawal']:
        if symbol == RIAL_WALLET_SYMBOL:
            asset_group['transactions'].append(transaction)
        else:
            return jsonify({'error': f"Transaction type only valid for {RIAL_WALLET_SYMBOL}"}), 400
    
    write_json_file(ASSETS_FILE, assets)
    update_chart_data()
    update_value_analysis()
    calculate_daily_profit()
    print(f"✅ Transaction added: {tx_type} {quantity} {symbol}")
    return jsonify({'success': True}), 200

@app.route('/api/transactions/<transaction_id>', methods=['DELETE'])
def delete_transaction(transaction_id):
    """Deletes a specific transaction."""
    assets = read_json_file(ASSETS_FILE)
    
    transaction_found = False
    
    for asset in assets:
        deleted_tx = next((tx for tx in asset.get('transactions', []) if tx['transaction_id'] == transaction_id), None)
        asset['transactions'] = [tx for tx in asset.get('transactions', []) if tx['transaction_id'] != transaction_id]
        
        if deleted_tx:
            transaction_found = True
            
            if deleted_tx['type'] == 'save_profit':
                rial_wallet = next((a for a in assets if a['symbol'] == RIAL_WALLET_SYMBOL), None)
                if rial_wallet:
                    transfer_amount = decimal.Decimal(deleted_tx['quantity']) * decimal.Decimal(deleted_tx['price_per_unit'])
                    rial_wallet['transactions'] = [
                        tx for tx in rial_wallet['transactions'] 
                        if not (tx['type'] == 'deposit' and 
                                decimal.Decimal(tx['quantity']) == transfer_amount)
                    ]
            elif deleted_tx['type'] == 'buy':
                rial_wallet = next((a for a in assets if a['symbol'] == RIAL_WALLET_SYMBOL), None)
                if rial_wallet:
                    purchase_amount = decimal.Decimal(deleted_tx['quantity']) * decimal.Decimal(deleted_tx['price_per_unit'])
                    rial_wallet['transactions'] = [
                        tx for tx in rial_wallet['transactions'] 
                        if not (tx['type'] == 'withdrawal' and 
                                decimal.Decimal(tx['quantity']) == purchase_amount)
                    ]
            elif deleted_tx['type'] == 'sell':
                rial_wallet = next((a for a in assets if a['symbol'] == RIAL_WALLET_SYMBOL), None)
                if rial_wallet:
                    sale_amount = decimal.Decimal(deleted_tx['quantity']) * decimal.Decimal(deleted_tx['price_per_unit'])
                    rial_wallet['transactions'] = [
                        tx for tx in rial_wallet['transactions'] 
                        if not (tx['type'] == 'deposit' and 
                                decimal.Decimal(tx['quantity']) == sale_amount)
                    ]
            break
    
    if not transaction_found:
        return jsonify({'error': 'Transaction not found'}), 404

    assets_to_keep = [asset for asset in assets if asset.get('transactions') or asset['symbol'] == RIAL_WALLET_SYMBOL]
    write_json_file(ASSETS_FILE, assets_to_keep)
    update_chart_data()
    update_value_analysis()
    calculate_daily_profit()
    print(f"🗑️ Transaction deleted: {transaction_id}")
    return jsonify({'success': True}), 200

@app.route('/api/transactions/<transaction_id>', methods=['PUT'])
def update_transaction(transaction_id):
    """Updates an existing transaction."""
    data = request.json
    
    assets = read_json_file(ASSETS_FILE)
    transaction_found = False
    
    for asset in assets:
        for i, tx in enumerate(asset.get('transactions', [])):
            if tx['transaction_id'] == transaction_id:
                transaction_found = True
                
                # Save old transaction data
                old_tx = tx.copy()
                
                # Update transaction fields
                for key, value in data.items():
                    if key in ['type', 'quantity', 'price_per_unit', 'category', 'comment', 'date']:
                        if value is not None:
                            tx[key] = str(value)
                
                # Handle wallet updates for buy/sell/save_profit
                if old_tx['type'] in ['buy', 'sell', 'save_profit']:
                    rial_wallet = next((a for a in assets if a['symbol'] == RIAL_WALLET_SYMBOL), None)
                    if rial_wallet:
                        # Remove old wallet transaction
                        old_amount = decimal.Decimal(old_tx['quantity']) * decimal.Decimal(old_tx['price_per_unit'])
                        if old_tx['type'] == 'buy':
                            rial_wallet['transactions'] = [
                                t for t in rial_wallet['transactions'] 
                                if not (t['type'] == 'withdrawal' and 
                                        decimal.Decimal(t['quantity']) == old_amount)
                            ]
                        elif old_tx['type'] == 'sell':
                            rial_wallet['transactions'] = [
                                t for t in rial_wallet['transactions'] 
                                if not (t['type'] == 'deposit' and 
                                        decimal.Decimal(t['quantity']) == old_amount)
                            ]
                        elif old_tx['type'] == 'save_profit':
                            rial_wallet['transactions'] = [
                                t for t in rial_wallet['transactions'] 
                                if not (t['type'] == 'deposit' and 
                                        decimal.Decimal(t['quantity']) == old_amount)
                            ]
                        
                        # Add new wallet transaction if needed
                        if tx['type'] in ['buy', 'sell', 'save_profit']:
                            new_amount = decimal.Decimal(tx['quantity']) * decimal.Decimal(tx['price_per_unit'])
                            if tx['type'] == 'buy':
                                rial_wallet['transactions'].append({
                                    'transaction_id': str(uuid.uuid4()),
                                    'date': tx.get('date', datetime.now(timezone.utc).isoformat()),
                                    'type': 'withdrawal',
                                    'quantity': str(new_amount),
                                    'price_per_unit': '1',
                                    'category': tx.get('category', 'خرید دارایی'),
                                    'comment': f"خرید {tx['quantity']} واحد {asset['title']}"
                                })
                            elif tx['type'] == 'sell':
                                rial_wallet['transactions'].append({
                                    'transaction_id': str(uuid.uuid4()),
                                    'date': tx.get('date', datetime.now(timezone.utc).isoformat()),
                                    'type': 'deposit',
                                    'quantity': str(new_amount),
                                    'price_per_unit': '1',
                                    'category': tx.get('category', 'فروش دارایی'),
                                    'comment': f"فروش {tx['quantity']} واحد {asset['title']}"
                                })
                            elif tx['type'] == 'save_profit':
                                rial_wallet['transactions'].append({
                                    'transaction_id': str(uuid.uuid4()),
                                    'date': tx.get('date', datetime.now(timezone.utc).isoformat()),
                                    'type': 'deposit',
                                    'quantity': str(new_amount),
                                    'price_per_unit': '1',
                                    'category': tx.get('category', 'سود سیو شده'),
                                    'comment': f"انتقال سود سیو شده از {asset['title']}"
                                })
                
                # Update the asset's transaction
                asset['transactions'][i] = tx
                break
    
    if not transaction_found:
        return jsonify({'error': 'Transaction not found'}), 404
    
    write_json_file(ASSETS_FILE, assets)
    update_chart_data()
    update_value_analysis()
    calculate_daily_profit()
    print(f"✏️ Transaction updated: {transaction_id}")
    return jsonify({'success': True}), 200

# --- Initialization and Scheduler ---

def initialize_app():
    """Initialize the application on startup."""
    init_json_files()
    
    # Try to fetch fresh prices
    fetch_prices()
    
    # If fetch failed, load cached prices
    if 'categorized' not in current_prices or not current_prices['categorized']:
        cached_prices = read_prices()
        if cached_prices:
            current_prices['categorized'] = cached_prices
            print("✅ Loaded cached prices on startup")
        else:
            print("⚠️ No prices available on startup")
    
    # کمی تأخیر برای اطمینان از لود شدن قیمت‌ها
    import time
    time.sleep(2)
    
    update_chart_data()
    update_value_analysis()
    calculate_daily_profit()
    print("✅ Application initialized successfully")

# Initialize the scheduler
scheduler = BackgroundScheduler()

# Schedule regular tasks - کاهش فرکانس
scheduler.add_job(func=fetch_prices, trigger="interval", minutes=5)  # هر 5 دقیقه
scheduler.add_job(func=calculate_daily_profit, trigger="interval", hours=2)  # هر 2 ساعت
scheduler.add_job(func=update_chart_data, trigger="interval", hours=1)  # هر 1 ساعت
scheduler.add_job(func=update_value_analysis, trigger="interval", hours=3)  # هر 3 ساعت

scheduler.start()

# Initialize on startup
initialize_app()

# Shutdown scheduler on exit
atexit.register(lambda: scheduler.shutdown())

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)