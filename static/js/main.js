// ============================================================
//  Assetly - پلتفرم مدیریت پورتفوی
//  فایل اصلی جاوااسکریپت فرانت‌اند
//  نسخه: 3.0.0
// ============================================================

// ============================================================
//  بخش ۱: متغیرهای گلوبال
// ============================================================

// ---------- داده‌های قیمت و دارایی ----------
let allPrices = {};
let allAssets = [];

// ---------- نمودارها ----------
let portfolioChart = null;
let portfolioPieChart = null;

// ---------- تنظیمات خرید ----------
let purchaseMode = 'balance';

// ---------- تنظیمات نوار قیمت ----------
let tickerVisible = true;
let tickerAnimationFrame = null;
let tickerPosition = 0;
let tickerSpeed = 0.5;
let tickerPaused = false;
let tickerContainer = null;
let tickerContent = null;
let tickerContentWidth = 0;

// ---------- احراز هویت ----------
let currentUser = null;
let authToken = null;

// ---------- تنظیمات تم ----------
let currentTheme = 'dark';

// ---------- تنظیمات تراکنش‌ها ----------
let allTransactionsCache = [];
let showingAllTransactions = false;
const DEFAULT_TRANSACTION_COUNT = 3;

// ---------- جستجوی دارایی ----------
let allAssetOptions = [];
let assetSearchTimeout = null;

// ---------- نوتیفیکیشن ----------
let activeToast = null;
let toastTimeout = null;


// ============================================================
//  بخش ۲: ثابت‌ها و تنظیمات
// ============================================================

// ---------- نمادهای نمایشی در نوار قیمت ----------
const TICKER_SYMBOLS = {
    gold_coin: [
        'IR_GOLD_18K', 'IR_GOLD_24K', 'IR_COIN_BAHAR', 'IR_COIN_EMAMI',
        'IR_COIN_HALF', 'IR_COIN_QUARTER', 'IR_COIN_1G', 'XAUUSD'
    ],
    currency: ['USD', 'EUR', 'GBP', 'USDT_IRT', 'AED', 'CAD'],
    crypto: ['BTC', 'ETH', 'BNB', 'DOGE', 'ADA', 'ATOM', 'LINK', 'LTC']
};

// ---------- نام فارسی نمادها ----------
const SYMBOL_NAMES = {
    'IR_GOLD_18K': 'طلای ۱۸ عیار',
    'IR_GOLD_24K': 'طلای ۲۴ عیار',
    'IR_COIN_BAHAR': 'سکه بهار',
    'IR_COIN_EMAMI': 'سکه امامی',
    'IR_COIN_HALF': 'نیم سکه',
    'IR_COIN_QUARTER': 'ربع سکه',
    'IR_COIN_1G': 'سکه گرمی',
    'XAUUSD': 'انس طلا',
    'USD': 'دلار',
    'EUR': 'یورو',
    'GBP': 'پوند',
    'USDT_IRT': 'تتر',
    'AED': 'درهم',
    'CAD': 'دلار کانادا',
    'BTC': 'بیت‌کوین',
    'ETH': 'اتریوم',
    'BNB': 'بایننس',
    'DOGE': 'دوج‌کوین',
    'ADA': 'کاردانو',
    'ATOM': 'کازماس',
    'LINK': 'چین‌لینک',
    'LTC': 'لایت‌کوین'
};


// ============================================================
//  بخش ۳: سیستم نوتیفیکیشن (Toast)
// ============================================================

const showNotification = (message, type = 'success', duration = 5000) => {
    
    // نمایش نوتیفیکیشن مدرن در پایین-چپ صفحه
    // جایگزین alert‌های قدیمی

    // نوع‌های پشتیبانی شده: success, error, warning, info
    
    // // حذف نوتیفیکیشن قبلی
    if (activeToast) {
        clearTimeout(toastTimeout);
        activeToast.remove();
        activeToast = null;
    }

    // انتخاب آیکون
    let icon = '✅';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else if (type === 'warning') icon = '⚠️';
    else if (type === 'info') icon = 'ℹ️';

    // ساخت المنت
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <span class="toast-icon">${icon}</span>
            <span class="toast-message">${message}</span>
            <span class="toast-close" onclick="this.closest('.toast-notification').remove()">✕</span>
        </div>
        <div class="toast-progress-bar">
            <div class="toast-progress-fill" style="animation-duration: ${duration}ms;"></div>
        </div>
    `;

    document.body.appendChild(toast);
    activeToast = toast;

    // حذف خودکار
    toastTimeout = setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('toast-hiding');
            setTimeout(() => {
                if (toast.parentElement) toast.remove();
                if (activeToast === toast) activeToast = null;
            }, 300);
        }
    }, duration);

    // کلیک روی دکمه بستن
    toast.querySelector('.toast-close').addEventListener('click', () => {
        clearTimeout(toastTimeout);
        toast.classList.add('toast-hiding');
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
            if (activeToast === toast) activeToast = null;
        }, 300);
    });
};


// ============================================================
//  بخش ۴: توابع فرمت‌کننده
// ============================================================

const formatToman = (numberString) => {
    
    // فرمت عدد به صورت تومان با جداکننده فارسی
    // مثال: 1250000 → ۱,۲۵۰,۰۰۰ ت
    
    if (!numberString && numberString !== 0) return '0';
    const number = parseFloat(numberString);
    if (isNaN(number)) return '-';
    const formatted = number.toLocaleString('fa-IR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: number < 1000 ? 2 : 0
    });
    return `${formatted} ت`;
};

const formatPercent = (numberString) => {
    
    // فرمت درصد با علامت +/-
    // مثال: 12.5 → +12.50%
    
    if (!numberString && numberString !== 0) return '0.00%';
    const number = parseFloat(numberString);
    if (isNaN(number)) return '-';
    const sign = number >= 0 ? '+' : '';
    return `${sign}${number.toFixed(2)}%`;
};

const formatPrice = (price) => {
    
    // فرمت قیمت با دقت ۴ رقم اعشار
    // برای نمایش موجودی دارایی‌ها
    
    const num = parseFloat(price);
    if (isNaN(num)) return '0';
    return num.toLocaleString('fa-IR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4
    });
};

const getStatusColor = (value) => {
    
    // تشخیص کلاس رنگ بر اساس مثبت/منفی بودن مقدار
    // مثبت → success (سبز)
    // منفی → danger (قرمز)
    
    const num = parseFloat(value);
    return num >= 0 ? 'success' : 'danger';
};

const formatPersianDate = (dateString) => {
    
    // تبدیل تاریخ ISO به تاریخ شمسی با ساعت
    // مثال: 2024-01-20T14:30:00 → ۳۰ دی ۱۴۰۲، ۱۴:۳۰
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('fa-IR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateString;
    }
};


// ============================================================
//  بخش ۵: مدیریت تم (تاریک/روشن)
// ============================================================

const getSystemTheme = () => {
    
    // تشخیص تم سیستم عامل کاربر
    
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
    }
    return 'dark';
};

const setTheme = (theme) => {
    
    // تنظیم تم و اعمال تغییرات روی تمام کامپوننت‌ها
    // شامل نمودارها، متن‌ها و آیکون‌ها
    
    currentTheme = theme;

    if (theme === 'light') {
        // فعال‌سازی تم روشن
        document.body.classList.add('light-theme');

        const menuIcon = document.getElementById('theme-toggle-icon');
        const menuText = document.getElementById('theme-toggle-text');
        if (menuIcon) menuIcon.textContent = '☀️';
        if (menuText) menuText.textContent = 'تم روشن';

        // بروزرسانی رنگ نمودار خطی
        if (portfolioChart) {
            portfolioChart.options.scales.x.ticks.color = '#4b5563';
            portfolioChart.options.scales.y.ticks.color = '#4b5563';
            portfolioChart.options.scales.x.grid.color = '#e5e7eb';
            portfolioChart.options.scales.y.grid.color = '#e5e7eb';
            portfolioChart.update();
        }
    } else {
        // فعال‌سازی تم تاریک
        document.body.classList.remove('light-theme');

        const menuIcon = document.getElementById('theme-toggle-icon');
        const menuText = document.getElementById('theme-toggle-text');
        if (menuIcon) menuIcon.textContent = '🌙';
        if (menuText) menuText.textContent = 'تم تاریک';

        // بروزرسانی رنگ نمودار خطی
        if (portfolioChart) {
            portfolioChart.options.scales.x.ticks.color = '#8b949e';
            portfolioChart.options.scales.y.ticks.color = '#8b949e';
            portfolioChart.options.scales.x.grid.color = '#30363d';
            portfolioChart.options.scales.y.grid.color = '#30363d';
            portfolioChart.update();
        }
    }

    // بروزرسانی نمودار دایره‌ای
    if (portfolioPieChart) {
        portfolioPieChart.update();
    }

    // ذخیره در کوکی
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    document.cookie = `theme=${theme}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
};

const toggleTheme = () => {
    
    // تغییر تم بین تاریک و روشن
    
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
};

const initTheme = () => {
    
    // راه‌اندازی تم در لود اولیه
    // اولویت: تنظیمات کاربر > تم سیستم
    
    const cookies = document.cookie.split(';');
    let savedTheme = null;

    for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'theme') {
            savedTheme = value;
            break;
        }
    }

    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        setTheme(getSystemTheme());
    }

    // گوش دادن به تغییر تم سیستم
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
            // فقط اگر کاربر تنظیمات خودش رو ذخیره نکرده باشه
            const currentCookies = document.cookie.split(';');
            const hasUserPreference = currentCookies.some(c => c.trim().startsWith('theme='));
            if (!hasUserPreference) {
                setTheme(e.matches ? 'light' : 'dark');
            }
        });
    }
};


// ============================================================
//  بخش ۶: احراز هویت
// ============================================================

const checkAuth = async () => {
    
    // بررسی وضعیت ورود کاربر
    // ابتدا توکن را از localStorage و کوکی می‌خواند
    
    let token = localStorage.getItem('authToken');

    // اگر توکن در localStorage نیست، از کوکی بخون
    if (!token) {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'auth_token') {
                token = value;
                localStorage.setItem('authToken', token);
                break;
            }
        }
    }

    if (token) authToken = token;

    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const response = await fetch('/api/auth/me', { headers });
        if (response.ok) {
            currentUser = await response.json();
            updateUIForLoggedInUser();
            return true;
        }
    } catch (error) {
        console.log('⚠️ کاربر وارد نشده است');
    }

    updateUIForLoggedOutUser();
    return false;
};

const updateUIForLoggedInUser = () => {
    
    // بروزرسانی رابط کاربری برای کاربر وارد شده
    // مخفی کردن دکمه ورود، نمایش منوی کاربری
    
    document.getElementById('login-btn')?.classList.add('hidden');
    document.getElementById('user-menu-btn')?.classList.remove('hidden');

    const greeting = document.getElementById('user-greeting');
    if (greeting) greeting.textContent = 'پنل کاربری';

    const dropdownName = document.getElementById('dropdown-fullname');
    if (dropdownName) {
        dropdownName.textContent = `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`;
    }

    const dropdownEmail = document.getElementById('dropdown-email');
    if (dropdownEmail) dropdownEmail.textContent = currentUser?.email || '';
};

const updateUIForLoggedOutUser = () => {
    
    // بروزرسانی رابط کاربری برای کاربر خارج شده
    
    document.getElementById('login-btn')?.classList.remove('hidden');
    document.getElementById('user-menu-btn')?.classList.add('hidden');
    currentUser = null;
    authToken = null;
};

const showAuthModal = (mode = 'login') => {
    
    // نمایش مودال ورود/ثبت‌نام
    // mode: 'login' یا 'register'
    
    document.getElementById('auth-modal').classList.remove('hidden');
    document.getElementById('auth-message').classList.add('hidden');

    if (mode === 'login') {
        document.getElementById('auth-tab-login').classList.add('active', 'bg-blue-600', 'text-white');
        document.getElementById('auth-tab-login').classList.remove('text-gray-400');
        document.getElementById('auth-tab-register').classList.remove('active', 'bg-blue-600', 'text-white');
        document.getElementById('auth-tab-register').classList.add('text-gray-400');
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('auth-modal-title').textContent = 'ورود به حساب';
    } else {
        document.getElementById('auth-tab-register').classList.add('active', 'bg-blue-600', 'text-white');
        document.getElementById('auth-tab-register').classList.remove('text-gray-400');
        document.getElementById('auth-tab-login').classList.remove('active', 'bg-blue-600', 'text-white');
        document.getElementById('auth-tab-login').classList.add('text-gray-400');
        document.getElementById('register-form').classList.remove('hidden');
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('auth-modal-title').textContent = 'ثبت‌نام در سایت';
    }
};

const showAuthMessage = (message, type = 'error') => {
    
    // نمایش پیغام در مودال احراز هویت
    
    const msg = document.getElementById('auth-message');
    if (!msg) return;

    msg.textContent = message;
    msg.classList.remove('hidden', 'text-green-400', 'text-red-400', 'text-yellow-400');

    if (type === 'error') {
        msg.classList.add('text-red-400', 'bg-red-900/20', 'p-3', 'rounded-lg');
    } else if (type === 'success') {
        msg.classList.add('text-green-400', 'bg-green-900/20', 'p-3', 'rounded-lg');
    } else {
        msg.classList.add('text-yellow-400', 'bg-yellow-900/20', 'p-3', 'rounded-lg');
    }
};

const logout = async () => {
    
    // خروج از حساب کاربری
    // حذف توکن، داده‌های لوکال و رفرش صفحه
    
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
        });
    } catch (e) {
        // خطای شبکه مهم نیست - کاربر در هر حال خارج می‌شود
    }

    localStorage.removeItem('authToken');
    localStorage.removeItem('favoriteMarkets');
    localStorage.removeItem('investmentGoal');
    localStorage.removeItem('riskTestScore');
    localStorage.removeItem('riskTestAnswers');

    currentUser = null;
    authToken = null;

    updateUIForLoggedOutUser();
    document.getElementById('user-dropdown')?.classList.add('hidden');

    window.location.reload();
};

const openProfileModal = () => {
    
    // نمایش مودال ویرایش پروفایل
    
    document.getElementById('profile-first-name').value = currentUser?.first_name || '';
    document.getElementById('profile-last-name').value = currentUser?.last_name || '';
    document.getElementById('profile-email').value = currentUser?.email || '';
    document.getElementById('profile-phone').value = currentUser?.phone || '';
    document.getElementById('profile-modal').classList.remove('hidden');
};

const openChangePasswordModal = () => {
    
    // نمایش مودال تغییر رمز عبور
    
    document.getElementById('change-password-form').reset();
    document.getElementById('password-message').classList.add('hidden');
    document.getElementById('change-password-modal').classList.remove('hidden');
};


// ============================================================
//  بخش ۷: توابع ارتباط با API
// ============================================================

const fetchPrices = async () => {
    
    // دریافت قیمت‌های لحظه‌ای از سرور
    // بروزرسانی نوار قیمت، موجودی کیف پول و قدرت خرید
    
    try {
        const response = await fetch('/api/prices');
        if (!response.ok) throw new Error('Failed to fetch prices');

        const data = await response.json();
        allPrices = data;

        if (data.api_error) showApiErrorPopup(data.api_error);

        renderPriceTicker(allPrices);
        updateWalletBalanceDisplay();
        updatePurchasePowerBox();

    } catch (error) {
        console.error('❌ خطا در دریافت قیمت‌ها:', error);
        showApiErrorPopup('خطا در برقراری ارتباط با سرور قیمت‌ها');
    }
};

const fetchAssets = async () => {
    
    // دریافت دارایی‌های کاربر و بروزرسانی تمام بخش‌های مربوطه
    
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const response = await fetch('/api/assets', { headers });
        if (!response.ok) throw new Error('Failed to fetch assets');

        allAssets = await response.json();

        // بروزرسانی تمام بخش‌های وابسته
        renderAssetsDashboard(allAssets);
        loadRecentTransactions();
        updateWalletBalanceDisplay();
        updatePurchasePowerBox();
        updateDailyProfit();
        if (investmentGoal) updateGoalDisplay();

    } catch (error) {
        console.error('❌ خطا در دریافت دارایی‌ها:', error);
        document.getElementById('assets-table-body').innerHTML =
            '<tr><td colspan="7" class="py-4 text-center text-red-400">خطا در بارگذاری دارایی‌ها</td></tr>';
    }
};

const fetchChartData = async () => {
    
    // دریافت داده‌های نمودار ارزش پورتفوی
    
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const response = await fetch('/api/chart-data', { headers });
        if (!response.ok) throw new Error('Failed to fetch chart data');
        const data = await response.json();
        renderChart(data);
    } catch (error) {
        console.error('❌ خطا در دریافت داده‌های نمودار:', error);
    }
};

const updateDailyProfit = async () => {
    
    // دریافت و نمایش سود/زیان روزانه
    
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const response = await fetch('/api/today-profit', { headers });
        if (!response.ok) throw new Error('Failed to fetch daily profit');
        const data = await response.json();

        if (data.error) return;

        const dailyChange = data.daily_change || 0;
        const dailyPercent = data.daily_change_percent || 0;
        const yesterdayValue = data.yesterday_value || (data.total_value - data.daily_change);

        const dailyTomanEl = document.getElementById('daily-profit-toman');
        const dailyPercentEl = document.getElementById('daily-profit-percent');
        const yesterdayEl = document.getElementById('yesterday-value');

        if (dailyTomanEl) dailyTomanEl.textContent = formatToman(dailyChange);
        if (dailyPercentEl) dailyPercentEl.textContent = formatPercent(dailyPercent);
        if (yesterdayEl) yesterdayEl.textContent = formatToman(yesterdayValue);

        // تنظیم رنگ بر اساس مثبت/منفی
        if (dailyChange >= 0) {
            dailyTomanEl?.classList.remove('text-red-400');
            dailyTomanEl?.classList.add('text-green-400');
            dailyPercentEl?.classList.remove('text-red-400');
            dailyPercentEl?.classList.add('text-green-400');
        } else {
            dailyTomanEl?.classList.remove('text-green-400');
            dailyTomanEl?.classList.add('text-red-400');
            dailyPercentEl?.classList.remove('text-green-400');
            dailyPercentEl?.classList.add('text-red-400');
        }
    } catch (error) {
        console.error('❌ خطا در بروزرسانی سود روزانه:', error);
    }
};

const showApiErrorPopup = (message) => {
    
    // نمایش پاپ‌آپ خطای API در بالای صفحه
    // بعد از ۱۰ ثانیه خودکار بسته می‌شود
    
    const popup = document.createElement('div');
    popup.className = 'fixed top-4 right-4 z-50 bg-yellow-600 text-white p-4 rounded-lg shadow-lg max-w-sm';
    popup.innerHTML = `
        <div class="flex items-start">
            <svg class="w-6 h-6 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.998-.833-2.732 0L4.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
            </svg>
            <div>
                <p class="font-semibold">⚠️ اتصال به سرور قیمت‌ها</p>
                <p class="text-sm mt-1">${message}</p>
                <p class="text-xs mt-2 opacity-80">قیمت‌های قبلی نمایش داده می‌شوند</p>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" class="mr-auto text-white hover:text-gray-200">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        </div>
    `;
    document.body.appendChild(popup);
    setTimeout(() => { if (popup.parentElement) popup.remove(); }, 10000);
};


// ============================================================
//  بخش ۸: نوار قیمت (Ticker Bar)
// ============================================================

const renderPriceTicker = (prices) => {
    
    // رندر نوار قیمت‌های اسکرول‌شونده پایین صفحه
    // شامل طلا، ارز و رمزارز
    
    tickerContainer = document.getElementById('ticker-scroll');
    if (!tickerContainer) return;

    // پاک کردن انیمیشن قبلی
    if (tickerAnimationFrame) {
        cancelAnimationFrame(tickerAnimationFrame);
        tickerAnimationFrame = null;
    }

    if (!prices || Object.keys(prices).length === 0) {
        tickerContainer.innerHTML = '<div class="text-gray-500 text-sm py-2 px-4">منتظر قیمت‌ها...</div>';
        return;
    }

    // دسته‌بندی‌های نوار قیمت
    const categories = [
        { key: 'gold_coin', name: '🏆 طلا و سکه', color: 'bg-yellow-600/20 text-yellow-400 border-yellow-600' },
        { key: 'currency', name: '💵 ارزها', color: 'bg-green-600/20 text-green-400 border-green-600' },
        { key: 'crypto', name: '₿ ارز دیجیتال', color: 'bg-blue-600/20 text-blue-400 border-blue-600' }
    ];

    let allItems = [];

    // ساخت لیست آیتم‌ها
    categories.forEach(category => {
        const categoryPrices = prices[category.key];
        if (!categoryPrices || !Array.isArray(categoryPrices)) return;

        const targetSymbols = TICKER_SYMBOLS[category.key] || [];
        const items = categoryPrices.filter(p => targetSymbols.includes(p.symbol));

        if (items.length > 0) {
            // برچسب دسته
            allItems.push({ type: 'category', name: category.name, color: category.color });

            // آیتم‌های قیمت
            items.forEach(item => {
                allItems.push({
                    type: 'price',
                    symbol: item.symbol,
                    name: SYMBOL_NAMES[item.symbol] || item.title || item.symbol,
                    price: item.toman_price || item.price,
                    usdPrice: item.usd_price,
                    changePercent: item.change_percent ? parseFloat(item.change_percent) : 0,
                    category: category.key
                });
            });
        }
    });

    const priceCount = allItems.filter(i => i.type === 'price').length;

    if (priceCount === 0) {
        tickerContainer.innerHTML = '<div class="text-gray-500 text-sm py-2 px-4">قیمتی یافت نشد</div>';
        return;
    }

    // ساخت HTML آیتم‌ها
    let itemsHtml = '';

    allItems.forEach(item => {
        if (item.type === 'category') {
            itemsHtml += `<div class="ticker-category-badge ${item.color} border">${item.name}</div>`;
        } else {
            const isPositive = item.changePercent >= 0;
            const changeColor = isPositive ? 'text-green-400' : 'text-red-400';
            const changeIcon = isPositive ? '▲' : '▼';

            // تعیین فرمت قیمت بر اساس نوع دارایی
            let priceDisplay = '';
            if (item.symbol === 'XAUUSD') {
                priceDisplay = `$${parseFloat(item.usdPrice || item.price).toLocaleString('en-US', {
                    minimumFractionDigits: 2, maximumFractionDigits: 2
                })}`;
            } else if (item.category === 'crypto') {
                priceDisplay = `$${parseFloat(item.usdPrice || item.price).toLocaleString('en-US', {
                    minimumFractionDigits: 2, maximumFractionDigits: 4
                })}`;
            } else {
                priceDisplay = formatToman(item.price).replace(' ت', '');
            }

            itemsHtml += `
                <div class="ticker-item">
                    <span class="text-sm font-medium text-gray-200">${item.name}</span>
                    <span class="font-mono text-sm text-white">${priceDisplay}</span>
                    <span class="text-xs ${changeColor} flex items-center gap-0.5">
                        ${changeIcon} ${Math.abs(item.changePercent).toFixed(2)}%
                    </span>
                </div>
            `;
        }
    });

    // سه‌بار تکرار برای اسکرول بی‌نهایت
    tickerContainer.innerHTML = itemsHtml + itemsHtml + itemsHtml;
    tickerContent = tickerContainer;

    // شروع انیمیشن
    setTimeout(() => {
        tickerContentWidth = tickerContainer.scrollWidth / 3;
        tickerPosition = 0;
        startTickerAnimation();
    }, 50);

    // بروزرسانی زمان
    const now = new Date();
    const updateEl = document.getElementById('ticker-last-update');
    if (updateEl) updateEl.textContent = now.toLocaleTimeString('fa-IR', {
        hour: '2-digit', minute: '2-digit'
    });
};

const startTickerAnimation = () => {
    
    // شروع انیمیشن اسکرول نوار قیمت
    // با requestAnimationFrame برای عملکرد بهینه
    
    if (!tickerContent) return;

    const animate = () => {
        if (!tickerPaused && tickerContent) {
            tickerPosition += tickerSpeed;

            if (tickerPosition <= -tickerContentWidth) {
                tickerPosition = 0;
            }

            tickerContent.style.transform = `translateX(${tickerPosition}px)`;
        }

        tickerAnimationFrame = requestAnimationFrame(animate);
    };

    tickerAnimationFrame = requestAnimationFrame(animate);
};

const togglePriceTicker = () => {
    
    // نمایش/مخفی کردن نوار قیمت
    
    const tickerBar = document.getElementById('price-ticker-bar');
    const toggleIcon = document.getElementById('ticker-toggle-icon');
    const toggleText = document.getElementById('ticker-toggle-text');
    const spacer = document.getElementById('ticker-spacer');

    if (!tickerBar || !toggleIcon || !toggleText || !spacer) return;

    if (tickerVisible) {
        // مخفی کردن
        tickerBar.classList.add('translate-y-full');
        tickerBar.classList.remove('translate-y-0');
        toggleIcon.style.transform = 'rotate(180deg)';
        toggleText.textContent = 'نمایش قیمت‌ها';
        spacer.classList.add('h-0');
        spacer.classList.remove('h-16');
        tickerPaused = true;
    } else {
        // نمایش
        tickerBar.classList.remove('translate-y-full');
        tickerBar.classList.add('translate-y-0');
        toggleIcon.style.transform = 'rotate(0deg)';
        toggleText.textContent = 'پنهان کردن قیمت‌ها';
        spacer.classList.remove('h-0');
        spacer.classList.add('h-16');
        tickerPaused = false;
    }

    tickerVisible = !tickerVisible;
    localStorage.setItem('tickerVisible', tickerVisible);
};

const initPriceTicker = () => {
    
    // راه‌اندازی اولیه نوار قیمت
    // بازیابی وضعیت قبلی از localStorage
    
    const savedState = localStorage.getItem('tickerVisible');
    if (savedState === 'false') {
        tickerVisible = true;
        togglePriceTicker();
    }

    const toggleBtn = document.getElementById('ticker-toggle-btn');
    if (toggleBtn) toggleBtn.addEventListener('click', togglePriceTicker);

    // توقف انیمیشن هنگام هاور
    const tickerWrapperDiv = document.querySelector('.ticker-wrapper');
    if (tickerWrapperDiv) {
        tickerWrapperDiv.addEventListener('mouseenter', () => { tickerPaused = true; });
        tickerWrapperDiv.addEventListener('mouseleave', () => { tickerPaused = false; });
    }
};


// ============================================================
//  بخش ۹: تراکنش‌های اخیر
// ============================================================

const loadRecentTransactions = () => {
    
    // لود و نمایش تراکنش‌های اخیر در سایدبار
    
    const container = document.getElementById('recent-transactions-list');
    if (!container) return;

    if (!allAssets || allAssets.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">در حال بارگذاری...</p>';
        updateTransactionCountBadge(0);
        return;
    }

    // جمع‌آوری تمام تراکنش‌ها از همه دارایی‌ها
    allTransactionsCache = [];

    allAssets.forEach(asset => {
        if (asset.transactions && asset.transactions.length > 0) {
            asset.transactions.forEach(tx => {
                allTransactionsCache.push({
                    ...tx,
                    assetTitle: asset.title,
                    assetSymbol: asset.symbol,
                    assetId: asset.id
                });
            });
        }
    });

    // مرتب‌سازی بر اساس تاریخ (جدیدترین اول)
    allTransactionsCache.sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalCount = allTransactionsCache.length;
    updateTransactionCountBadge(totalCount);

    if (totalCount === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">هنوز تراکنشی ثبت نشده است.</p>';
        document.getElementById('show-more-transactions')?.classList.add('hidden');
        document.getElementById('toggle-transactions-btn')?.classList.add('hidden');
        return;
    }

    // نمایش دکمه‌های مدیریت
    const toggleBtn = document.getElementById('toggle-transactions-btn');
    const showMoreDiv = document.getElementById('show-more-transactions');

    if (totalCount > DEFAULT_TRANSACTION_COUNT) {
        toggleBtn?.classList.remove('hidden');
        showMoreDiv?.classList.remove('hidden');
    } else {
        toggleBtn?.classList.add('hidden');
        showMoreDiv?.classList.add('hidden');
    }

    renderTransactionsList();
};

const renderTransactionsList = () => {
    
    // رندر لیست تراکنش‌ها در سایدبار
    
    const container = document.getElementById('recent-transactions-list');
    if (!container) return;

    const totalCount = allTransactionsCache.length;
    const displayCount = showingAllTransactions
        ? totalCount
        : Math.min(DEFAULT_TRANSACTION_COUNT, totalCount);
    const recentTransactions = allTransactionsCache.slice(0, displayCount);

    let html = '';

    recentTransactions.forEach(tx => {
        const date = new Date(tx.date);
        const persianDate = date.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' });
        const time = date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
        const quantity = parseFloat(tx.quantity);

        // تعیین آیکون و رنگ بر اساس نوع تراکنش
        let icon = '', bgColor = '', textColor = '', typeText = '';

        switch (tx.type) {
            case 'buy':
                icon = '🟢'; bgColor = 'bg-green-900/30'; textColor = 'text-green-400'; typeText = 'خرید'; break;
            case 'sell':
                icon = '🔴'; bgColor = 'bg-red-900/30'; textColor = 'text-red-400'; typeText = 'فروش'; break;
            case 'save_profit':
                icon = '🟡'; bgColor = 'bg-yellow-900/30'; textColor = 'text-yellow-400'; typeText = 'سیو سود'; break;
            case 'deposit':
                icon = '💰'; bgColor = 'bg-blue-900/30'; textColor = 'text-blue-400'; typeText = 'واریز'; break;
            case 'withdrawal':
                icon = '💸'; bgColor = 'bg-orange-900/30'; textColor = 'text-orange-400'; typeText = 'برداشت'; break;
            default:
                icon = '📌'; bgColor = 'bg-gray-800'; textColor = 'text-gray-400'; typeText = tx.type;
        }

        let quantityDisplay = tx.assetSymbol === 'RIAL_WALLET'
            ? formatToman(quantity)
            : formatPrice(quantity);

        let priceDisplay = (tx.price_per_unit && tx.assetSymbol !== 'RIAL_WALLET')
            ? `@ ${formatToman(tx.price_per_unit)}`
            : '';

        html += `
            <div class="p-3 rounded-lg ${bgColor} border border-gray-700 hover:border-gray-600 transition-all duration-200">
                <div class="flex items-start justify-between mb-1">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">${icon}</span>
                        <span class="text-xs text-gray-400">${persianDate} ${time}</span>
                    </div>
                    <span class="text-xs ${textColor} font-medium">${typeText}</span>
                </div>
                <div class="mr-7">
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-medium text-gray-200">${tx.assetTitle}</span>
                        <span class="font-mono text-sm text-white">${quantityDisplay}</span>
                    </div>
                    ${priceDisplay ? `<div class="text-xs text-gray-500 mt-1">${priceDisplay}</div>` : ''}
                    ${tx.comment ? `<div class="text-xs text-gray-500 mt-1 truncate" title="${tx.comment}">📝 ${tx.comment}</div>` : ''}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    updateToggleButtonState();

    // بروزرسانی متن وضعیت
    const updateEl = document.getElementById('last-transaction-update');
    if (updateEl) {
        if (showingAllTransactions) {
            updateEl.textContent = `نمایش همه ${allTransactionsCache.length} تراکنش`;
        } else {
            updateEl.textContent = `${Math.min(DEFAULT_TRANSACTION_COUNT, allTransactionsCache.length)} تراکنش اخیر | ${new Date().toLocaleTimeString('fa-IR')}`;
        }
    }
};

const updateTransactionCountBadge = (count) => {
    
    // بروزرسانی عدد کنار دکمه تراکنش‌ها
    
    const badge = document.getElementById('transaction-count-badge');
    if (badge) {
        badge.textContent = showingAllTransactions
            ? count
            : Math.min(DEFAULT_TRANSACTION_COUNT, count);
    }
};

const updateToggleButtonState = () => {
    
    // بروزرسانی وضعیت دکمه‌های نمایش تراکنش‌ها
    
    const expandIcon = document.getElementById('transactions-expand-icon');
    const loadMoreBtn = document.getElementById('load-more-transactions-btn');
    const totalCount = allTransactionsCache.length;

    if (expandIcon) {
        expandIcon.style.transform = showingAllTransactions ? 'rotate(180deg)' : 'rotate(0deg)';
    }

    if (loadMoreBtn) {
        loadMoreBtn.textContent = showingAllTransactions
            ? 'نمایش کمتر'
            : `مشاهده همه تراکنش‌ها (${totalCount} تراکنش)`;
    }

    updateTransactionCountBadge(totalCount);
};

const toggleTransactionsView = () => {
    
    // تغییر بین نمایش محدود و کامل تراکنش‌ها
    
    showingAllTransactions = !showingAllTransactions;
    renderTransactionsList();
};


// ============================================================
//  بخش ۱۰: قدرت خرید
// ============================================================

const updatePurchasePowerBox = () => {
    
    // محاسبه و نمایش قدرت خرید با موجودی فعلی
    // محاسبه معادل دلار، طلا و بیت‌کوین
    
    let availableBalance = 0;

    if (purchaseMode === 'balance') {
        const rialAsset = allAssets.find(a => a.symbol === 'RIAL_WALLET');
        availableBalance = rialAsset ? parseFloat(rialAsset.total_quantity) : 0;
    } else {
        allAssets.forEach(asset => {
            if (asset.symbol === 'RIAL_WALLET') {
                availableBalance += parseFloat(asset.total_quantity);
            } else {
                availableBalance += parseFloat(asset.current_value) || 0;
            }
        });
    }

    if (availableBalance <= 0 || !allPrices) {
        document.getElementById('usd-amount').textContent = '-';
        document.getElementById('gold-amount').textContent = '-';
        document.getElementById('btc-amount').textContent = '-';
        return;
    }

    // پیدا کردن قیمت‌های مرجع
    let usdPrice = 0, goldPrice = 0, btcPrice = 0;

    ['currency', 'gold_coin', 'crypto'].forEach(cat => {
        if (allPrices[cat] && Array.isArray(allPrices[cat])) {
            allPrices[cat].forEach(item => {
                if (item.symbol === 'USD') usdPrice = item.toman_price || item.price;
                if (item.symbol === 'IR_GOLD_18K') goldPrice = item.toman_price || item.price;
                if (item.symbol === 'BTC') btcPrice = item.toman_price || item.price;
            });
        }
    });

    if (usdPrice > 0) {
        document.getElementById('usd-amount').textContent = (availableBalance / usdPrice).toFixed(2);
        document.getElementById('usd-purchase').textContent = `قیمت: ${formatToman(usdPrice)}`;
    }
    if (goldPrice > 0) {
        document.getElementById('gold-amount').textContent = (availableBalance / goldPrice).toFixed(3);
        document.getElementById('gold-purchase').textContent = `قیمت: ${formatToman(goldPrice)}`;
    }
    if (btcPrice > 0) {
        document.getElementById('btc-amount').textContent = (availableBalance / btcPrice).toFixed(6);
        document.getElementById('btc-purchase').textContent = `قیمت: ${formatToman(btcPrice)}`;
    }
};

const updatePurchaseModeUI = () => {
    
    // بروزرسانی دکمه‌های انتخاب mode خرید
    // حالت: balance (کیف ریالی) یا portfolio (کل پورتفوی)
    
    const balanceBtn = document.getElementById('purchase-mode-balance');
    const portfolioBtn = document.getElementById('purchase-mode-portfolio');
    const infoText = document.getElementById('purchase-power-info');

    if (purchaseMode === 'balance') {
        balanceBtn.classList.add('bg-blue-600', 'text-white');
        balanceBtn.classList.remove('bg-gray-700', 'text-gray-300');
        portfolioBtn.classList.remove('bg-blue-600', 'text-white');
        portfolioBtn.classList.add('bg-gray-700', 'text-gray-300');
        if (infoText) infoText.textContent = '💰 با کل موجودی کیف پول ریالی';
    } else {
        portfolioBtn.classList.add('bg-blue-600', 'text-white');
        portfolioBtn.classList.remove('bg-gray-700', 'text-gray-300');
        balanceBtn.classList.remove('bg-blue-600', 'text-white');
        balanceBtn.classList.add('bg-gray-700', 'text-gray-300');
        if (infoText) infoText.textContent = '📊 با کل ارزش پورتفوی (شامل تمام دارایی‌ها)';
    }
};


// ============================================================
//  بخش ۱۱: کیف پول ریالی
// ============================================================

const updateWalletBalanceDisplay = () => {
    
    // بروزرسانی نمایش موجودی کیف پول ریالی
    
    const rialAsset = allAssets.find(a => a.symbol === 'RIAL_WALLET');
    const balance = rialAsset ? parseFloat(rialAsset.total_quantity) : 0;
    const el = document.getElementById('current-wallet-balance');
    if (el) el.textContent = formatToman(balance);
};


// ============================================================
//  بخش ۱۲: نمودارها و تحلیل پورتفوی
// ============================================================

const renderPortfolioPieChart = (assets) => {
    
    // رندر نمودار دایره‌ای توزیع دارایی‌ها
    // شامل کیف پول ریالی هم می‌شود
    
    const activeAssets = assets.filter(asset =>
        parseFloat(asset.total_quantity) > 0 &&
        (asset.symbol === 'RIAL_WALLET' || parseFloat(asset.current_value) > 0)
    );

    const ctx = document.getElementById('portfolioPieChart')?.getContext('2d');
    const legendContainer = document.getElementById('pie-chart-legend');

    if (!ctx || !legendContainer) return;

    if (activeAssets.length === 0) {
        if (portfolioPieChart) {
            portfolioPieChart.destroy();
            portfolioPieChart = null;
        }
        legendContainer.innerHTML = '<p class="text-gray-500 text-sm text-center py-2">هنوز دارایی‌ای ثبت نشده است.</p>';
        return;
    }

    const totalValue = activeAssets.reduce((sum, asset) => {
        if (asset.symbol === 'RIAL_WALLET') {
            return sum + parseFloat(asset.total_quantity);
        }
        return sum + parseFloat(asset.current_value);
    }, 0);

    const colors = [
        '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
        '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6', '#6b7280'
    ];

    // ساخت legend
    let legendHtml = '';
    activeAssets.forEach((asset, i) => {
        const value = asset.symbol === 'RIAL_WALLET'
            ? parseFloat(asset.total_quantity)
            : parseFloat(asset.current_value);
        const percent = (value / totalValue) * 100;

        legendHtml += `
            <div class="flex items-center justify-between p-2 hover:bg-gray-800 rounded">
                <div class="flex items-center gap-2">
                    <div class="w-4 h-4 rounded" style="background-color: ${colors[i % colors.length]};"></div>
                    <span class="text-sm text-gray-300">${asset.symbol === 'RIAL_WALLET' ? '💰 نقد (ریال)' : asset.title}</span>
                </div>
                <span class="font-mono text-sm text-white">${percent.toFixed(1)}%</span>
            </div>
        `;
    });
    legendContainer.innerHTML = legendHtml;

    // ساخت نمودار
    if (portfolioPieChart) portfolioPieChart.destroy();
    portfolioPieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: activeAssets.map(a => a.symbol === 'RIAL_WALLET' ? '💰 نقد (ریال)' : a.title),
            datasets: [{
                data: activeAssets.map(a => a.symbol === 'RIAL_WALLET'
                    ? parseFloat(a.total_quantity)
                    : parseFloat(a.current_value)),
                backgroundColor: colors.slice(0, activeAssets.length),
                borderWidth: 2,
                borderColor: '#161b22'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: { legend: { display: false } }
        }
    });
};

const analyzePortfolioBalance = (assets) => {
    
    // تحلیل تعادل پورتفوی و نمایش وضعیت تنوع‌بخشی
    // ۴ وضعیت: متعادل, نسبتاً متعادل, نیاز به بازبینی, خارج از تعادل
    
    const activeAssets = assets.filter(asset =>
        parseFloat(asset.total_quantity) > 0 &&
        (asset.symbol === 'RIAL_WALLET' || parseFloat(asset.current_value) > 0)
    );

    // ریست کردن وضعیت‌های قبلی
    document.querySelectorAll('.balance-status-item').forEach(item => {
        item.classList.remove('border-green-500', 'border-yellow-500', 'border-orange-500', 'border-red-500');
        item.classList.add('border-gray-700');
        const circle = item.querySelector('.w-16.h-16');
        if (circle) {
            circle.classList.remove('bg-green-900', 'bg-yellow-900', 'bg-orange-900', 'bg-red-900');
            circle.classList.add('bg-gray-700');
        }
    });

    if (activeAssets.length === 0) {
        document.getElementById('balance-guidance-title').textContent = 'بدون دارایی';
        document.getElementById('balance-guidance-text').textContent = 'شما هنوز دارایی ثبت نکرده‌اید.';
        document.getElementById('max-asset-name').textContent = '-';
        document.getElementById('max-asset-percent').textContent = '-';

        const guidanceDiv = document.getElementById('balance-guidance');
        guidanceDiv.classList.remove('border-green-500', 'border-yellow-500', 'border-orange-500', 'border-red-500');
        guidanceDiv.classList.add('border-gray-500');
        document.getElementById('balance-guidance-icon').textContent = 'ℹ️';
        return;
    }

    // محاسبه ارزش کل
    const totalValue = activeAssets.reduce((sum, asset) => {
        if (asset.symbol === 'RIAL_WALLET') {
            return sum + parseFloat(asset.total_quantity);
        }
        return sum + parseFloat(asset.current_value);
    }, 0);

    // پیدا کردن بزرگترین سهم
    let maxAsset = null, maxPercent = 0;

    activeAssets.forEach(asset => {
        const value = asset.symbol === 'RIAL_WALLET'
            ? parseFloat(asset.total_quantity)
            : parseFloat(asset.current_value);

        const percent = (value / totalValue) * 100;

        if (percent > maxPercent) {
            maxPercent = percent;
            maxAsset = asset;
        }
    });

    const maxAssetName = maxAsset.symbol === 'RIAL_WALLET'
        ? '💰 نقد (ریال)'
        : maxAsset.title;

    // تعیین وضعیت
    let statusElement, guidanceTitle, guidanceText, guidanceIcon, borderColor, bgColor;

    if (maxPercent < 35) {
        statusElement = document.getElementById('balance-status-balanced');
        guidanceTitle = '✅ پورتفوی متعادل';
        guidanceText = `پورتفوی شما تنوع خوبی دارد و بزرگترین سهم (${maxAssetName}) فقط ${maxPercent.toFixed(1)}٪ از کل را تشکیل می‌دهد.`;
        guidanceIcon = '✅';
        borderColor = 'border-green-500';
        bgColor = 'bg-green-900';
    } else if (maxPercent < 45) {
        statusElement = document.getElementById('balance-status-semi-balanced');
        guidanceTitle = '👍 پورتفوی نسبتاً متعادل';
        guidanceText = `بزرگترین سهم شما (${maxAssetName}) بین ۳۵٪ تا ۴۵٪ از کل سبد را تشکیل می‌دهد.`;
        guidanceIcon = '👍';
        borderColor = 'border-yellow-500';
        bgColor = 'bg-yellow-900';
    } else if (maxPercent < 55) {
        statusElement = document.getElementById('balance-status-needs-review');
        guidanceTitle = '⚠️ نیاز به بازبینی';
        guidanceText = `بزرگترین سهم شما (${maxAssetName}) بین ۴۵٪ تا ۵۵٪ از کل پورتفوی را تشکیل می‌دهد.`;
        guidanceIcon = '⚠️';
        borderColor = 'border-orange-500';
        bgColor = 'bg-orange-900';
    } else {
        statusElement = document.getElementById('balance-status-unbalanced');
        guidanceTitle = '🔴 خارج از تعادل';
        guidanceText = `بیش از ۵۵٪ از ارزش پورتفوی شما در "${maxAssetName}" متمرکز شده است.`;
        guidanceIcon = '🔴';
        borderColor = 'border-red-500';
        bgColor = 'bg-red-900';
    }

    // هایلایت وضعیت فعال
    if (statusElement) {
        statusElement.classList.remove('border-gray-700');
        statusElement.classList.add(borderColor);
        const circle = statusElement.querySelector('.w-16.h-16');
        if (circle) {
            circle.classList.remove('bg-gray-700');
            circle.classList.add(bgColor);
        }
    }

    // بروزرسانی راهنما
    const guidanceDiv = document.getElementById('balance-guidance');
    guidanceDiv.classList.remove('border-gray-500', 'border-green-500', 'border-yellow-500', 'border-orange-500', 'border-red-500');
    guidanceDiv.classList.add(borderColor);
    document.getElementById('balance-guidance-icon').textContent = guidanceIcon;
    document.getElementById('balance-guidance-title').textContent = guidanceTitle;
    document.getElementById('balance-guidance-text').textContent = guidanceText;
    document.getElementById('max-asset-name').textContent = maxAssetName;
    document.getElementById('max-asset-percent').textContent = `${maxPercent.toFixed(1)}% از کل پورتفوی`;
};

const renderAssetsDashboard = (assets) => {
    
    // رندر جدول دارایی‌های اسپات و بروزرسانی کارت‌های خلاصه
    
    const tableBody = document.getElementById('assets-table-body');
    tableBody.innerHTML = '';

    let totalValue = 0, totalProfit = 0, totalCostBasis = 0, rialWalletBalance = 0;

    assets.forEach(asset => {
        const quantity = parseFloat(asset.total_quantity);
        const costBasis = parseFloat(asset.cost_basis);
        const currentValue = parseFloat(asset.current_value);
        const profitLoss = parseFloat(asset.profit_loss);
        const returnPct = parseFloat(asset.return_pct);

        // کیف پول ریالی رو فقط توی مجموع حساب می‌کنیم - توی جدول نمایش نمی‌دیم
        if (asset.symbol === 'RIAL_WALLET') {
            rialWalletBalance = quantity;
            totalValue += quantity;
            return;
        }

        if (quantity > 0) {
            totalValue += currentValue;
            totalProfit += profitLoss;
            totalCostBasis += costBasis;

            const statusClass = getStatusColor(profitLoss);

            tableBody.innerHTML += `
                <tr class="hover:bg-gray-800 transition duration-150">
                    <td class="px-2 py-2 sm:px-3 sm:py-3 font-medium text-white text-xs sm:text-sm">
                        <div class="flex flex-col">
                            <span>${asset.title}</span>
                            <span class="text-gray-500 text-xs">(${asset.symbol})</span>
                        </div>
                    </td>
                    <td class="px-2 py-2 sm:px-3 sm:py-3 font-mono text-xs sm:text-sm">${formatToman(asset.break_even_price)}</td>
                    <td class="px-2 py-2 sm:px-3 sm:py-3 font-mono text-xs sm:text-sm">${formatToman(asset.current_price)}</td>
                    <td class="px-2 py-2 sm:px-3 sm:py-3 font-mono text-xs sm:text-sm">${formatPrice(asset.total_quantity)}</td>
                    <td class="px-2 py-2 sm:px-3 sm:py-3 font-mono text-xs sm:text-sm">${formatToman(asset.current_value)}</td>
                    <td class="px-2 py-2 sm:px-3 sm:py-3 text-xs sm:text-sm ${statusClass} font-semibold">
                        ${formatToman(profitLoss)}
                        <span class="text-xs">(${formatPercent(returnPct)})</span>
                    </td>
                    <td class="px-2 py-2 sm:px-3 sm:py-3 text-center">
                        <button onclick="openHistoryModal('${asset.title}', '${asset.id}')"
                                class="text-blue-500 hover:text-blue-400 text-xs sm:text-sm action-btn">
                            مشاهده
                        </button>
                    </td>
                </tr>
            `;
        }
    });

    if (tableBody.innerHTML === '') {
        tableBody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-gray-500">هنوز دارایی اسپاتی ثبت نشده است.</td></tr>';
    }

    // بروزرسانی کارت‌های خلاصه
    const overallReturnPct = totalCostBasis > 0 ? (totalProfit / totalCostBasis) * 100 : 0;
    const overallStatusClass = getStatusColor(totalProfit);

    document.getElementById('total-value').textContent = formatToman(totalValue);
    document.getElementById('total-profit').textContent = formatToman(totalProfit);
    document.getElementById('total-profit-pct').className = `text-sm mt-1 flex items-center ${overallStatusClass} font-medium`;
    document.getElementById('total-profit-pct').innerHTML = `
        <svg class="w-4 h-4 ml-1" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd"
                  d="${totalProfit >= 0
                      ? 'M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z'
                      : 'M14.707 7.293a1 1 0 00-1.414 0L10 10.586l-3.293-3.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l4-4a1 1 0 000-1.414z'}"
                  clip-rule="evenodd"></path>
        </svg>
        ${formatPercent(overallReturnPct)}
    `;
    document.getElementById('rial-wallet-balance').textContent = formatToman(rialWalletBalance);

    // بروزرسانی نمودارها و تحلیل‌ها
    renderPortfolioPieChart(assets);
    analyzePortfolioBalance(assets);
};

const renderChart = (data) => {
    
    // رندر نمودار خطی ارزش پورتفوی در طول زمان
    
    const dates = Object.keys(data).sort();
    const values = dates.map(date => data[date]);
    const ctx = document.getElementById('portfolioChart')?.getContext('2d');
    if (!ctx) return;

    if (portfolioChart) portfolioChart.destroy();

    portfolioChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'ارزش کل پورتفوی',
                data: values,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                fill: 'origin',
                tension: 0.2,
                pointRadius: 3,
                pointBackgroundColor: '#3b82f6',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'day' },
                    ticks: { color: currentTheme === 'light' ? '#4b5563' : '#8b949e' },
                    grid: { color: currentTheme === 'light' ? '#e5e7eb' : '#30363d' }
                },
                y: {
                    ticks: {
                        color: currentTheme === 'light' ? '#4b5563' : '#8b949e',
                        callback: v => formatToman(v).replace(' ت', '')
                    },
                    grid: { color: currentTheme === 'light' ? '#e5e7eb' : '#30363d' }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
};


// ============================================================
//  بخش ۱۳: مودال‌ها
// ============================================================

const openWalletModal = () => {
    
    // نمایش مودال مدیریت کیف پول
    
    const rialAsset = allAssets.find(a => a.symbol === 'RIAL_WALLET');
    const balance = rialAsset ? parseFloat(rialAsset.total_quantity) : 0;
    document.getElementById('wallet-current-balance').textContent = `موجودی: ${formatToman(balance)}`;
    document.getElementById('wallet-modal').classList.remove('hidden');
};

const openHistoryModal = (assetTitle, assetId) => {
    
    // نمایش مودال تاریخچه تراکنش‌های یک دارایی
    
    const asset = allAssets.find(a => a.id === assetId);
    if (!asset) return;

    document.getElementById('history-title').textContent = `تاریخچه تراکنش‌های ${assetTitle}`;
    const tableBody = document.getElementById('history-table-body');
    tableBody.innerHTML = '';

    asset.transactions.forEach(tx => {
        let typeDisplay = '';
        if (tx.type === 'buy') typeDisplay = '<span class="text-green-400">خرید</span>';
        else if (tx.type === 'sell') typeDisplay = '<span class="text-red-400">فروش</span>';
        else if (tx.type === 'save_profit') typeDisplay = '<span class="text-yellow-400">سیو سود</span>';
        else if (tx.type === 'deposit') typeDisplay = '<span class="text-green-500">واریز</span>';
        else if (tx.type === 'withdrawal') typeDisplay = '<span class="text-red-500">برداشت</span>';

        tableBody.innerHTML += `
            <tr class="hover:bg-gray-800">
                <td class="px-2 py-1 text-xs">${formatPersianDate(tx.date)}</td>
                <td class="px-2 py-1">${typeDisplay}<span class="text-gray-500 text-xs block">${tx.category || '-'}</span></td>
                <td class="px-2 py-1 font-mono text-xs">${formatPrice(tx.quantity)}</td>
                <td class="px-2 py-1 font-mono text-xs">${tx.price_per_unit ? formatToman(tx.price_per_unit) : '-'}</td>
                <td class="px-2 py-1 text-xs text-gray-400 truncate max-w-[150px]">${tx.comment || '-'}</td>
                <td class="px-2 py-1 text-center">
                    <button onclick="openEditModal('${tx.transaction_id}', '${assetId}')" class="text-blue-500 text-xs">ویرایش</button>
                    <button onclick="deleteTransaction('${tx.transaction_id}')" class="text-red-500 text-xs mr-1">حذف</button>
                </td>
            </tr>
        `;
    });

    document.getElementById('history-modal').classList.remove('hidden');
};

const openEditModal = (transactionId, assetId) => {
    
    // نمایش مودال ویرایش تراکنش
    // پر کردن خودکار فیلدها با داده‌های تراکنش
    
    const asset = allAssets.find(a => a.id === assetId);
    if (!asset) return;

    const transaction = asset.transactions.find(tx => tx.transaction_id === transactionId);
    if (!transaction) return;

    document.getElementById('edit-transaction-id').value = transactionId;
    document.getElementById('edit-asset-id').value = assetId;
    document.getElementById('edit-tx-type').value = transaction.type;
    document.getElementById('edit-asset-name').textContent = `${asset.title} (${asset.symbol})`;
    document.getElementById('edit-tx-category').value = transaction.category || '';
    document.getElementById('edit-tx-quantity').value = transaction.quantity;
    document.getElementById('edit-tx-price').value = transaction.price_per_unit || '';
    document.getElementById('edit-tx-comment').value = transaction.comment || '';

    // تنظیم تاریخ
    const txDate = new Date(transaction.date);
    const year = txDate.getFullYear();
    const month = String(txDate.getMonth() + 1).padStart(2, '0');
    const day = String(txDate.getDate()).padStart(2, '0');
    document.getElementById('edit-tx-date').value = `${year}-${month}-${day}`;

    // نمایش/مخفی کردن فیلد قیمت
    const isPriceVisible = ['buy', 'sell', 'save_profit'].includes(transaction.type);
    document.getElementById('edit-price-per-unit-group').classList.toggle('hidden', !isPriceVisible);

    document.getElementById('edit-tx-quantity').disabled = false;
    document.getElementById('edit-tx-price').disabled = !isPriceVisible;
    document.getElementById('edit-tx-date').disabled = false;
    document.getElementById('edit-tx-category').disabled = false;
    document.getElementById('edit-tx-comment').disabled = false;

    document.getElementById('edit-modal').classList.remove('hidden');
};

const deleteTransaction = async (id) => {
    
    // حذف تراکنش با تأیید کاربر
    
    if (!confirm('آیا مطمئن هستید که می‌خواهید این تراکنش را حذف کنید؟')) return;

    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const response = await fetch(`/api/transactions/${id}`, { method: 'DELETE', headers });
        if (response.ok) {
            document.getElementById('history-modal').classList.add('hidden');
            await fetchAssets();
            await fetchChartData();
            await updateDailyProfit();
            showNotification('✅ تراکنش با موفقیت حذف شد', 'success');
        } else {
            const error = await response.json();
            showNotification(`❌ ${error.error}`, 'error');
        }
    } catch (error) {
        showNotification('❌ خطای شبکه یا سرور رخ داد', 'error');
    }
};

const openValueAnalysisModal = async () => {
    
    // نمایش مودال تحلیل ارزش پورتفوی
    // شامل معادل دلاری، طلایی و تاریخچه
    
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const response = await fetch('/api/value-analysis', { headers });
        const data = await response.json();

        // مقادیر اصلی
        document.getElementById('current-value').textContent = formatToman(data.total_value_toman || 0);
        document.getElementById('current-usd').textContent = `$${data.equivalent_usd?.toFixed(2) || '0.00'}`;
        document.getElementById('current-gold').textContent = `${data.equivalent_gold_grams?.toFixed(3) || '0.000'} گرم`;

        // تغییرات
        const usdChange = data.usd_change || 0;
        const goldChange = data.gold_change || 0;
        const usdPercent = data.usd_change_percent || 0;
        const goldPercent = data.gold_change_percent || 0;

        const usdChangeDetail = document.getElementById('usd-change-detail');
        const usdPercentEl = document.getElementById('usd-change-percent');

        if (usdChange !== 0) {
            const sign = usdChange >= 0 ? '+' : '';
            usdChangeDetail.textContent = `${sign}${usdChange.toFixed(2)} USD`;
            usdChangeDetail.className = `text-lg font-mono ${usdChange >= 0 ? 'text-green-400' : 'text-red-400'}`;
            usdPercentEl.textContent = `${sign}${usdPercent.toFixed(2)}%`;
            usdPercentEl.className = `text-xs ${usdChange >= 0 ? 'text-green-400' : 'text-red-400'}`;
        } else {
            usdChangeDetail.textContent = 'بدون تغییر';
            usdChangeDetail.className = 'text-lg font-mono text-gray-400';
            usdPercentEl.textContent = '0.00%';
            usdPercentEl.className = 'text-xs text-gray-400';
        }

        const goldChangeDetail = document.getElementById('gold-change-detail');
        const goldPercentEl = document.getElementById('gold-change-percent');

        if (goldChange !== 0) {
            const sign = goldChange >= 0 ? '+' : '';
            goldChangeDetail.textContent = `${sign}${goldChange.toFixed(3)} گرم`;
            goldChangeDetail.className = `text-lg font-mono ${goldChange >= 0 ? 'text-green-400' : 'text-red-400'}`;
            goldPercentEl.textContent = `${sign}${goldPercent.toFixed(2)}%`;
            goldPercentEl.className = `text-xs ${goldChange >= 0 ? 'text-green-400' : 'text-red-400'}`;
        } else {
            goldChangeDetail.textContent = 'بدون تغییر';
            goldChangeDetail.className = 'text-lg font-mono text-gray-400';
            goldPercentEl.textContent = '0.00%';
            goldPercentEl.className = 'text-xs text-gray-400';
        }

        // تغییرات ساده برای کارت‌های خلاصه
        const simpleUsdChange = document.getElementById('usd-change');
        const simpleGoldChange = document.getElementById('gold-change');

        if (usdPercent !== 0) {
            const sign = usdPercent >= 0 ? '📈 +' : '📉 ';
            simpleUsdChange.textContent = `${sign}${Math.abs(usdPercent).toFixed(1)}%`;
            simpleUsdChange.className = `text-xs sm:text-sm mt-1 ${usdPercent >= 0 ? 'text-green-400' : 'text-red-400'}`;
        } else {
            simpleUsdChange.textContent = '';
        }

        if (goldPercent !== 0) {
            const sign = goldPercent >= 0 ? '📈 +' : '📉 ';
            simpleGoldChange.textContent = `${sign}${Math.abs(goldPercent).toFixed(1)}%`;
            simpleGoldChange.className = `text-xs sm:text-sm mt-1 ${goldPercent >= 0 ? 'text-green-400' : 'text-red-400'}`;
        } else {
            simpleGoldChange.textContent = '';
        }

        // لود تاریخچه
        const historyRes = await fetch('/api/comparison-data', { headers });
        const history = await historyRes.json();
        const tableBody = document.getElementById('value-analysis-table-body');
        tableBody.innerHTML = '';

        history.slice(-7).reverse().forEach(entry => {
            const date = new Date(entry.date).toLocaleDateString('fa-IR');
            tableBody.innerHTML += `
                <tr class="hover:bg-gray-800">
                    <td class="px-2 py-1 text-xs">${date}</td>
                    <td class="px-2 py-1 font-mono text-xs">${formatToman(entry.total_value_toman)}</td>
                    <td class="px-2 py-1 font-mono text-xs">${formatToman(entry.usd_price)}</td>
                    <td class="px-2 py-1 font-mono text-xs">${formatToman(entry.gold_price_per_gram)}</td>
                    <td class="px-2 py-1 font-mono text-xs">${entry.equivalent_usd?.toFixed(2)} USD</td>
                    <td class="px-2 py-1 font-mono text-xs">${entry.equivalent_gold_grams?.toFixed(3)} گرم</td>
                </tr>
            `;
        });

        document.getElementById('value-analysis-modal').classList.remove('hidden');
    } catch (error) {
        console.error('❌ خطا در بارگذاری تحلیل ارزش:', error);
        showNotification('❌ خطا در بارگذاری تحلیل ارزش', 'error');
    }
};

const showDailyHistory = async () => {
    
    // نمایش مودال تاریخچه سود روزانه
    
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const response = await fetch('/api/daily-profit', { headers });
        const data = await response.json();

        let html = '<div class="space-y-3">';
        data.slice(-10).reverse().forEach(entry => {
            const date = new Date(entry.date).toLocaleDateString('fa-IR');
            const isPositive = entry.daily_change >= 0;
            const changeColor = isPositive ? 'text-green-400' : 'text-red-400';

            html += `
                <div class="p-3 bg-gray-800 rounded-lg">
                    <div class="flex justify-between mb-2">
                        <span class="text-sm text-gray-300">${date}</span>
                        <span class="text-xs ${changeColor}">${formatPercent(entry.daily_change_percent)}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <div><span class="text-gray-500">ارزش:</span> <span class="font-mono">${formatToman(entry.total_value)}</span></div>
                        <div><span class="text-gray-500">تغییر:</span> <span class="font-mono ${changeColor}">${formatToman(entry.daily_change)}</span></div>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="card p-6 rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
                <div class="flex justify-between mb-4">
                    <h3 class="text-lg font-bold">📊 تاریخچه عملکرد روزانه</h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-white">✕</button>
                </div>
                ${html}
            </div>
        `;
        document.body.appendChild(modal);
    } catch (error) {
        showNotification('❌ خطا در بارگذاری تاریخچه', 'error');
    }
};


// ============================================================
//  بخش ۱۴: مدیریت API
// ============================================================

const openApiManagementModal = () => {
    
    // باز کردن مودال مدیریت API
    
    document.getElementById('api-management-modal').classList.remove('hidden');
    loadApiKeyStatus();
    loadApiStats();
    loadApiJsonPreview();
};

const loadApiKeyStatus = async () => {
    
    // لود وضعیت کلید API کاربر
    
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const response = await fetch('/api/user/api-key', { headers });
        const data = await response.json();

        if (data.api_key) {
            document.getElementById('no-api-key').classList.add('hidden');
            document.getElementById('has-api-key').classList.remove('hidden');
            document.getElementById('api-key-display').value = data.api_key;
        } else {
            document.getElementById('no-api-key').classList.remove('hidden');
            document.getElementById('has-api-key').classList.add('hidden');
        }
    } catch (error) {
        console.error('❌ خطا در لود کلید API:', error);
    }
};

const loadApiStats = async () => {
    
    // لود آمار استفاده از API
    
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const response = await fetch('/api/user/api-stats', { headers });
        const data = await response.json();

        document.getElementById('api-requests-today').textContent = data.today_requests || 0;
        document.getElementById('api-requests-total').textContent = data.total_requests || 0;
        document.getElementById('api-last-update').textContent = data.last_price_update || '-';
    } catch (error) {
        console.error('❌ خطا در لود آمار API:', error);
    }
};

const loadApiJsonPreview = async () => {
    
    // لود پیش‌نمایش خروجی JSON
    
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const keyResponse = await fetch('/api/user/api-key', { headers });
        const keyData = await keyResponse.json();
        const apiKey = keyData.api_key;

        if (!apiKey) {
            document.getElementById('api-json-preview').innerHTML =
                '<span class="text-gray-500">⚠️ ابتدا یک کلید API بسازید</span>';
            return;
        }

        const testUrl = `${window.location.origin}/api/${apiKey}`;
        document.getElementById('api-test-link').href = testUrl;
        document.getElementById('direct-api-link').textContent = testUrl;
        document.getElementById('direct-api-link').href = testUrl;

        const response = await fetch(testUrl);
        const data = await response.json();

        let html = JSON.stringify(data, null, 2)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"([^"]+)":/g, '<span class="text-yellow-400">"$1"</span>:')
            .replace(/: "([^"]*)"/g, ': <span class="text-green-400">"$1"</span>')
            .replace(/: (\d+\.?\d*)/g, ': <span class="text-blue-400">$1</span>')
            .replace(/: (true|false)/g, ': <span class="text-purple-400">$1</span>');

        document.getElementById('api-json-preview').innerHTML = html;
        updateCodeExamples(apiKey);

    } catch (error) {
        console.error('❌ خطا در لود پیش‌نمایش API:', error);
        document.getElementById('api-json-preview').innerHTML =
            '<span class="text-red-400">خطا در بارگذاری</span>';
    }
};

const updateCodeExamples = (apiKey) => {
    
    // بروزرسانی نمونه کدهای cURL, JavaScript, Python
    
    const baseUrl = window.location.origin;
    const browserLink = `${baseUrl}/api/${apiKey}`;

    document.getElementById('direct-api-link').textContent = browserLink;
    document.getElementById('direct-api-link').href = browserLink;
    document.getElementById('api-test-link').href = browserLink;

    // cURL
    document.getElementById('curl-example').textContent = `curl "${browserLink}"`;

    // JavaScript
    document.getElementById('js-example').textContent =
        `fetch("${browserLink}")\n  .then(response => response.json())\n  .then(data => console.log(data))\n  .catch(error => console.error(error));`;

    // Python
    document.getElementById('python-example').textContent =
        `import requests\nimport json\n\nresponse = requests.get("${browserLink}")\ndata = response.json()\nprint(json.dumps(data, indent=2, ensure_ascii=False))`;
};

const copyDirectLink = () => {
    
    // کپی لینک مستقیم API
    
    const linkEl = document.getElementById('direct-api-link');
    if (!linkEl) return;

    const link = linkEl.textContent;

    navigator.clipboard?.writeText(link).then(() => {
        showNotification('📋 لینک API کپی شد!', 'success');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = link;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showNotification('📋 لینک API کپی شد!', 'success');
    });
};

const generateApiKey = async () => {
    
    // ساخت کلید API جدید
    
    if (!confirm('آیا مطمئن هستید که می‌خواهید کلید API جدید بسازید؟ کلید قبلی غیرفعال خواهد شد.')) return;

    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const response = await fetch('/api/user/api-key', { method: 'POST', headers });
        const data = await response.json();

        if (response.ok) {
            document.getElementById('no-api-key').classList.add('hidden');
            document.getElementById('has-api-key').classList.remove('hidden');
            document.getElementById('api-key-display').value = data.api_key;
            showNotification('✅ کلید API با موفقیت ساخته شد', 'success');
        }
    } catch (error) {
        console.error('❌ خطا در ساخت کلید API:', error);
    }
};

const revokeApiKey = async () => {
    
    // حذف کلید API
    
    if (!confirm('آیا مطمئن هستید که می‌خواهید کلید API خود را حذف کنید؟')) return;

    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const response = await fetch('/api/user/api-key', { method: 'DELETE', headers });
        if (response.ok) {
            document.getElementById('no-api-key').classList.remove('hidden');
            document.getElementById('has-api-key').classList.add('hidden');
            showNotification('🗑️ کلید API حذف شد', 'success');
        }
    } catch (error) {
        console.error('❌ خطا در حذف کلید API:', error);
    }
};

const copyApiKey = () => {
    
    // کپی کلید API به کلیپبورد
    
    const input = document.getElementById('api-key-display');
    input.select();
    document.execCommand('copy');
    showNotification('📋 کلید API کپی شد', 'success');
};


// ============================================================
//  بخش ۱۵: ورودی/خروجی اطلاعات
// ============================================================

const openDataManagementModal = () => {
    
    // نمایش مودال مدیریت داده‌ها (خروجی/ورودی)
    
    document.getElementById('data-management-modal').classList.remove('hidden');
    document.getElementById('data-message').classList.add('hidden');
    resetImportState();
};

const resetImportState = () => {
    
    // ریست فرم ورودی اطلاعات
    
    document.getElementById('import-ready-state').classList.remove('hidden');
    document.getElementById('import-file-selected').classList.add('hidden');
    document.getElementById('import-preview').classList.add('hidden');
    document.getElementById('import-data-btn').disabled = true;
    document.getElementById('import-file-input').value = '';
};

let importFile = null;

const handleFileSelect = (file) => {
    
    // پردازش فایل انتخاب شده برای ورودی
    
    if (!file) return;

    if (!file.name.endsWith('.json')) {
        showDataMessage('❌ فقط فایل JSON مجاز است', 'error');
        return;
    }

    importFile = file;

    document.getElementById('import-ready-state').classList.add('hidden');
    document.getElementById('import-file-selected').classList.remove('hidden');
    document.getElementById('selected-file-name').textContent = file.name;
    document.getElementById('selected-file-size').textContent = `حجم: ${(file.size / 1024).toFixed(1)} کیلوبایت`;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.version || !data.data) throw new Error('فایل نامعتبر');

            const preview = document.getElementById('import-preview');
            const content = document.getElementById('import-preview-content');

            const assetCount = data.data.assets?.length || 0;
            const txCount = data.data.assets?.reduce((sum, a) => sum + (a.transactions?.length || 0), 0) || 0;
            const exportDate = data.export_date
                ? new Date(data.export_date).toLocaleDateString('fa-IR')
                : 'نامشخص';

            content.innerHTML = `
                <div class="flex justify-between"><span>👤 کاربر:</span><span>${data.user_name || 'نامشخص'}</span></div>
                <div class="flex justify-between"><span>📅 تاریخ خروجی:</span><span>${exportDate}</span></div>
                <div class="flex justify-between"><span>📦 دارایی‌ها:</span><span>${assetCount} عدد</span></div>
                <div class="flex justify-between"><span>📝 تراکنش‌ها:</span><span>${txCount} عدد</span></div>
                <div class="flex justify-between"><span>📊 نسخه:</span><span>${data.version}</span></div>
            `;

            preview.classList.remove('hidden');
            document.getElementById('import-data-btn').disabled = false;
        } catch (error) {
            showDataMessage('❌ فایل JSON نامعتبر یا خراب است', 'error');
            resetImportState();
        }
    };
    reader.readAsText(file);
};

const importUserData = async () => {
    
    // آپلود و جایگزینی داده‌های کاربر
    
    if (!importFile) return;
    if (!confirm('⚠️ هشدار: تمام اطلاعات فعلی شما با داده‌های فایل جایگزین می‌شود. آیا مطمئن هستید؟')) return;

    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);

                const headers = { 'Content-Type': 'application/json' };
                if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

                const response = await fetch('/api/user/import', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(data)
                });
                const result = await response.json();

                if (response.ok) {
                    // بازیابی داده‌های تست ریسک از فایل
                    if (data.data.risk_test) {
                        if (data.data.risk_test.score) localStorage.setItem('riskTestScore', data.data.risk_test.score);
                        if (data.data.risk_test.answers) localStorage.setItem('riskTestAnswers', JSON.stringify(data.data.risk_test.answers));
                    }
                    showDataMessage('✅ اطلاعات با موفقیت بازیابی شد. صفحه رفرش می‌شود...', 'success');
                    setTimeout(() => window.location.reload(), 2000);
                } else {
                    showDataMessage(`❌ ${result.error}`, 'error');
                }
            } catch (error) {
                showDataMessage('❌ خطا در پردازش فایل', 'error');
            }
        };
        reader.readAsText(importFile);
    } catch (error) {
        console.error('❌ خطا در ورودی اطلاعات:', error);
        showDataMessage('❌ خطا در ورودی اطلاعات', 'error');
    }
};

const exportUserData = async () => {
    
    // دانلود فایل پشتیبان از اطلاعات کاربر
    
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const response = await fetch('/api/user/export', { headers });
        if (!response.ok) throw new Error('Export failed');

        const data = await response.json();

        // اضافه کردن داده‌های تست ریسک به خروجی
        data.data.risk_test = {
            score: localStorage.getItem('riskTestScore'),
            answers: JSON.parse(localStorage.getItem('riskTestAnswers') || 'null')
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `assetly_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showDataMessage('✅ فایل پشتیبان با موفقیت دانلود شد', 'success');
    } catch (error) {
        console.error('❌ خطا در خروجی اطلاعات:', error);
        showDataMessage('❌ خطا در خروجی اطلاعات', 'error');
    }
};

const showDataMessage = (message, type) => {
    
    // نمایش پیغام در مودال مدیریت داده‌ها
    
    const msgEl = document.getElementById('data-message');
    msgEl.textContent = message;
    msgEl.classList.remove('hidden', 'bg-green-900/30', 'text-green-400', 'bg-red-900/30', 'text-red-400');

    if (type === 'success') {
        msgEl.classList.add('bg-green-900/30', 'text-green-400');
    } else {
        msgEl.classList.add('bg-red-900/30', 'text-red-400');
    }
};


// ============================================================
//  بخش ۱۶: گزارش‌گیری PDF
// ============================================================

const openReportModal = () => {
    
    // نمایش مودال گزارش‌گیری
    
    document.getElementById('report-modal').classList.remove('hidden');
    setTimeout(() => updateMiniPreview(), 100);
};

const updateMiniPreview = () => {
    
    // بروزرسانی پیش‌نمایش مینیاتوری گزارش
    
    const reportHTML = buildReportHTML();
    const previewDiv = document.getElementById('report-mini-preview');
    const theme = document.getElementById('report-theme')?.value || 'dark';
    const bgColor = theme === 'dark' ? '#0d1117' : '#ffffff';

    previewDiv.style.backgroundColor = bgColor;
    previewDiv.innerHTML = `
        <div style="transform: scale(0.65); transform-origin: top right; width: 150%; background: ${bgColor};">
            ${reportHTML}
        </div>
    `;
};

const buildReportHTML = () => {
    const title = document.getElementById('report-title')?.value || 'گزارش پورتفوی Assetly';
    const theme = document.getElementById('report-theme')?.value || 'dark';
    const isDark = theme === 'dark';

    // ====================================================
    // 🎨 رنگ‌های تم
    // ====================================================
    const bgColor = isDark ? '#0d1117' : '#ffffff';
    const textColor = isDark ? '#c9d1d9' : '#1f2937';
    const cardBg = isDark ? '#161b22' : '#f9fafb';
    const borderColor = isDark ? '#30363d' : '#e5e7eb';
    const secondaryText = isDark ? '#8b949e' : '#6b7280';
    const tableHeaderBg = isDark ? '#1c2128' : '#f3f4f6';
    const tableRowEven = isDark ? '#1a1f2a' : '#f9fafb';
    const tableBorderColor = isDark ? '#21262d' : '#e5e7eb';
    const profitColor = isDark ? '#34d399' : '#059669';
    const lossColor = isDark ? '#f87171' : '#dc2626';
    const accentColor = isDark ? '#3b82f6' : '#2563eb';
    const printBgColor = isDark ? '#0d1117' : '#ffffff';

    // ====================================================
    // 📊 تبدیل نمودارها به عکس
    // ====================================================
    const chartCanvas = document.getElementById('portfolioChart');
    const pieCanvas = document.getElementById('portfolioPieChart');
    
    let chartImage = '';
    let pieImage = '';
    
    try { if (chartCanvas) chartImage = chartCanvas.toDataURL('image/png'); } catch (e) {}
    try { if (pieCanvas) pieImage = pieCanvas.toDataURL('image/png'); } catch (e) {}

    // ====================================================
    // 📅 تاریخ و زمان
    // ====================================================
    const date = new Date().toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
    const time = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

    // ====================================================
    // 💰 مقادیر از صفحه
    // ====================================================
    const usdAmount = document.getElementById('usd-amount')?.textContent || '0';
    const goldAmount = document.getElementById('gold-amount')?.textContent || '0';
    const btcAmount = document.getElementById('btc-amount')?.textContent || '0';
    const totalValue = document.getElementById('total-value')?.textContent || '-';
    const totalProfit = document.getElementById('total-profit')?.textContent || '-';
    const isPositive = !totalProfit.includes('-') && totalProfit !== '۰ ت' && totalProfit !== '0 ت';
    const profitClassColor = isPositive ? profitColor : lossColor;
    const dailyProfit = document.getElementById('daily-profit-toman')?.textContent || '-';
    const dailyPercent = document.getElementById('daily-profit-percent')?.textContent || '-';
    const yesterdayValue = document.getElementById('yesterday-value')?.textContent || '-';
    const balanceStatus = document.getElementById('balance-guidance-title')?.textContent || '-';
    const balanceText = document.getElementById('balance-guidance-text')?.textContent || '-';
    const maxAsset = document.getElementById('max-asset-name')?.textContent || '-';
    const maxPercent = document.getElementById('max-asset-percent')?.textContent || '-';

    // ====================================================
    // 🏗️ ساخت HTML گزارش
    // ====================================================
    let html = `
<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        @import url('https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css');
        
        /* ========================================== */
        /* 🔥 تنظیمات حیاتی برای پرینت */
        /* ========================================== */
        :root {
            color-scheme: ${isDark ? 'dark' : 'light'};
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
        }
        
        html {
            background-color: ${printBgColor} !important;
        }
        
        body {
            font-family: 'Vazirmatn', 'Tahoma', sans-serif;
            background-color: ${printBgColor} !important;
            color: ${textColor} !important;
            padding: 30px 25px;
            direction: rtl;
            line-height: 1.8;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
        }
        
        /* ========================================== */
        /* هدر گزارش */
        /* ========================================== */
        .report-header {
            text-align: center;
            margin-bottom: 35px;
            padding-bottom: 20px;
            border-bottom: 2px solid ${borderColor};
        }
        .report-header h1 {
            font-size: 28px;
            font-weight: 900;
            margin-bottom: 10px;
            color: ${accentColor};
        }
        .report-header .subtitle {
            color: ${secondaryText};
            font-size: 14px;
        }
        
        /* ========================================== */
        /* عنوان بخش‌ها */
        /* ========================================== */
        .section-title {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 16px;
            padding-right: 14px;
            border-right: 4px solid ${accentColor};
            color: ${textColor};
        }
        
        /* ========================================== */
        /* کارت‌ها */
        /* ========================================== */
        .card {
            background: ${cardBg} !important;
            border: 1px solid ${borderColor} !important;
            border-radius: 12px;
            padding: 18px;
            margin-bottom: 8px;
        }
        
        /* ========================================== */
        /* گریدها */
        /* ========================================== */
        .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            margin-bottom: 25px;
        }
        .grid-3 {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 12px;
            margin-bottom: 25px;
        }
        .section {
            margin-bottom: 30px;
        }
        
        /* ========================================== */
        /* جداول */
        /* ========================================== */
        .table-wrapper {
            overflow-x: auto;
            border-radius: 12px;
            border: 1px solid ${borderColor};
            margin-bottom: 25px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }
        thead {
            display: table-header-group;
        }
        thead tr {
            background-color: ${tableHeaderBg} !important;
        }
        thead th {
            padding: 14px 10px;
            text-align: right;
            border-bottom: 2px solid ${borderColor} !important;
            font-weight: 700;
            color: ${secondaryText};
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            white-space: nowrap;
        }
        tbody td {
            padding: 12px 10px;
            border-bottom: 1px solid ${tableBorderColor} !important;
            font-size: 13px;
        }
        tbody tr:nth-child(even) {
            background-color: ${tableRowEven} !important;
        }
        tbody tr:last-child td {
            border-bottom: none;
        }
        
        /* ========================================== */
        /* متن‌ها */
        /* ========================================== */
        .text-success { color: ${profitColor} !important; font-weight: 600; }
        .text-danger { color: ${lossColor} !important; font-weight: 600; }
        .text-muted { color: ${secondaryText}; font-size: 13px; }
        .text-lg { font-size: 26px; font-weight: 800; margin-bottom: 4px; }
        .font-mono { font-family: 'Courier New', 'Vazirmatn', monospace; direction: ltr; text-align: right; unicode-bidi: embed; }
        
        /* ========================================== */
        /* نمودارها */
        /* ========================================== */
        .chart-container {
            text-align: center;
            margin: 20px 0;
            padding: 15px;
            background: ${cardBg} !important;
            border-radius: 12px;
            border: 1px solid ${borderColor};
        }
        .chart-container img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
        }
        
        /* ========================================== */
        /* فوتر */
        /* ========================================== */
        .report-footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid ${borderColor};
            text-align: center;
            color: ${secondaryText};
            font-size: 12px;
        }
        
        /* ========================================== */
        /* کارت‌های مرکزچین */
        /* ========================================== */
        .card.text-center { text-align: center; }
        .card.text-center .text-muted { font-size: 12px; margin-bottom: 8px; }
        
        /* ========================================== */
        /* 🔥 استایل‌های پرینت */
        /* ========================================== */
        @media print {
            @page {
                margin: 12mm;
                size: A4;
                background-color: ${printBgColor} !important;
            }
            
            html, body {
                background-color: ${printBgColor} !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
            }
            
            .card {
                break-inside: avoid;
                page-break-inside: avoid;
                background: ${cardBg} !important;
                border: 1px solid ${borderColor} !important;
            }
            
            .chart-container {
                break-inside: avoid;
                page-break-inside: avoid;
                background: ${cardBg} !important;
            }
            
            table { break-inside: auto; }
            thead { display: table-header-group !important; }
            tbody { break-inside: auto; }
            tr { break-inside: avoid; page-break-inside: avoid; }
            .section { break-inside: avoid; }
            .no-print { display: none !important; }
        }
        
        /* ========================================== */
        /* ریسپانسیو */
        /* ========================================== */
        @media (max-width: 768px) {
            .grid-2, .grid-3 { grid-template-columns: 1fr; }
            body { padding: 15px 12px; }
            .text-lg { font-size: 20px; }
            table { font-size: 11px; }
        }
    </style>
</head>
<body>
    <div class="report-header">
        <h1>${title}</h1>
        <p class="subtitle">📅 تاریخ گزارش: ${date} | ⏰ ساعت: ${time}</p>
        <p class="subtitle">👤 کاربر: ${currentUser?.first_name || ''} ${currentUser?.last_name || ''}</p>
    </div>
`;

    // ====================================================
    // 1️⃣ خلاصه پورتفوی
    // ====================================================
    if (document.getElementById('report-summary')?.checked) {
        html += `
    <div class="section">
        <h2 class="section-title">📊 خلاصه پورتفوی</h2>
        <div class="grid-2">
            <div class="card">
                <p class="text-muted">ارزش کل پورتفوی</p>
                <p class="text-lg">${totalValue}</p>
            </div>
            <div class="card">
                <p class="text-muted">سود / زیان خالص</p>
                <p class="text-lg ${isPositive ? 'text-success' : 'text-danger'}">${totalProfit}</p>
            </div>
        </div>
    </div>`;
    }

    // ====================================================
    // 2️⃣ نمودار عملکرد
    // ====================================================
    if (document.getElementById('report-chart')?.checked && chartImage) {
        html += `
    <div class="section">
        <h2 class="section-title">📈 نمودار عملکرد پورتفوی</h2>
        <div class="chart-container">
            <img src="${chartImage}" alt="نمودار عملکرد">
        </div>
    </div>`;
    }

    // ====================================================
    // 3️⃣ نمودار دایره‌ای
    // ====================================================
    if (document.getElementById('report-pie')?.checked && pieImage) {
        html += `
    <div class="section">
        <h2 class="section-title">🥧 توزیع دارایی‌ها</h2>
        <div class="chart-container">
            <img src="${pieImage}" alt="نمودار دایره‌ای" style="max-width: 70%; margin: 0 auto;">
        </div>
    </div>`;
    }

    // ====================================================
    // 4️⃣ تحلیل تعادل (اومد بالا)
    // ====================================================
    if (document.getElementById('report-balance')?.checked) {
        html += `
    <div class="section">
        <h2 class="section-title">⚖️ تحلیل تعادل پورتفوی</h2>
        <div class="card">
            <p style="font-size: 18px; font-weight: 700; margin-bottom: 10px;">${balanceStatus}</p>
            <p class="text-muted" style="margin-bottom: 16px;">${balanceText}</p>
            <div style="background: ${printBgColor}; padding: 12px; border-radius: 8px; border: 1px solid ${borderColor};">
                <p style="font-size: 14px;">📊 <strong>بیشترین سهم:</strong> ${maxAsset}</p>
                <p style="font-size: 13px; color: ${secondaryText};">${maxPercent}</p>
            </div>
        </div>
    </div>`;
    }

    // ====================================================
    // 5️⃣ عملکرد روزانه
    // ====================================================
    if (document.getElementById('report-daily')?.checked) {
        html += `
    <div class="section">
        <h2 class="section-title">📅 عملکرد روزانه</h2>
        <div class="grid-3">
            <div class="card text-center">
                <p class="text-muted">سود / زیان امروز</p>
                <p class="text-lg" style="font-size: 22px;">${dailyProfit}</p>
            </div>
            <div class="card text-center">
                <p class="text-muted">درصد تغییر</p>
                <p class="text-lg" style="font-size: 22px;">${dailyPercent}</p>
            </div>
            <div class="card text-center">
                <p class="text-muted">ارزش دیروز</p>
                <p class="text-lg" style="font-size: 22px;">${yesterdayValue}</p>
            </div>
        </div>
    </div>`;
    }

    // ====================================================
    // 6️⃣ قدرت خرید
    // ====================================================
    if (document.getElementById('report-purchase-power')?.checked) {
        html += `
    <div class="section">
        <h2 class="section-title">💰 قدرت خرید</h2>
        <div class="grid-3">
            <div class="card text-center">
                <p class="text-muted">💵 دلار آمریکا</p>
                <p class="text-lg" style="font-size: 22px;">${usdAmount}</p>
            </div>
            <div class="card text-center">
                <p class="text-muted">🥇 گرم طلا</p>
                <p class="text-lg" style="font-size: 22px;">${goldAmount}</p>
            </div>
            <div class="card text-center">
                <p class="text-muted">₿ بیت‌کوین</p>
                <p class="text-lg" style="font-size: 22px;">${btcAmount}</p>
            </div>
        </div>
    </div>`;
    }

    // ====================================================
    // 7️⃣ دارایی‌های اسپات 
    // ====================================================
    if (document.getElementById('report-assets-table')?.checked && allAssets) {
        html += `
    <div class="section">
        <h2 class="section-title">📋 دارایی‌های اسپات</h2>
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th style="width: 20%;">نام دارایی</th>
                        <th style="width: 13%;">موجودی</th>
                        <th style="width: 13%;">قیمت لحظه‌ای</th>
                        <th style="width: 13%;">قیمت سر به سر</th>
                        <th style="width: 14%;">ارزش کل</th>
                        <th style="width: 14%;">سود / زیان</th>
                        <th style="width: 13%;">بازده</th>
                    </tr>
                </thead>
                <tbody>`;

        allAssets.forEach(asset => {
            if (asset.symbol === 'RIAL_WALLET' || parseFloat(asset.total_quantity) <= 0) return;

            const profit = parseFloat(asset.profit_loss);
            const returnPct = parseFloat(asset.return_pct);
            const profitClass = profit >= 0 ? 'text-success' : 'text-danger';
            const breakEven = formatToman(asset.break_even_price);
            const currentPrice = formatToman(asset.current_price);
            const currentValue = formatToman(asset.current_value);
            const profitDisplay = formatToman(asset.profit_loss);
            const returnDisplay = (returnPct >= 0 ? '+' : '') + returnPct.toFixed(2) + '%';

            html += `
                    <tr>
                        <td><strong>${asset.title}</strong></td>
                        <td class="font-mono">${formatPrice(asset.total_quantity)}</td>
                        <td class="font-mono">${currentPrice}</td>
                        <td class="font-mono">${breakEven}</td>
                        <td class="font-mono">${currentValue}</td>
                        <td class="font-mono ${profitClass}">${profitDisplay}</td>
                        <td class="font-mono ${profitClass}">${returnDisplay}</td>
                    </tr>`;
        });

        html += `
                </tbody>
            </table>
        </div>
    </div>`;
    }

    // ====================================================
    // 📄 فوتر
    // ====================================================
    html += `
    <div class="report-footer">
        <p style="margin-bottom: 5px;">📄 این گزارش توسط <strong>Assetly</strong> - سامانه مدیریت حرفه‌ای پورتفوی تولید شده است.</p>
        <p>🌐 assetly.ir</p>
        <p style="margin-top: 8px; font-size: 11px;">گزارش در تاریخ ${date} ساعت ${time} تهیه شده است.</p>
    </div>
</body>
</html>`;

    return html;
};

const openPreviewInNewTab = () => {
    
    // باز کردن پیش‌نمایش گزارش در تب جدید
    
    const reportHTML = buildReportHTML();
    const newWindow = window.open('', '_blank');
    newWindow.document.write(reportHTML);
    newWindow.document.close();
};

const downloadPDF = () => {
    
    // دانلود گزارش به صورت PDF (از طریق دیالوگ چاپ)
    
    const reportHTML = buildReportHTML();
    const newWindow = window.open('', '_blank');
    newWindow.document.write(reportHTML);
    newWindow.document.close();
    setTimeout(() => newWindow.print(), 500);
};


// ============================================================
//  بخش ۱۷: آزمون سنجش ریسک
// ============================================================

let riskTestAnswers = {};
let currentRiskQuestion = 0;
let suggestedPortfolioChart = null;

// ---------- سوالات آزمون ----------
const riskQuestions = [
    {
        text: "در مورد شرایط مالی فعلی‌تان کدام جمله بیشتر صدق می‌کند؟",
        options: [
            { text: "معمولاً برای مخارج ماهانه مشکل دارم", score: 0 },
            { text: "هزینه‌ها قابل کنترل هستند، ولی گاهی سخت می‌شود", score: 5 },
            { text: "وضعیت مالی‌ام باثبات است و پس‌انداز منظم دارم", score: 10 }
        ]
    },
    {
        text: "اگر بخواهید امروز سرمایه‌ای برای آینده کنار بگذارید، مبلغ احتمالی شما در چه دامنه‌ای قرار می‌گیرد؟",
        options: [
            { text: "بسیار محدود و کمتر از توان پس‌انداز", score: 0 },
            { text: "مقدار متوسط که بخشی از دارایی‌هایم محسوب می‌شود", score: 2 },
            { text: "مبلغ قابل توجه که فشار جدی به من وارد نمی‌کند", score: 4 },
            { text: "مقدار زیاد و آزاد برای سرمایه‌گذاری", score: 7 },
            { text: "مبلغ بسیار بالا و بدون وابستگی حیاتی به آن", score: 10 }
        ]
    },
    {
        text: "میزان استقلال مالی شما از خانواده چقدر است؟",
        options: [
            { text: "خانواده برای هزینه‌ها به من وابسته‌اند", score: 0 },
            { text: "ممکن است در آینده نیازمند کمک من باشند", score: 5 },
            { text: "به طور کامل مستقل هستیم و حمایتی نیاز نداریم", score: 10 }
        ]
    },
    {
        text: "برنامه‌ریزی شما در مورد کار و شغلتان چگونه است؟",
        options: [
            { text: "به دنبال شغل ثابت و کم‌ریسک هستم", score: 0 },
            { text: "شغلی می‌خواهم که آزادی عمل و درآمد مناسب داشته باشد", score: 5 },
            { text: "شغلی با درآمد بالا حتی اگر همراه با عدم‌اطمینان باشد", score: 10 }
        ]
    },
    {
        text: "در زندگی، سرمایه اصلی‌تان را چگونه به دست آورده‌اید؟",
        options: [
            { text: "بخش قابل توجهی از منابع من از کمک دیگران بوده", score: 2 },
            { text: "ترکیبی از تلاش شخصی و دریافت کمک", score: 6 },
            { text: "عمدتاً حاصل کار و تلاش خودم", score: 10 }
        ]
    },
    {
        text: "اگر همین امروز مبلغ چشمگیری به‌صورت ناگهانی دریافت کنید، چه می‌کنید؟",
        options: [
            { text: "ابتدا آن را در بانک نگه می‌دارم تا تصمیم بگیرم", score: 0 },
            { text: "آن را به دارایی‌های نسبتاً امن تبدیل می‌کنم (مسکن، طلا و …)", score: 3 },
            { text: "بخشی از آن را صرف تفریح و خرید می‌کنم و باقی را سرمایه‌گذاری می‌کنم", score: 7 },
            { text: "از آن برای شروع یک فعالیت یا کسب‌وکار جدید استفاده می‌کنم", score: 10 }
        ]
    },
    {
        text: "سبک رفتاری شما در مواجهه با تصمیم‌های غیرمنتظره چیست؟",
        options: [
            { text: "همیشه برنامه‌ریزی دقیق دارم و از تغییر ناگهانی خوشم نمی‌آید", score: 0 },
            { text: "معمولاً برنامه دارم اما گاهی تغییر می‌دهم", score: 5 },
            { text: "در لحظه تصمیم می‌گیرم و از تغییر استقبال می‌کنم", score: 10 }
        ]
    },
    {
        text: "عملکرد مالی گذشته شما در بازارهای مختلف چگونه بوده؟",
        options: [
            { text: "سرمایه‌گذاری نکرده‌ام", score: 0 },
            { text: "بخش مهمی از سرمایه‌ام را از دست داده‌ام", score: 2 },
            { text: "کمی ضرر کرده‌ام", score: 4 },
            { text: "سود منطقی کسب کرده‌ام", score: 7 },
            { text: "سود قابل توجهی داشته‌ام", score: 10 }
        ]
    },
    {
        text: "وقتی درباره ریسک فکر می‌کنید اولین احساسی که دارید چیست؟",
        options: [
            { text: "نگرانی و ترس از زیان", score: 0 },
            { text: "هم فرصت می‌بینم و هم تهدید", score: 5 },
            { text: "هیجان و امکان سود بالا", score: 10 }
        ]
    },
    {
        text: "وضعیت سنی و مرحله زندگی‌تان کدام است؟",
        options: [
            { text: "در ابتدای مسیر زندگی/شغلی (انرژی زیاد – محدودیت منابع)", score: 10 },
            { text: "در دوره ثبات شغلی و مالی", score: 5 },
            { text: "در مرحله‌ای هستم که تجربه زیاد و نگرانی کم‌تری دارم", score: 0 }
        ]
    }
];

// ---------- پورتفوی‌های پیشنهادی بر اساس نمره ----------
const suggestedPortfolios = {
    '0-10': [
        { name: 'درآمد ثابت', percent: 30, color: '#10b981' },
        { name: 'نقد', percent: 40, color: '#6b7280' },
        { name: 'دلار', percent: 10, color: '#3b82f6' },
        { name: 'طلا', percent: 20, color: '#f59e0b' }
    ],
    '11-20': [
        { name: 'درآمد ثابت', percent: 35, color: '#10b981' },
        { name: 'نقد', percent: 30, color: '#6b7280' },
        { name: 'طلا', percent: 20, color: '#f59e0b' },
        { name: 'دلار', percent: 15, color: '#3b82f6' }
    ],
    '21-30': [
        { name: 'درآمد ثابت', percent: 35, color: '#10b981' },
        { name: 'نقد', percent: 25, color: '#6b7280' },
        { name: 'تتر', percent: 10, color: '#14b8a6' },
        { name: 'دلار', percent: 10, color: '#3b82f6' },
        { name: 'طلا', percent: 20, color: '#f59e0b' }
    ],
    '31-40': [
        { name: 'درآمد ثابت', percent: 20, color: '#10b981' },
        { name: 'نقد', percent: 20, color: '#6b7280' },
        { name: 'طلا', percent: 20, color: '#f59e0b' },
        { name: 'تتر', percent: 15, color: '#14b8a6' },
        { name: 'صندوق انرژی', percent: 5, color: '#ef4444' },
        { name: 'دلار', percent: 10, color: '#3b82f6' },
        { name: 'صندوق نقره', percent: 5, color: '#94a3b8' },
        { name: 'بیت‌کوین', percent: 5, color: '#f7931a' }
    ],
    '41-50': [
        { name: 'درآمد ثابت', percent: 15, color: '#10b981' },
        { name: 'نقد', percent: 10, color: '#6b7280' },
        { name: 'طلا', percent: 30, color: '#f59e0b' },
        { name: 'صندوق انرژی', percent: 5, color: '#ef4444' },
        { name: 'دلار', percent: 20, color: '#3b82f6' },
        { name: 'بیت‌کوین', percent: 7, color: '#f7931a' },
        { name: 'تتر', percent: 10, color: '#14b8a6' },
        { name: 'صندوق شاخصی', percent: 3, color: '#8b5cf6' }
    ],
    '51-60': [
        { name: 'طلا', percent: 35, color: '#f59e0b' },
        { name: 'تتر', percent: 13.5, color: '#14b8a6' },
        { name: 'بیت‌کوین', percent: 12, color: '#f7931a' },
        { name: 'صندوق سهامی', percent: 5, color: '#3b82f6' },
        { name: 'صندوق انرژی', percent: 10, color: '#ef4444' },
        { name: 'نقد', percent: 3, color: '#6b7280' },
        { name: 'درآمد ثابت', percent: 9, color: '#10b981' },
        { name: 'صندوق شاخصی', percent: 6, color: '#8b5cf6' },
        { name: 'صندوق اهرمی', percent: 6.5, color: '#dc2626' }
    ],
    '61-70': [
        { name: 'طلا', percent: 28, color: '#f59e0b' },
        { name: 'تتر', percent: 12, color: '#14b8a6' },
        { name: 'بیت‌کوین', percent: 18, color: '#f7931a' },
        { name: 'صندوق سهامی', percent: 10, color: '#3b82f6' },
        { name: 'صندوق انرژی', percent: 12, color: '#ef4444' },
        { name: 'نقد', percent: 3, color: '#6b7280' },
        { name: 'درآمد ثابت', percent: 7, color: '#10b981' },
        { name: 'صندوق شاخصی', percent: 5, color: '#8b5cf6' },
        { name: 'صندوق اهرمی', percent: 5, color: '#dc2626' }
    ],
    '71-80': [
        { name: 'طلا', percent: 24, color: '#f59e0b' },
        { name: 'تتر', percent: 10, color: '#14b8a6' },
        { name: 'بیت‌کوین', percent: 22, color: '#f7931a' },
        { name: 'صندوق سهامی', percent: 15, color: '#3b82f6' },
        { name: 'صندوق انرژی', percent: 12, color: '#ef4444' },
        { name: 'نقد', percent: 3, color: '#6b7280' },
        { name: 'درآمد ثابت', percent: 4, color: '#10b981' },
        { name: 'صندوق شاخصی', percent: 5, color: '#8b5cf6' },
        { name: 'صندوق اهرمی', percent: 5, color: '#dc2626' }
    ],
    '81-90': [
        { name: 'طلا', percent: 18, color: '#f59e0b' },
        { name: 'تتر', percent: 8, color: '#14b8a6' },
        { name: 'بیت‌کوین', percent: 28, color: '#f7931a' },
        { name: 'صندوق سهامی', percent: 18, color: '#3b82f6' },
        { name: 'صندوق انرژی', percent: 12, color: '#ef4444' },
        { name: 'نقد', percent: 3, color: '#6b7280' },
        { name: 'درآمد ثابت', percent: 3, color: '#10b981' },
        { name: 'صندوق اهرمی', percent: 5, color: '#dc2626' },
        { name: 'صندوق شاخصی', percent: 5, color: '#8b5cf6' }
    ],
    '91-100': [
        { name: 'طلا', percent: 12, color: '#f59e0b' },
        { name: 'تتر', percent: 8, color: '#14b8a6' },
        { name: 'بیت‌کوین', percent: 35, color: '#f7931a' },
        { name: 'صندوق سهامی', percent: 20, color: '#3b82f6' },
        { name: 'صندوق انرژی', percent: 10, color: '#ef4444' },
        { name: 'نقد', percent: 3, color: '#6b7280' },
        { name: 'درآمد ثابت', percent: 2, color: '#10b981' },
        { name: 'صندوق اهرمی', percent: 5, color: '#dc2626' },
        { name: 'صندوق شاخصی', percent: 5, color: '#8b5cf6' }
    ]
};

const getPortfolioByScore = (score) => {
    
    // انتخاب پورتفوی پیشنهادی بر اساس نمره
    
    if (score <= 10) return suggestedPortfolios['0-10'];
    if (score <= 20) return suggestedPortfolios['11-20'];
    if (score <= 30) return suggestedPortfolios['21-30'];
    if (score <= 40) return suggestedPortfolios['31-40'];
    if (score <= 50) return suggestedPortfolios['41-50'];
    if (score <= 60) return suggestedPortfolios['51-60'];
    if (score <= 70) return suggestedPortfolios['61-70'];
    if (score <= 80) return suggestedPortfolios['71-80'];
    if (score <= 90) return suggestedPortfolios['81-90'];
    return suggestedPortfolios['91-100'];
};

const getRiskLevelText = (score) => {
    
    // متن توصیفی سطح ریسک‌پذیری
    
    if (score <= 20) return 'شما بسیار محافظه‌کار هستید و ریسک‌گریزی بالایی دارید.';
    if (score <= 40) return 'شما محافظه‌کار هستید و تمایل کمی به ریسک دارید.';
    if (score <= 60) return 'شما ریسک‌پذیری متعادلی دارید.';
    if (score <= 80) return 'شما ریسک‌پذیر هستید و به دنبال بازدهی بالاتر می‌باشید.';
    return 'شما بسیار ریسک‌پذیر هستید و تحمل نوسانات بالا را دارید.';
};

const renderRiskQuestion = () => {
    
    // نمایش سوال فعلی آزمون ریسک
    
    const container = document.getElementById('risk-question-container');
    if (!container) return;

    const question = riskQuestions[currentRiskQuestion];
    const savedAnswer = riskTestAnswers[currentRiskQuestion];

    let html = `
        <div class="mb-4">
            <p class="text-lg font-medium text-white mb-4">${currentRiskQuestion + 1}. ${question.text}</p>
            <div class="space-y-3">
    `;

    question.options.forEach((option, idx) => {
        const checked = savedAnswer === idx ? 'checked' : '';
        html += `
            <label class="flex items-start gap-3 p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700 transition">
                <input type="radio" name="risk-answer" value="${idx}" ${checked} class="mt-1">
                <span class="text-gray-300">${option.text}</span>
            </label>
        `;
    });

    html += `</div></div>`;
    container.innerHTML = html;

    document.getElementById('risk-prev-btn')?.classList.toggle('hidden', currentRiskQuestion === 0);

    const isLast = currentRiskQuestion === riskQuestions.length - 1;
    document.getElementById('risk-next-btn')?.classList.toggle('hidden', isLast);
    document.getElementById('risk-submit-btn')?.classList.toggle('hidden', !isLast);

    document.getElementById('risk-progress').textContent =
        `سوال ${currentRiskQuestion + 1} از ${riskQuestions.length}`;
};

const calculateRiskScore = () => {
    
    // محاسبه نمره کل آزمون ریسک
    
    let totalScore = 0;
    for (let i = 0; i < riskQuestions.length; i++) {
        const answerIdx = riskTestAnswers[i];
        if (answerIdx !== undefined) {
            totalScore += riskQuestions[i].options[answerIdx].score;
        }
    }
    return totalScore;
};

const renderSuggestedPortfolio = (score) => {
    
    // نمایش پورتفوی پیشنهادی بر اساس نمره ریسک
    
    const portfolio = getPortfolioByScore(score);

    document.getElementById('risk-score-display').textContent = score;
    document.getElementById('risk-level-text').textContent = getRiskLevelText(score);

    const ctx = document.getElementById('suggestedPortfolioChart')?.getContext('2d');
    if (ctx) {
        if (suggestedPortfolioChart) suggestedPortfolioChart.destroy();

        suggestedPortfolioChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: portfolio.map(p => p.name),
                datasets: [{
                    data: portfolio.map(p => p.percent),
                    backgroundColor: portfolio.map(p => p.color),
                    borderWidth: 2,
                    borderColor: '#161b22'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: { legend: { display: false } }
            }
        });
    }

    // ساخت legend
    const legendContainer = document.getElementById('suggested-portfolio-legend');
    if (legendContainer) {
        let legendHtml = '';
        portfolio.forEach(item => {
            legendHtml += `
                <div class="flex items-center justify-between p-2 hover:bg-gray-800 rounded">
                    <div class="flex items-center gap-2">
                        <div class="w-4 h-4 rounded" style="background-color: ${item.color};"></div>
                        <span class="text-sm text-gray-300">${item.name}</span>
                    </div>
                    <span class="font-mono text-sm text-white">${item.percent}%</span>
                </div>
            `;
        });
        legendContainer.innerHTML = legendHtml;
    }

    document.getElementById('risk-test-start')?.classList.add('hidden');
    document.getElementById('risk-test-result')?.classList.remove('hidden');

    localStorage.setItem('riskTestScore', score);
    localStorage.setItem('riskTestAnswers', JSON.stringify(riskTestAnswers));
};

const loadSavedRiskTest = () => {
    
    // لود نتیجه آزمون ریسک ذخیره شده
    
    const savedScore = localStorage.getItem('riskTestScore');
    if (savedScore) {
        const score = parseInt(savedScore);
        const savedAnswers = localStorage.getItem('riskTestAnswers');
        if (savedAnswers) {
            riskTestAnswers = JSON.parse(savedAnswers);
        }
        renderSuggestedPortfolio(score);
    }
};

const resetRiskTest = () => {
    
    // ریست آزمون ریسک برای شروع مجدد
    
    riskTestAnswers = {};
    currentRiskQuestion = 0;
    document.getElementById('risk-test-start')?.classList.remove('hidden');
    document.getElementById('risk-test-result')?.classList.add('hidden');
    localStorage.removeItem('riskTestScore');
    localStorage.removeItem('riskTestAnswers');
};


// ============================================================
//  بخش ۱۸: هدف سرمایه‌گذاری
// ============================================================

let investmentGoal = null;

const loadInvestmentGoal = () => {
    
    // لود هدف سرمایه‌گذاری از localStorage
    
    const saved = localStorage.getItem('investmentGoal');
    if (saved) {
        try {
            investmentGoal = JSON.parse(saved);
            updateGoalDisplay();
        } catch (e) {
            console.error('❌ خطا در لود هدف:', e);
        }
    }
};

const saveInvestmentGoal = (goal) => {
    
    // ذخیره هدف سرمایه‌گذاری جدید
    
    investmentGoal = { ...goal, startDate: new Date().toISOString() };
    localStorage.setItem('investmentGoal', JSON.stringify(investmentGoal));
    updateGoalDisplay();
};

const deleteInvestmentGoal = () => {
    
    // حذف هدف سرمایه‌گذاری
    
    investmentGoal = null;
    localStorage.removeItem('investmentGoal');
    updateGoalDisplay();
};

const calculateCurrentValue = (type) => {
    
    // محاسبه ارزش فعلی پورتفوی به واحد هدف
    // type: 'toman', 'dollar', 'gold', 'bitcoin'
    
    if (!allAssets || allAssets.length === 0) return 0;

    let totalValue = 0;
    allAssets.forEach(asset => {
        if (asset.symbol === 'RIAL_WALLET') {
            totalValue += parseFloat(asset.total_quantity) || 0;
        } else {
            totalValue += parseFloat(asset.current_value) || 0;
        }
    });

    if (type === 'toman') return totalValue;

    let usdPrice = 0, goldPrice = 0, btcPrice = 0;
    if (allPrices) {
        ['currency', 'gold_coin', 'crypto'].forEach(cat => {
            const items = allPrices[cat] || [];
            items.forEach(item => {
                if (item.symbol === 'USD') usdPrice = item.toman_price || item.price;
                if (item.symbol === 'IR_GOLD_18K') goldPrice = item.toman_price || item.price;
                if (item.symbol === 'BTC') btcPrice = item.toman_price || item.price;
            });
        });
    }

    if (type === 'dollar') return usdPrice > 0 ? totalValue / usdPrice : 0;
    if (type === 'gold') return goldPrice > 0 ? totalValue / goldPrice : 0;
    if (type === 'bitcoin') return btcPrice > 0 ? totalValue / btcPrice : 0;
    return totalValue;
};

const updateGoalDisplay = () => {
    
    // بروزرسانی نمایش هدف سرمایه‌گذاری
    
    const summaryText = document.getElementById('goal-summary-text');
    const btnText = document.getElementById('goal-btn-text');
    const deleteSection = document.getElementById('delete-goal-section');
    const noGoalMsg = document.getElementById('no-goal-message');
    const editBtn = document.getElementById('edit-goal-btn');

    if (!investmentGoal) {
        if (summaryText) summaryText.textContent = 'برای تنظیم هدف کلیک کنید';
        if (btnText) btnText.textContent = '+ افزودن هدف';
        if (deleteSection) deleteSection.classList.add('hidden');
        if (noGoalMsg) noGoalMsg.classList.remove('hidden');
        if (editBtn) editBtn.classList.add('hidden');

        ['toman', 'dollar', 'gold', 'bitcoin'].forEach(type => {
            document.getElementById(`goal-${type}`)?.classList.add('hidden');
        });
        document.getElementById('goal-deadline')?.classList.add('hidden');
        return;
    }

    if (btnText) btnText.textContent = '✏️ ویرایش';
    if (deleteSection) deleteSection.classList.remove('hidden');
    if (noGoalMsg) noGoalMsg.classList.add('hidden');
    if (editBtn) editBtn.classList.remove('hidden');

    const { type, amount, days } = investmentGoal;
    const currentRaw = calculateCurrentValue(type);

    let typeName = type === 'toman' ? 'تومانی' : (type === 'dollar' ? 'دلاری' : (type === 'gold' ? 'طلا' : 'بیت‌کوین'));
    let unit = type === 'toman' ? 'تومان' : (type === 'dollar' ? 'دلار' : (type === 'gold' ? 'گرم' : 'BTC'));

    if (summaryText) summaryText.textContent = `هدف ${typeName}: ${formatNumber(amount, type)} ${unit}`;

    // مخفی کردن همه نوع‌ها و نمایش نوع انتخاب شده
    ['toman', 'dollar', 'gold', 'bitcoin'].forEach(t => {
        document.getElementById(`goal-${t}`)?.classList.toggle('hidden', t !== type);
    });

    const current = currentRaw;
    const percent = Math.min(100, (current / amount) * 100);
    const remaining = Math.max(0, amount - current);
    const remainingPercent = 100 - percent;

    // نوار پیشرفت
    const barEl = document.getElementById(`goal-${type}-bar`);
    if (barEl) barEl.style.width = `${percent}%`;

    const currentEl = document.getElementById(`goal-${type}-current`);
    const targetEl = document.getElementById(`goal-${type}-target`);
    if (currentEl) currentEl.textContent = formatNumber(current, type);
    if (targetEl) targetEl.textContent = formatNumber(amount, type);

    // متن انگیزشی
    const motivationEl = document.getElementById(`goal-${type}-motivation`);
    if (motivationEl) {
        if (percent >= 100) {
            motivationEl.textContent = '🎉 تبریک! به هدفت رسیدی! 🎉';
            motivationEl.className = 'text-xs text-green-400 mt-2 text-center font-medium';
            showNotification('🎉 تبریک! به هدف سرمایه‌گذاری خود رسیدید!', 'success');
        } else {
            const remainingFormatted = formatNumber(remaining, type);
            motivationEl.textContent = `💪 فقط ${remainingFormatted} ${unit} دیگه مونده تا به هدفت برسی! (${remainingPercent.toFixed(1)}% باقی‌مونده)`;
            motivationEl.className = 'text-xs text-gray-500 mt-2 text-center';
        }
    }

    // مهلت زمانی
    const deadlineEl = document.getElementById('goal-deadline');
    const deadlineTextEl = document.getElementById('goal-deadline-text');
    if (days && deadlineEl && deadlineTextEl) {
        const startDate = new Date(investmentGoal.startDate);
        const targetDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
        const today = new Date();
        const daysLeft = Math.max(0, Math.ceil((targetDate - today) / (24 * 60 * 60 * 1000)));

        if (daysLeft > 0) {
            deadlineTextEl.textContent = `${daysLeft} روز تا پایان مهلت باقی‌مانده`;
            if (daysLeft <= 3) {
                showNotification(`⚠️ فقط ${daysLeft} روز تا پایان مهلت هدف باقی‌مانده!`, 'warning');
            }
        } else {
            deadlineTextEl.textContent = '⏰ مهلت به پایان رسیده است';
        }
        deadlineEl.classList.remove('hidden');
    } else {
        if (deadlineEl) deadlineEl.classList.add('hidden');
    }
};

const formatNumber = (num, type) => {
    
    // فرمت عدد بر اساس نوع هدف
    
    if (type === 'dollar') return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (type === 'gold') return `${num.toLocaleString('fa-IR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
    if (type === 'bitcoin') return `${num.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })}`;
    return num.toLocaleString('fa-IR');
};

const updateGoalAmountLabel = () => {
    
    // بروزرسانی لیبل فیلد مبلغ هدف بر اساس نوع انتخاب شده
    
    const type = document.querySelector('input[name="goal-type"]:checked')?.value;
    const label = document.getElementById('goal-amount-label');
    const equivalent = document.getElementById('goal-equivalent');

    if (type === 'toman') {
        if (label) label.textContent = 'مبلغ هدف (تومان)';
        if (equivalent) equivalent.textContent = '';
    } else if (type === 'dollar') {
        if (label) label.textContent = 'مبلغ هدف (دلار)';
        const usdPrice = allPrices?.currency?.find(i => i.symbol === 'USD')?.toman_price || 0;
        if (equivalent) equivalent.textContent = usdPrice ? `≈ ${usdPrice.toLocaleString('fa-IR')} تومان به ازای هر دلار` : '';
    } else if (type === 'gold') {
        if (label) label.textContent = 'مبلغ هدف (گرم طلا)';
        const goldPrice = allPrices?.gold_coin?.find(i => i.symbol === 'IR_GOLD_18K')?.toman_price || 0;
        if (equivalent) equivalent.textContent = goldPrice ? `≈ ${goldPrice.toLocaleString('fa-IR')} تومان به ازای هر گرم` : '';
    } else if (type === 'bitcoin') {
        if (label) label.textContent = 'مبلغ هدف (بیت‌کوین)';
        const btcPrice = allPrices?.crypto?.find(i => i.symbol === 'BTC')?.toman_price || 0;
        if (equivalent) equivalent.textContent = btcPrice ? `≈ ${btcPrice.toLocaleString('fa-IR')} تومان به ازای هر بیت‌کوین` : '';
    }
};


// ============================================================
//  بخش ۱۹: جستجوی دارایی در فرم تراکنش
// ============================================================

const populateAssetSelect = (filterText = '') => {
    const type = document.getElementById('asset-type').value;
    const select = document.getElementById('asset-name');
    const txType = document.getElementById('tx-type').value;

    if (!type || !allPrices[type]) {
        select.innerHTML = '<option value="">ابتدا نوع دارایی را انتخاب کنید</option>';
        select.disabled = true;
        return;
    }

    // ====================================================
    // 🔥 اگه نوع تراکنش "فروش" یا "سیو سود" باشه
    // فقط دارایی‌هایی که کاربر واقعاً داره رو نشون بده
    // ====================================================
    if (txType === 'sell' || txType === 'save_profit') {
        
        const ownedSymbols = allAssets
            .filter(a => a.symbol !== 'RIAL_WALLET' && parseFloat(a.total_quantity) > 0)
            .map(a => a.symbol);

        // فقط آیتم‌هایی که کاربر مالکشونه
        let items = allPrices[type].filter(item => ownedSymbols.includes(item.symbol));

        // اعمال فیلتر جستجو
        if (filterText) {
            const searchLower = filterText.toLowerCase();
            items = items.filter(item =>
                item.symbol.toLowerCase().includes(searchLower) ||
                (item.title || '').toLowerCase().includes(searchLower) ||
                (item.name || '').toLowerCase().includes(searchLower)
            );
        }

        if (items.length === 0) {
            select.innerHTML = '<option value="">شما هیچ دارایی از این نوع برای فروش ندارید</option>';
            select.disabled = true;
        } else {
            select.innerHTML = `
                <option value="">انتخاب کنید (${items.length} مورد)</option>
                ${items.map(a => {
                    const asset = allAssets.find(ua => ua.symbol === a.symbol);
                    const holding = asset ? formatPrice(asset.total_quantity) : '0';
                    return `<option value="${a.symbol}">${a.title || a.name} (${a.symbol}) - موجودی: ${holding}</option>`;
                }).join('')}
            `;
            select.disabled = false;
        }
        return;
    }

    // ====================================================
    // 📊 برای خرید - همه دارایی‌ها رو نشون بده (حالت عادی)
    // ====================================================
    let items = allPrices[type];

    if (filterText) {
        const searchLower = filterText.toLowerCase();
        items = items.filter(item =>
            item.symbol.toLowerCase().includes(searchLower) ||
            (item.title || '').toLowerCase().includes(searchLower) ||
            (item.name || '').toLowerCase().includes(searchLower)
        );
    }

    if (items.length === 0) {
        select.innerHTML = '<option value="">موردی یافت نشد</option>';
        select.disabled = true;
    } else {
        select.innerHTML = `
            <option value="">انتخاب کنید (${items.length} مورد)</option>
            ${items.map(a => `<option value="${a.symbol}">${a.title || a.name} (${a.symbol})</option>`).join('')}
        `;
        select.disabled = false;
    }
};

const updatePriceFromSymbol = () => {
    const symbol = document.getElementById('asset-name').value;
    const priceInput = document.getElementById('tx-price');
    const txType = document.getElementById('tx-type').value;

    if (symbol && allPrices) {
        const type = document.getElementById('asset-type').value;
        const categoryPrices = allPrices[type];

        if (categoryPrices) {
            const found = categoryPrices.find(item => item.symbol === symbol);
            if (found) {
                const price = found.toman_price || found.price;
                if (price && priceInput) {
                    priceInput.value = Math.round(parseFloat(price));

                    // 🔥 نمایش موجودی فعلی برای فروش
                    if (txType === 'sell' || txType === 'save_profit') {
                        const asset = allAssets.find(a => a.symbol === symbol);
                        if (asset) {
                            const holding = parseFloat(asset.total_quantity);
                            const msg = document.getElementById('tx-message');
                            if (msg) {
                                msg.innerHTML = `
                                    📦 موجودی فعلی: <strong>${holding}</strong> ${symbol}<br>
                                    💰 قیمت لحظه‌ای ${formatToman(price)} به صورت خودکار وارد شد
                                `;
                                msg.classList.remove('hidden', 'text-red-400');
                                msg.classList.add('text-blue-400', 'bg-blue-900/20', 'p-3', 'rounded-lg');
                                setTimeout(() => msg.classList.add('hidden'), 5000);
                            }
                        }
                    } else {
                        const msg = document.getElementById('tx-message');
                        if (msg) {
                            msg.textContent = `قیمت لحظه‌ای ${formatToman(price)} به صورت خودکار وارد شد`;
                            msg.classList.remove('hidden', 'text-red-400', 'text-blue-400', 'bg-blue-900/20');
                            msg.classList.add('text-green-400');
                            setTimeout(() => msg.classList.add('hidden'), 3000);
                        }
                    }
                }
            }
        }
    }
};


// ============================================================
//  بخش ۲۰: راه‌اندازی اولیه
// ============================================================

const initialize = async () => {
    // راه‌اندازی اصلی برنامه
    // ترتیب: تم → نوار قیمت → آزمون ریسک → هدف → تور → احراز هویت → داده‌ها
   
    initTheme();
    initPriceTicker();
    loadSavedRiskTest();
    loadInvestmentGoal();
    initOnboarding();

    const loggedIn = await checkAuth();
    if (!loggedIn) {
        showAuthModal('login');
    }

    await fetchPrices();

    if (loggedIn) {
        await fetchAssets();
        await fetchChartData();
        await updateDailyProfit();
    }

    // شروع تور راهنما با تأخیر
    setTimeout(() => {
        if (!localStorage.getItem('onboarding_completed')) {
            console.log('🎯 شروع تور راهنما...');
            startOnboarding();
        }
    }, 2000);

    updatePurchaseModeUI();

    // بروزرسانی دوره‌ای
    setInterval(fetchPrices, 60000);
    setInterval(() => { if (currentUser) updateDailyProfit(); }, 300000);
};


// ============================================================
//  بخش ۲۱: Event Listeners
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    //  مدیریت منوی کاربری
    // ==========================================

    document.getElementById('login-btn')?.addEventListener('click', () => showAuthModal('login'));

    document.getElementById('user-menu-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = document.getElementById('user-dropdown');
        const arrow = document.getElementById('user-menu-arrow');
        dropdown.classList.toggle('hidden');
        if (arrow) arrow.style.transform = dropdown.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
    });

    document.addEventListener('click', (e) => {
        const menu = document.getElementById('user-menu-btn');
        const dropdown = document.getElementById('user-dropdown');
        if (menu && dropdown && !menu.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
            const arrow = document.getElementById('user-menu-arrow');
            if (arrow) arrow.style.transform = 'rotate(0deg)';
        }
    });

    // ==========================================
    //  احراز هویت
    // ==========================================

    document.getElementById('close-auth-modal')?.addEventListener('click', () => {
        document.getElementById('auth-modal').classList.add('hidden');
    });

    document.getElementById('auth-tab-login')?.addEventListener('click', () => showAuthModal('login'));
    document.getElementById('auth-tab-register')?.addEventListener('click', () => showAuthModal('register'));
    document.getElementById('switch-to-register')?.addEventListener('click', () => showAuthModal('register'));
    document.getElementById('switch-to-login')?.addEventListener('click', () => showAuthModal('login'));

    // فرم ورود
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = { identifier: formData.get('identifier'), password: formData.get('password') };

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                currentUser = result.user;
                if (result.token) {
                    authToken = result.token;
                    localStorage.setItem('authToken', result.token);
                }
                updateUIForLoggedInUser();
                document.getElementById('auth-modal').classList.add('hidden');
                await fetchAssets();
                await fetchChartData();
                await updateDailyProfit();
            } else {
                showAuthMessage(result.error, 'error');
            }
        } catch (error) {
            console.error('❌ خطا در ورود:', error);
        }
    });

    // فرم ثبت‌نام
    document.getElementById('register-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const firstName = document.querySelector('#register-form input[name="first_name"]')?.value || '';
        const lastName = document.querySelector('#register-form input[name="last_name"]')?.value || '';
        const email = document.querySelector('#register-form input[name="email"]')?.value || '';
        const phone = document.querySelector('#register-form input[name="phone"]')?.value || '';
        const password = document.querySelector('#register-form input[name="password"]')?.value || '';
        const confirmPassword = document.querySelector('#register-form input[name="confirm_password"]')?.value || '';

        if (!firstName || !lastName || !email || !phone || !password || !confirmPassword) {
            showAuthMessage('لطفاً همه فیلدها را پر کنید', 'error');
            return;
        }

        if (password !== confirmPassword) {
            showAuthMessage('رمز عبور و تکرار آن مطابقت ندارند', 'error');
            return;
        }

        if (password.length < 6) {
            showAuthMessage('رمز عبور باید حداقل ۶ کاراکتر باشد', 'error');
            return;
        }

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ first_name: firstName, last_name: lastName, email, phone, password })
            });

            const result = await response.json();

            if (response.ok) {
                currentUser = result.user;
                if (result.token) {
                    authToken = result.token;
                    localStorage.setItem('authToken', result.token);
                }
                updateUIForLoggedInUser();
                document.getElementById('auth-modal').classList.add('hidden');

                await fetchAssets();
                await fetchChartData();
                await updateDailyProfit();

                showNotification(`✅ ${currentUser.first_name} عزیز، به Assetly خوش آمدید!`, 'success');

                setTimeout(() => {
                    localStorage.removeItem('onboarding_completed');
                    startOnboarding();
                }, 1000);
            } else {
                if (result.error && (result.error.includes('ایمیل') || result.error.includes('تلفن') || result.error.includes('مشخصات'))) {
                    showAuthMessage('این مشخصات قبلاً در سایت ثبت شده است. لطفاً وارد شوید.', 'error');
                    setTimeout(() => document.getElementById('switch-to-login')?.click(), 2000);
                } else {
                    showAuthMessage(result.error || 'خطا در ثبت‌نام', 'error');
                }
            }
        } catch (error) {
            console.error('❌ خطا در ثبت‌نام:', error);
            showAuthMessage('خطا در ارتباط با سرور', 'error');
        }
    });

    // ==========================================
    //  پروفایل و تغییر رمز
    // ==========================================

    ['close-profile-modal', 'cancel-profile-modal'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => {
            document.getElementById('profile-modal').classList.add('hidden');
        });
    });

    document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = { first_name: formData.get('first_name'), last_name: formData.get('last_name') };

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

            const response = await fetch('/api/auth/update-profile', {
                method: 'PUT', headers, body: JSON.stringify(data)
            });

            if (response.ok) {
                currentUser.first_name = data.first_name;
                currentUser.last_name = data.last_name;
                updateUIForLoggedInUser();
                document.getElementById('profile-modal').classList.add('hidden');
                showNotification('✅ پروفایل با موفقیت بروزرسانی شد', 'success');
            }
        } catch (error) {
            console.error('❌ خطا در بروزرسانی پروفایل:', error);
        }
    });

    ['close-password-modal', 'cancel-password-modal'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => {
            document.getElementById('change-password-modal').classList.add('hidden');
        });
    });

    document.getElementById('change-password-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            current_password: formData.get('current_password'),
            new_password: formData.get('new_password')
        };

        if (data.new_password !== formData.get('confirm_password')) {
            const msg = document.getElementById('password-message');
            msg.textContent = 'رمز عبور جدید و تکرار آن مطابقت ندارند';
            msg.classList.remove('hidden', 'text-green-400');
            msg.classList.add('text-red-400');
            return;
        }

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

            const response = await fetch('/api/auth/change-password', {
                method: 'POST', headers, body: JSON.stringify(data)
            });

            const result = await response.json();
            const msg = document.getElementById('password-message');

            if (response.ok) {
                msg.textContent = 'رمز عبور با موفقیت تغییر کرد';
                msg.classList.remove('hidden', 'text-red-400');
                msg.classList.add('text-green-400');
                setTimeout(() => document.getElementById('change-password-modal').classList.add('hidden'), 1500);
            } else {
                msg.textContent = result.error;
                msg.classList.remove('hidden', 'text-green-400');
                msg.classList.add('text-red-400');
            }
        } catch (error) {
            console.error('❌ خطا در تغییر رمز:', error);
        }
    });

    // ==========================================
    //  تراکنش‌ها
    // ==========================================

    document.getElementById('add-transaction-btn')?.addEventListener('click', () => {
        document.getElementById('transaction-form')?.reset();
        document.getElementById('tx-message')?.classList.add('hidden');
        document.getElementById('tx-date').value = '';
        document.getElementById('tx-type')?.dispatchEvent(new Event('change'));
        document.getElementById('transaction-modal')?.classList.remove('hidden');
    });

    document.getElementById('quick-add-transaction-btn')?.addEventListener('click', () => {
        document.getElementById('add-transaction-btn')?.click();
    });

    // بستن مودال‌ها
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById(btn.dataset.closeModal)?.classList.add('hidden');
        });
    });

    document.querySelectorAll('.fixed.inset-0').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    });

    // تغییر نوع تراکنش
    document.getElementById('tx-type')?.addEventListener('change', (e) => {
    const isWalletTx = e.target.value === 'deposit' || e.target.value === 'withdrawal';
    document.getElementById('asset-type-group')?.classList.toggle('hidden', isWalletTx);
    document.getElementById('asset-name-group')?.classList.toggle('hidden', isWalletTx);
    document.getElementById('price-per-unit-group')?.classList.toggle('hidden', isWalletTx);
    document.getElementById('category-group')?.classList.toggle('hidden', isWalletTx);

    const quantityLabel = document.getElementById('quantity-label');
    if (isWalletTx) {
        document.getElementById('asset-name').value = 'RIAL_WALLET';
        if (quantityLabel) quantityLabel.textContent = e.target.value === 'deposit'
            ? 'مقدار واریز (تومان)'
            : 'مقدار برداشت (تومان)';
        document.getElementById('tx-price').value = '1';
    } else {
        if (quantityLabel) quantityLabel.textContent = 'مقدار';
        
        // 🔥 اگر نوع تراکنش عوض شد، لیست دارایی‌ها رو دوباره لود کن
        const searchInput = document.getElementById('asset-search-input');
        if (searchInput) searchInput.value = '';
        populateAssetSelect('');
    }
    updateWalletBalanceDisplay();
});

    // تغییر نوع دارایی
    document.getElementById('asset-type')?.addEventListener('change', () => {
        document.getElementById('asset-search-input').value = '';
        populateAssetSelect('');
    });

    // جستجوی دارایی
    document.getElementById('asset-search-input')?.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        populateAssetSelect(query);
    });

    document.getElementById('asset-search-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const select = document.getElementById('asset-name');
            if (select.options.length > 1) select.focus();
        }
    });

    // انتخاب دارایی - پر کردن خودکار قیمت
    document.getElementById('asset-name')?.addEventListener('change', updatePriceFromSymbol);

    // ثبت تراکنش
    document.getElementById('transaction-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    data.quantity = parseFloat(data.quantity);
    if (data.price_per_unit) data.price_per_unit = parseFloat(data.price_per_unit);
    
    data.date = data.date
        ? new Date(data.date + 'T12:00:00Z').toISOString()
        : new Date().toISOString();
    
    if (data.type === 'deposit' || data.type === 'withdrawal') {
        data.symbol = 'RIAL_WALLET';
    }

    // ====================================================
    // 🔥 بررسی موجودی برای فروش و سیو سود (اعتبارسنجی)
    // ====================================================
    if (data.type === 'sell' || data.type === 'save_profit') {
        
        // پیدا کردن دارایی توی پورتفوی کاربر
        const asset = allAssets.find(a => a.symbol === data.symbol);
        
        if (!asset) {
            showNotification(
                `❌ شما هیچ موجودی از "${data.symbol}" در پورتفوی خود ندارید.\nابتدا باید این دارایی را خریداری کنید.`,
                'error',
                7000
            );
            return;
        }

        const currentHolding = parseFloat(asset.total_quantity);
        
        if (data.quantity <= 0) {
            showNotification('❌ مقدار فروش باید بیشتر از صفر باشد.', 'error');
            return;
        }

        if (data.quantity > currentHolding) {
            showNotification(
                `❌ موجودی شما کافی نیست!\n\n` +
                `📦 موجودی فعلی ${data.symbol}: ${formatPrice(currentHolding)}\n` +
                `📝 مقدار درخواستی شما: ${formatPrice(data.quantity)}\n\n` +
                `⚠️ شما ${formatPrice(data.quantity - currentHolding)} بیشتر از موجودی خود درخواست داده‌اید.`,
                'error',
                8000
            );
            return;
        }

        // هشدار برای فروش کل موجودی
        if (Math.abs(data.quantity - currentHolding) < 0.00000001) {
            const confirmed = confirm(
                `⚠️ هشدار: فروش تمام موجودی\n\n` +
                `شما در حال فروش کل موجودی "${data.symbol}" خود هستید.\n` +
                `موجودی فعلی: ${formatPrice(currentHolding)}\n\n` +
                `پس از این تراکنش، دیگر این دارایی را در پورتفوی خود نخواهید داشت.\n\n` +
                `آیا مطمئن هستید؟`
            );
            
            if (!confirmed) {
                showNotification('🔄 فروش لغو شد.', 'info');
                return;
            }
        }
    }

    // ====================================================
    // 📤 ارسال به سرور
    // ====================================================
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers,
            body: JSON.stringify(data)
        });

        if (response.ok) {
            document.getElementById('transaction-modal')?.classList.add('hidden');
            
            // رفرش داده‌ها
            await fetchAssets();
            await fetchChartData();
            await updateDailyProfit();
            
            // پیغام موفقیت
            const successMessages = {
                'buy': '✅ خرید با موفقیت ثبت شد',
                'sell': '✅ فروش با موفقیت ثبت شد',
                'save_profit': '✅ سیو سود با موفقیت ثبت شد',
                'deposit': '✅ واریز با موفقیت ثبت شد',
                'withdrawal': '✅ برداشت با موفقیت ثبت شد'
            };
            showNotification(successMessages[data.type] || '✅ تراکنش با موفقیت ثبت شد', 'success');
            
        } else {
            const error = await response.json();
            showNotification(`❌ ${error.error}`, 'error', 8000);
        }
        
    } catch (error) {
        console.error('❌ خطا در ثبت تراکنش:', error);
        showNotification('❌ خطای شبکه یا سرور رخ داد. لطفاً دوباره تلاش کنید.', 'error');
    }
});

    // ویرایش تراکنش
    document.getElementById('edit-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const transactionId = document.getElementById('edit-transaction-id').value;
        const data = {
            type: document.getElementById('edit-tx-type').value,
            date: document.getElementById('edit-tx-date').value
                ? new Date(document.getElementById('edit-tx-date').value + 'T12:00:00Z').toISOString()
                : null,
            category: document.getElementById('edit-tx-category').value,
            quantity: parseFloat(document.getElementById('edit-tx-quantity').value),
            price_per_unit: document.getElementById('edit-tx-price').value
                ? parseFloat(document.getElementById('edit-tx-price').value)
                : null,
            comment: document.getElementById('edit-tx-comment').value
        };

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

            const response = await fetch(`/api/transactions/${transactionId}`, {
                method: 'PUT', headers, body: JSON.stringify(data)
            });
            if (response.ok) {
                document.getElementById('edit-modal').classList.add('hidden');
                document.getElementById('history-modal').classList.add('hidden');
                await fetchAssets();
                await fetchChartData();
                await updateDailyProfit();
                showNotification('✅ تراکنش با موفقیت ویرایش شد', 'success');
            } else {
                const error = await response.json();
                showNotification(`❌ ${error.error}`, 'error');
            }
        } catch (error) {
            showNotification('❌ خطای شبکه', 'error');
        }
    });

    document.getElementById('reset-date')?.addEventListener('click', () => {
        document.getElementById('tx-date').value = '';
    });

    // ==========================================
    //  حالت خرید
    // ==========================================

    document.getElementById('purchase-mode-balance')?.addEventListener('click', () => {
        purchaseMode = 'balance';
        updatePurchaseModeUI();
        updatePurchasePowerBox();
    });

    document.getElementById('purchase-mode-portfolio')?.addEventListener('click', () => {
        purchaseMode = 'portfolio';
        updatePurchaseModeUI();
        updatePurchasePowerBox();
    });

    // ==========================================
    //  تراکنش‌های اخیر
    // ==========================================

    document.getElementById('toggle-transactions-btn')?.addEventListener('click', toggleTransactionsView);
    document.getElementById('load-more-transactions-btn')?.addEventListener('click', toggleTransactionsView);

    // ==========================================
    //  گزارش‌گیری
    // ==========================================

    document.getElementById('close-report-modal')?.addEventListener('click', () => {
        document.getElementById('report-modal').classList.add('hidden');
    });

    document.getElementById('preview-report-btn')?.addEventListener('click', openPreviewInNewTab);
    document.getElementById('print-report-btn')?.addEventListener('click', downloadPDF);

    ['report-summary', 'report-chart', 'report-pie', 'report-balance',
     'report-assets-table', 'report-daily', 'report-purchase-power'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', updateMiniPreview);
    });

    document.getElementById('report-title')?.addEventListener('input', updateMiniPreview);
    document.getElementById('report-theme')?.addEventListener('change', updateMiniPreview);

    // ==========================================
    //  مدیریت API
    // ==========================================

    document.getElementById('close-api-modal')?.addEventListener('click', () => {
        document.getElementById('api-management-modal').classList.add('hidden');
    });

    document.getElementById('generate-api-key-btn')?.addEventListener('click', generateApiKey);
    document.getElementById('regenerate-api-key-btn')?.addEventListener('click', generateApiKey);
    document.getElementById('revoke-api-key-btn')?.addEventListener('click', revokeApiKey);
    document.getElementById('copy-api-key-btn')?.addEventListener('click', copyApiKey);
    document.getElementById('refresh-api-preview')?.addEventListener('click', loadApiJsonPreview);

    // ==========================================
    //  مدیریت داده‌ها
    // ==========================================

    document.getElementById('close-data-modal')?.addEventListener('click', () => {
        document.getElementById('data-management-modal').classList.add('hidden');
    });

    document.getElementById('export-data-btn')?.addEventListener('click', exportUserData);

    const dropzone = document.getElementById('import-dropzone');
    const fileInput = document.getElementById('import-file-input');

    dropzone?.addEventListener('click', () => fileInput.click());
    dropzone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('border-blue-500');
    });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('border-blue-500'));
    dropzone?.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-blue-500');
        handleFileSelect(e.dataTransfer.files[0]);
    });

    fileInput?.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
    document.getElementById('import-data-btn')?.addEventListener('click', importUserData);

    // ==========================================
    //  آزمون ریسک
    // ==========================================

    document.getElementById('start-risk-test-btn')?.addEventListener('click', () => {
        resetRiskTest();
        currentRiskQuestion = 0;
        renderRiskQuestion();
        document.getElementById('risk-test-modal').classList.remove('hidden');
    });

    document.getElementById('retake-risk-test-btn')?.addEventListener('click', () => {
        resetRiskTest();
        currentRiskQuestion = 0;
        renderRiskQuestion();
        document.getElementById('risk-test-modal').classList.remove('hidden');
    });

    document.getElementById('close-risk-modal')?.addEventListener('click', () => {
        document.getElementById('risk-test-modal').classList.add('hidden');
    });

    document.getElementById('risk-prev-btn')?.addEventListener('click', () => {
        const selected = document.querySelector('input[name="risk-answer"]:checked');
        if (selected) riskTestAnswers[currentRiskQuestion] = parseInt(selected.value);
        if (currentRiskQuestion > 0) {
            currentRiskQuestion--;
            renderRiskQuestion();
        }
    });

    document.getElementById('risk-next-btn')?.addEventListener('click', () => {
        const selected = document.querySelector('input[name="risk-answer"]:checked');
        if (!selected) {
            alert('لطفاً یک گزینه را انتخاب کنید.');
            return;
        }
        riskTestAnswers[currentRiskQuestion] = parseInt(selected.value);
        if (currentRiskQuestion < riskQuestions.length - 1) {
            currentRiskQuestion++;
            renderRiskQuestion();
        }
    });

    document.getElementById('risk-submit-btn')?.addEventListener('click', () => {
        const selected = document.querySelector('input[name="risk-answer"]:checked');
        if (!selected) {
            alert('لطفاً یک گزینه را انتخاب کنید.');
            return;
        }
        riskTestAnswers[currentRiskQuestion] = parseInt(selected.value);

        if (Object.keys(riskTestAnswers).length < riskQuestions.length) {
            alert('لطفاً به همه سوالات پاسخ دهید.');
            return;
        }

        const score = calculateRiskScore();
        renderSuggestedPortfolio(score);
        document.getElementById('risk-test-modal').classList.add('hidden');
        showNotification(`✅ آزمون با موفقیت انجام شد! نمره شما: ${score} از ۱۰۰`, 'success');
    });

    // ==========================================
    //  هدف سرمایه‌گذاری
    // ==========================================

    document.getElementById('add-goal-btn')?.addEventListener('click', () => {
        document.getElementById('goal-form').reset();
        if (investmentGoal) {
            document.querySelector(`input[name="goal-type"][value="${investmentGoal.type}"]`).checked = true;
            document.getElementById('goal-amount').value = investmentGoal.amount;
            document.getElementById('goal-days').value = investmentGoal.days || '';
            updateGoalAmountLabel();
        }
        document.getElementById('goal-modal').classList.remove('hidden');
    });

    document.getElementById('add-goal-btn-secondary')?.addEventListener('click', () => {
        document.getElementById('add-goal-btn').click();
    });

    document.getElementById('edit-goal-btn')?.addEventListener('click', () => {
        document.getElementById('add-goal-btn').click();
    });

    ['close-goal-modal', 'cancel-goal-modal'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => {
            document.getElementById('goal-modal').classList.add('hidden');
        });
    });

    document.querySelectorAll('input[name="goal-type"]').forEach(radio => {
        radio.addEventListener('change', updateGoalAmountLabel);
    });

    document.getElementById('delete-goal-btn')?.addEventListener('click', () => {
        if (confirm('آیا مطمئن هستید که می‌خواهید هدف را حذف کنید؟')) {
            deleteInvestmentGoal();
            document.getElementById('goal-modal').classList.add('hidden');
            document.getElementById('goal-expanded').classList.add('hidden');
            document.getElementById('goal-expand-icon').style.transform = 'rotate(0deg)';
        }
    });

    document.getElementById('goal-form')?.addEventListener('submit', (e) => {
        e.preventDefault();

        const type = document.querySelector('input[name="goal-type"]:checked').value;
        const amount = parseFloat(document.getElementById('goal-amount').value);
        const days = document.getElementById('goal-days').value
            ? parseInt(document.getElementById('goal-days').value)
            : null;

        if (!amount || amount <= 0) {
            alert('لطفاً مبلغ هدف را وارد کنید.');
            return;
        }

        saveInvestmentGoal({ type, amount, days });
        document.getElementById('goal-modal').classList.add('hidden');
        document.getElementById('goal-expanded').classList.remove('hidden');
        document.getElementById('goal-expand-icon').style.transform = 'rotate(180deg)';
        showNotification('✅ هدف سرمایه‌گذاری با موفقیت ذخیره شد', 'success');
    });

    // باز و بسته شدن بخش هدف
    document.getElementById('goal-collapsed')?.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const expanded = document.getElementById('goal-expanded');
        const icon = document.getElementById('goal-expand-icon');
        expanded.classList.toggle('hidden');
        if (icon) icon.style.transform = expanded.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
    });

    // ==========================================
    //  شروع برنامه
    // ==========================================
    initialize();
});


// ============================================================
//  Export توابع گلوبال
// ============================================================

window.logout = logout;
window.openWalletModal = openWalletModal;
window.openHistoryModal = openHistoryModal;
window.openEditModal = openEditModal;
window.deleteTransaction = deleteTransaction;
window.openValueAnalysisModal = openValueAnalysisModal;
window.showDailyHistory = showDailyHistory;
window.openProfileModal = openProfileModal;
window.openChangePasswordModal = openChangePasswordModal;
window.openApiManagementModal = openApiManagementModal;
window.openDataManagementModal = openDataManagementModal;
window.openReportModal = openReportModal;
window.toggleTheme = toggleTheme;
window.copyDirectLink = copyDirectLink;
window.toggleFavorite = (symbol) => {
    // هندلر toggleFavorite
    // در markets.js پیاده‌سازی شده است
};