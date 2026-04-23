// --- Global Variables ---
let allPrices = {};
let allAssets = [];
let portfolioChart = null;
let portfolioPieChart = null;
let purchaseMode = 'balance';
let tickerVisible = true;


// --- متغیرهای نوار قیمت ---
let tickerAnimationFrame = null;
let tickerPosition = 0;
let tickerSpeed = 0.5;
let tickerPaused = false;
let tickerContainer = null;
let tickerContent = null;
let tickerContentWidth = 0;

// --- Authentication ---
let currentUser = null;
let authToken = null;

// --- متغیرهای سرچ دارایی ---
let allAssetOptions = [];
let assetSearchTimeout = null;
let allTransactionsCache = [];
let showingAllTransactions = false;
const DEFAULT_TRANSACTION_COUNT = 3;

// --- Theme ---
let currentTheme = 'dark';

// --- لیست نمادهای نوار قیمت ---
const TICKER_SYMBOLS = {
    gold_coin: ['IR_GOLD_18K', 'IR_GOLD_24K', 'IR_COIN_BAHAR', 'IR_COIN_EMAMI', 'IR_COIN_HALF', 'IR_COIN_QUARTER', 'IR_COIN_1G', 'XAUUSD'],
    currency: ['USD', 'EUR', 'GBP', 'USDT_IRT', 'AED', 'CAD'],
    crypto: ['BTC', 'ETH', 'BNB', 'DOGE', 'ADA', 'ATOM', 'LINK', 'LTC']
};

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

// --- Toast Notification System ---
let activeToast = null;
let toastTimeout = null;

const showNotification = (message, type = 'success', duration = 5000) => {
    // حذف نوتیفیکیشن قبلی
    if (activeToast) {
        clearTimeout(toastTimeout);
        activeToast.remove();
        activeToast = null;
    }
    
    // تنظیم آیکون بر اساس نوع
    let icon = '✅';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else if (type === 'warning') icon = '⚠️';
    else if (type === 'info') icon = 'ℹ️';
    
    // ساخت نوتیفیکیشن
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
    
    // حذف خودکار بعد از duration
    toastTimeout = setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('toast-hiding');
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
                if (activeToast === toast) {
                    activeToast = null;
                }
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

// --- Helper Functions ---
const formatToman = (numberString) => {
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
    if (!numberString && numberString !== 0) return '0.00%';
    const number = parseFloat(numberString);
    if (isNaN(number)) return '-';
    const sign = number >= 0 ? '+' : '';
    return `${sign}${number.toFixed(2)}%`;
};

const formatPrice = (price) => {
    const num = parseFloat(price);
    if (isNaN(num)) return '0';
    return num.toLocaleString('fa-IR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
};

const getStatusColor = (value) => {
    const num = parseFloat(value);
    return num >= 0 ? 'success' : 'danger';
};

const formatPersianDate = (dateString) => {
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

// --- API Error Popup ---
const showApiErrorPopup = (message) => {
    const popup = document.createElement('div');
    popup.className = 'fixed top-4 right-4 z-50 bg-yellow-600 text-white p-4 rounded-lg shadow-lg max-w-sm';
    popup.innerHTML = `
        <div class="flex items-start">
            <svg class="w-6 h-6 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.998-.833-2.732 0L4.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
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

const showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 left-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white transition-all duration-300 transform translate-y-0 ${
        type === 'success' ? 'bg-green-600' : 'bg-red-600'
    }`;
    toast.innerHTML = `
        <div class="flex items-center gap-2">
            <span>${type === 'success' ? '✅' : '❌'}</span>
            <span>${message}</span>
        </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('translate-y-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// --- Theme Management ---
const getSystemTheme = () => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
    }
    return 'dark';
};

const setTheme = (theme) => {
    currentTheme = theme;
    
    if (theme === 'light') {
        document.body.classList.add('light-theme');
        
        const menuIcon = document.getElementById('theme-toggle-icon');
        const menuText = document.getElementById('theme-toggle-text');
        
        if (menuIcon) menuIcon.textContent = '☀️';
        if (menuText) menuText.textContent = 'تم روشن';
        
        if (portfolioChart) {
            portfolioChart.options.scales.x.ticks.color = '#4b5563';
            portfolioChart.options.scales.y.ticks.color = '#4b5563';
            portfolioChart.options.scales.x.grid.color = '#e5e7eb';
            portfolioChart.options.scales.y.grid.color = '#e5e7eb';
            portfolioChart.update();
        }
        
        if (portfolioPieChart) {
            portfolioPieChart.update();
        }
    } else {
        document.body.classList.remove('light-theme');
        
        const menuIcon = document.getElementById('theme-toggle-icon');
        const menuText = document.getElementById('theme-toggle-text');
        
        if (menuIcon) menuIcon.textContent = '🌙';
        if (menuText) menuText.textContent = 'تم تاریک';
        
        if (portfolioChart) {
            portfolioChart.options.scales.x.ticks.color = '#8b949e';
            portfolioChart.options.scales.y.ticks.color = '#8b949e';
            portfolioChart.options.scales.x.grid.color = '#30363d';
            portfolioChart.options.scales.y.grid.color = '#30363d';
            portfolioChart.update();
        }
        
        if (portfolioPieChart) {
            portfolioPieChart.update();
        }
    }
    
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    document.cookie = `theme=${theme}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
};

const toggleTheme = () => {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
};

const initTheme = () => {
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
        const systemTheme = getSystemTheme();
        setTheme(systemTheme);
    }
    
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
            const cookies = document.cookie.split(';');
            let hasUserPreference = false;
            
            for (let cookie of cookies) {
                if (cookie.trim().startsWith('theme=')) {
                    hasUserPreference = true;
                    break;
                }
            }
            
            if (!hasUserPreference) {
                setTheme(e.matches ? 'light' : 'dark');
            }
        });
    }
};

// --- Authentication Functions ---
const checkAuth = async () => {
    let token = localStorage.getItem('authToken');
    
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
    
    if (token) {
        authToken = token;
    }
    
    try {
        const headers = {};
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }
        
        const response = await fetch('/api/auth/me', { headers });
        if (response.ok) {
            currentUser = await response.json();
            updateUIForLoggedInUser();
            return true;
        }
    } catch (error) {
        console.log('Not logged in');
    }
    
    updateUIForLoggedOutUser();
    return false;
};

const updateUIForLoggedInUser = () => {
    document.getElementById('login-btn')?.classList.add('hidden');
    document.getElementById('user-menu-btn')?.classList.remove('hidden');
    
    const greeting = document.getElementById('user-greeting');
    if (greeting) {
        greeting.textContent = `پنل کاربری`;
    }
    
    const dropdownName = document.getElementById('dropdown-fullname');
    if (dropdownName) {
        dropdownName.textContent = `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`;
    }
    
    const dropdownEmail = document.getElementById('dropdown-email');
    if (dropdownEmail) {
        dropdownEmail.textContent = currentUser?.email || '';
    }
};

const updateUIForLoggedOutUser = () => {
    document.getElementById('login-btn')?.classList.remove('hidden');
    document.getElementById('user-menu-btn')?.classList.add('hidden');
    currentUser = null;
    authToken = null;
};

const showAuthModal = (mode = 'login') => {
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
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
        });
    } catch (e) {}
    
    localStorage.removeItem('authToken');
    localStorage.removeItem('favoriteMarkets');
    localStorage.removeItem('investmentGoal');
    localStorage.removeItem('riskTestScore');
    localStorage.removeItem('riskTestAnswers');
    
    currentUser = null;
    authToken = null;
    
    updateUIForLoggedOutUser();
    document.getElementById('user-dropdown').classList.add('hidden');
    
    window.location.reload();
};

const openProfileModal = () => {
    document.getElementById('profile-first-name').value = currentUser?.first_name || '';
    document.getElementById('profile-last-name').value = currentUser?.last_name || '';
    document.getElementById('profile-email').value = currentUser?.email || '';
    document.getElementById('profile-phone').value = currentUser?.phone || '';
    document.getElementById('profile-modal').classList.remove('hidden');
};

const openChangePasswordModal = () => {
    document.getElementById('change-password-form').reset();
    document.getElementById('password-message').classList.add('hidden');
    document.getElementById('change-password-modal').classList.remove('hidden');
};

// --- API Calls ---
const fetchPrices = async () => {
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
        console.error('Error fetching prices:', error);
        showApiErrorPopup('خطا در برقراری ارتباط با سرور قیمت‌ها');
    }
};

const fetchAssets = async () => {
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        
        const response = await fetch('/api/assets', { headers });
        if (!response.ok) throw new Error('Failed to fetch assets');
        allAssets = await response.json();
        renderAssetsDashboard(allAssets);
        loadRecentTransactions();
        updateWalletBalanceDisplay();
        updatePurchasePowerBox();
        updateDailyProfit();
        if (investmentGoal) updateGoalDisplay();
    } catch (error) {
        console.error('Error fetching assets:', error);
        document.getElementById('assets-table-body').innerHTML = '<tr><td colspan="7" class="py-4 text-center text-red-400">خطا در بارگذاری دارایی‌ها</td></tr>';
    }
};

const fetchChartData = async () => {
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        
        const response = await fetch('/api/chart-data', { headers });
        if (!response.ok) throw new Error('Failed to fetch chart data');
        const data = await response.json();
        renderChart(data);
    } catch (error) {
        console.error('Error fetching chart data:', error);
    }
};

const updateDailyProfit = async () => {
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
        console.error('Error updating daily profit:', error);
    }
};

// --- نوار قیمت ---
const renderPriceTicker = (prices) => {
    tickerContainer = document.getElementById('ticker-scroll');
    if (!tickerContainer) return;
    
    if (tickerAnimationFrame) {
        cancelAnimationFrame(tickerAnimationFrame);
        tickerAnimationFrame = null;
    }
    
    if (!prices || Object.keys(prices).length === 0) {
        tickerContainer.innerHTML = '<div class="text-gray-500 text-sm py-2 px-4">منتظر قیمت‌ها...</div>';
        return;
    }
    
    const categories = [
        { key: 'gold_coin', name: '🏆 طلا و سکه', color: 'bg-yellow-600/20 text-yellow-400 border-yellow-600' },
        { key: 'currency', name: '💵 ارزها', color: 'bg-green-600/20 text-green-400 border-green-600' },
        { key: 'crypto', name: '₿ ارز دیجیتال', color: 'bg-blue-600/20 text-blue-400 border-blue-600' }
    ];
    
    let allItems = [];
    
    categories.forEach(category => {
        const categoryPrices = prices[category.key];
        if (!categoryPrices || !Array.isArray(categoryPrices)) return;
        
        const targetSymbols = TICKER_SYMBOLS[category.key] || [];
        const items = categoryPrices.filter(p => targetSymbols.includes(p.symbol));
        
        if (items.length > 0) {
            allItems.push({ type: 'category', name: category.name, color: category.color });
            
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
    
    let itemsHtml = '';
    
    allItems.forEach(item => {
        if (item.type === 'category') {
            itemsHtml += `<div class="ticker-category-badge ${item.color} border">${item.name}</div>`;
        } else {
            const isPositive = item.changePercent >= 0;
            const changeColor = isPositive ? 'text-green-400' : 'text-red-400';
            const changeIcon = isPositive ? '▲' : '▼';
            
            let priceDisplay = '';
            if (item.symbol === 'XAUUSD') {
                priceDisplay = `$${parseFloat(item.usdPrice || item.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            } else if (item.category === 'crypto') {
                priceDisplay = `$${parseFloat(item.usdPrice || item.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
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
    
    tickerContainer.innerHTML = itemsHtml + itemsHtml + itemsHtml;
    tickerContent = tickerContainer;
    
    setTimeout(() => {
        tickerContentWidth = tickerContainer.scrollWidth / 3;
        tickerPosition = 0;
        startTickerAnimation();
    }, 50);
    
    const now = new Date();
    const updateEl = document.getElementById('ticker-last-update');
    if (updateEl) updateEl.textContent = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
};

const startTickerAnimation = () => {
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
    const tickerBar = document.getElementById('price-ticker-bar');
    const toggleIcon = document.getElementById('ticker-toggle-icon');
    const toggleText = document.getElementById('ticker-toggle-text');
    const spacer = document.getElementById('ticker-spacer');
    
    if (!tickerBar || !toggleIcon || !toggleText || !spacer) return;
    
    if (tickerVisible) {
        tickerBar.classList.add('translate-y-full');
        tickerBar.classList.remove('translate-y-0');
        toggleIcon.style.transform = 'rotate(180deg)';
        toggleText.textContent = 'نمایش قیمت‌ها';
        spacer.classList.add('h-0');
        spacer.classList.remove('h-16');
        tickerPaused = true;
    } else {
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
    const savedState = localStorage.getItem('tickerVisible');
    if (savedState === 'false') {
        tickerVisible = true;
        togglePriceTicker();
    }
    
    const toggleBtn = document.getElementById('ticker-toggle-btn');
    if (toggleBtn) toggleBtn.addEventListener('click', togglePriceTicker);
    
    const tickerWrapperDiv = document.querySelector('.ticker-wrapper');
    if (tickerWrapperDiv) {
        tickerWrapperDiv.addEventListener('mouseenter', () => { tickerPaused = true; });
        tickerWrapperDiv.addEventListener('mouseleave', () => { tickerPaused = false; });
    }
};

// --- تراکنش‌های اخیر ---
const loadRecentTransactions = () => {
    const container = document.getElementById('recent-transactions-list');
    if (!container) return;
    
    if (!allAssets || allAssets.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">در حال بارگذاری...</p>';
        updateTransactionCountBadge(0);
        return;
    }
    
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
    
    allTransactionsCache.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const totalCount = allTransactionsCache.length;
    updateTransactionCountBadge(totalCount);
    
    if (totalCount === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">هنوز تراکنشی ثبت نشده است.</p>';
        document.getElementById('show-more-transactions')?.classList.add('hidden');
        document.getElementById('toggle-transactions-btn')?.classList.add('hidden');
        return;
    }
    
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
    const container = document.getElementById('recent-transactions-list');
    if (!container) return;
    
    const totalCount = allTransactionsCache.length;
    const displayCount = showingAllTransactions ? totalCount : Math.min(DEFAULT_TRANSACTION_COUNT, totalCount);
    const recentTransactions = allTransactionsCache.slice(0, displayCount);
    
    let html = '';
    
    recentTransactions.forEach(tx => {
        const date = new Date(tx.date);
        const persianDate = date.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' });
        const time = date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
        const quantity = parseFloat(tx.quantity);
        
        let icon = '', bgColor = '', textColor = '', typeText = '';
        
        switch(tx.type) {
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
        
        let quantityDisplay = tx.assetSymbol === 'RIAL_WALLET' ? formatToman(quantity) : formatPrice(quantity);
        let priceDisplay = (tx.price_per_unit && tx.assetSymbol !== 'RIAL_WALLET') ? `@ ${formatToman(tx.price_per_unit)}` : '';
        
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
    const badge = document.getElementById('transaction-count-badge');
    if (badge) {
        badge.textContent = showingAllTransactions ? count : Math.min(DEFAULT_TRANSACTION_COUNT, count);
    }
};

const updateToggleButtonState = () => {
    const expandIcon = document.getElementById('transactions-expand-icon');
    const loadMoreBtn = document.getElementById('load-more-transactions-btn');
    const totalCount = allTransactionsCache.length;
    
    if (expandIcon) {
        expandIcon.style.transform = showingAllTransactions ? 'rotate(180deg)' : 'rotate(0deg)';
    }
    
    if (loadMoreBtn) {
        if (showingAllTransactions) {
            loadMoreBtn.textContent = 'نمایش کمتر';
        } else {
            loadMoreBtn.textContent = `مشاهده همه تراکنش‌ها (${totalCount} تراکنش)`;
        }
    }
    
    updateTransactionCountBadge(totalCount);
};

const toggleTransactionsView = () => {
    showingAllTransactions = !showingAllTransactions;
    renderTransactionsList();
};

// --- قدرت خرید ---
const updatePurchasePowerBox = () => {
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
    const balanceBtn = document.getElementById('purchase-mode-balance');
    const portfolioBtn = document.getElementById('purchase-mode-portfolio');
    const infoText = document.getElementById('purchase-power-info');
    
    if (purchaseMode === 'balance') {
        balanceBtn.classList.add('bg-blue-600', 'text-white');
        balanceBtn.classList.remove('text-gray-300', 'bg-gray-700');
        portfolioBtn.classList.remove('bg-blue-600', 'text-white');
        portfolioBtn.classList.add('text-gray-300', 'bg-gray-700');
        if (infoText) infoText.textContent = 'با کل موجودی کیف پول ریالی';
    } else {
        portfolioBtn.classList.add('bg-blue-600', 'text-white');
        portfolioBtn.classList.remove('text-gray-300', 'bg-gray-700');
        balanceBtn.classList.remove('bg-blue-600', 'text-white');
        balanceBtn.classList.add('text-gray-300', 'bg-gray-700');
        if (infoText) infoText.textContent = 'با کل ارزش پورتفوی';
    }
};

const updateWalletBalanceDisplay = () => {
    const rialAsset = allAssets.find(a => a.symbol === 'RIAL_WALLET');
    const balance = rialAsset ? parseFloat(rialAsset.total_quantity) : 0;
    const el = document.getElementById('current-wallet-balance');
    if (el) el.textContent = formatToman(balance);
};

// --- نمودارها ---
const renderPortfolioPieChart = (assets) => {
    const activeAssets = assets.filter(asset => 
        asset.symbol !== 'RIAL_WALLET' && 
        parseFloat(asset.total_quantity) > 0 &&
        parseFloat(asset.current_value) > 0
    );
    
    const ctx = document.getElementById('portfolioPieChart')?.getContext('2d');
    const legendContainer = document.getElementById('pie-chart-legend');
    
    if (!ctx || !legendContainer) return;
    
    if (activeAssets.length === 0) {
        if (portfolioPieChart) { portfolioPieChart.destroy(); portfolioPieChart = null; }
        legendContainer.innerHTML = '<p class="text-gray-500 text-sm text-center py-2">هنوز دارایی‌ای ثبت نشده است.</p>';
        return;
    }
    
    const totalValue = activeAssets.reduce((sum, asset) => sum + parseFloat(asset.current_value), 0);
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6'];
    
    let legendHtml = '';
    activeAssets.forEach((asset, i) => {
        const percent = (parseFloat(asset.current_value) / totalValue) * 100;
        legendHtml += `
            <div class="flex items-center justify-between p-2 hover:bg-gray-800 rounded">
                <div class="flex items-center gap-2">
                    <div class="w-4 h-4 rounded" style="background-color: ${colors[i % colors.length]};"></div>
                    <span class="text-sm text-gray-300">${asset.title}</span>
                </div>
                <span class="font-mono text-sm text-white">${percent.toFixed(1)}%</span>
            </div>
        `;
    });
    legendContainer.innerHTML = legendHtml;
    
    if (portfolioPieChart) portfolioPieChart.destroy();
    portfolioPieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: activeAssets.map(a => a.title),
            datasets: [{
                data: activeAssets.map(a => parseFloat(a.current_value)),
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
    const activeAssets = assets.filter(asset => 
        asset.symbol !== 'RIAL_WALLET' && 
        parseFloat(asset.total_quantity) > 0 &&
        parseFloat(asset.current_value) > 0
    );
    
    document.querySelectorAll('.balance-status-item').forEach(item => {
        item.classList.remove('border-green-500', 'border-yellow-500', 'border-orange-500', 'border-red-500');
        item.classList.add('border-gray-700');
        const circle = item.querySelector('.w-16.h-16');
        if (circle) { circle.classList.remove('bg-green-900', 'bg-yellow-900', 'bg-orange-900', 'bg-red-900'); circle.classList.add('bg-gray-700'); }
    });
    
    if (activeAssets.length === 0) {
        document.getElementById('balance-guidance-title').textContent = 'بدون دارایی';
        document.getElementById('balance-guidance-text').textContent = 'شما هنوز دارایی اسپاتی ثبت نکرده‌اید.';
        return;
    }
    
    const totalValue = activeAssets.reduce((sum, asset) => sum + parseFloat(asset.current_value), 0);
    let maxAsset = null, maxPercent = 0;
    
    activeAssets.forEach(asset => {
        const percent = (parseFloat(asset.current_value) / totalValue) * 100;
        if (percent > maxPercent) { maxPercent = percent; maxAsset = asset; }
    });
    
    let statusElement, guidanceTitle, guidanceText, guidanceIcon, borderColor, bgColor;
    
    if (maxPercent < 35) {
        statusElement = document.getElementById('balance-status-balanced');
        guidanceTitle = '✅ پورتفوی متعادل';
        guidanceText = 'پورتفوی شما تنوع خوبی دارد و هیچ دارایی بیش از ۳۵٪ از کل سبد را تشکیل نمی‌دهد.';
        guidanceIcon = '✅'; borderColor = 'border-green-500'; bgColor = 'bg-green-900';
    } else if (maxPercent < 45) {
        statusElement = document.getElementById('balance-status-semi-balanced');
        guidanceTitle = '👍 پورتفوی نسبتاً متعادل';
        guidanceText = 'بزرگترین دارایی شما بین ۳۵٪ تا ۴۵٪ از کل سبد را تشکیل می‌دهد.';
        guidanceIcon = '👍'; borderColor = 'border-yellow-500'; bgColor = 'bg-yellow-900';
    } else if (maxPercent < 55) {
        statusElement = document.getElementById('balance-status-needs-review');
        guidanceTitle = '⚠️ نیاز به بازبینی';
        guidanceText = 'بزرگترین دارایی شما بین ۴۵٪ تا ۵۵٪ از کل پورتفوی را تشکیل می‌دهد.';
        guidanceIcon = '⚠️'; borderColor = 'border-orange-500'; bgColor = 'bg-orange-900';
    } else {
        statusElement = document.getElementById('balance-status-unbalanced');
        guidanceTitle = '🔴 خارج از تعادل';
        guidanceText = 'بیش از ۵۵٪ از ارزش پورتفوی شما در یک دارایی متمرکز شده است.';
        guidanceIcon = '🔴'; borderColor = 'border-red-500'; bgColor = 'bg-red-900';
    }
    
    if (statusElement) {
        statusElement.classList.remove('border-gray-700');
        statusElement.classList.add(borderColor);
        const circle = statusElement.querySelector('.w-16.h-16');
        if (circle) { circle.classList.remove('bg-gray-700'); circle.classList.add(bgColor); }
    }
    
    const guidanceDiv = document.getElementById('balance-guidance');
    guidanceDiv.classList.remove('border-gray-500', 'border-green-500', 'border-yellow-500', 'border-orange-500', 'border-red-500');
    guidanceDiv.classList.add(borderColor);
    document.getElementById('balance-guidance-icon').textContent = guidanceIcon;
    document.getElementById('balance-guidance-title').textContent = guidanceTitle;
    document.getElementById('balance-guidance-text').textContent = guidanceText;
    document.getElementById('max-asset-name').textContent = maxAsset.title;
    document.getElementById('max-asset-percent').textContent = `${maxPercent.toFixed(1)}% از کل پورتفوی`;
};

const renderAssetsDashboard = (assets) => {
    const tableBody = document.getElementById('assets-table-body');
    tableBody.innerHTML = '';
    
    let totalValue = 0, totalProfit = 0, totalCostBasis = 0, rialWalletBalance = 0;

    assets.forEach(asset => {
        const quantity = parseFloat(asset.total_quantity);
        const costBasis = parseFloat(asset.cost_basis);
        const currentValue = parseFloat(asset.current_value);
        const profitLoss = parseFloat(asset.profit_loss);
        const returnPct = parseFloat(asset.return_pct);

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
                        <button onclick="openHistoryModal('${asset.title}', '${asset.id}')" class="text-blue-500 hover:text-blue-400 text-xs sm:text-sm action-btn">مشاهده</button>
                    </td>
                </tr>
            `;
        }
    });

    if (tableBody.innerHTML === '') {
        tableBody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-gray-500">هنوز دارایی اسپاتی ثبت نشده است.</td></tr>';
    }

    const overallReturnPct = totalCostBasis > 0 ? (totalProfit / totalCostBasis) * 100 : 0;
    const overallStatusClass = getStatusColor(totalProfit);

    document.getElementById('total-value').textContent = formatToman(totalValue);
    document.getElementById('total-profit').textContent = formatToman(totalProfit);
    document.getElementById('total-profit-pct').className = `text-sm mt-1 flex items-center ${overallStatusClass} font-medium`;
    document.getElementById('total-profit-pct').innerHTML = `<svg class="w-4 h-4 ml-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="${totalProfit >= 0 ? 'M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z' : 'M14.707 7.293a1 1 0 00-1.414 0L10 10.586l-3.293-3.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l4-4a1 1 0 000-1.414z'}" clip-rule="evenodd"></path></svg>${formatPercent(overallReturnPct)}`;
    document.getElementById('rial-wallet-balance').textContent = formatToman(rialWalletBalance);
    
    renderPortfolioPieChart(assets);
    analyzePortfolioBalance(assets);
};

const originalRenderChart = function(data) {
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
                x: { type: 'time', time: { unit: 'day' }, ticks: { color: '#8b949e' }, grid: { color: '#30363d' } },
                y: { ticks: { color: '#8b949e', callback: v => formatToman(v).replace(' ت', '') }, grid: { color: '#30363d' } }
            },
            plugins: { legend: { display: false } }
        }
    });
};

const renderChart = function(data) {
    originalRenderChart.call(this, data);
    
    if (portfolioChart) {
        const isLight = currentTheme === 'light';
        portfolioChart.options.scales.x.ticks.color = isLight ? '#4b5563' : '#8b949e';
        portfolioChart.options.scales.y.ticks.color = isLight ? '#4b5563' : '#8b949e';
        portfolioChart.options.scales.x.grid.color = isLight ? '#e5e7eb' : '#30363d';
        portfolioChart.options.scales.y.grid.color = isLight ? '#e5e7eb' : '#30363d';
        portfolioChart.update();
    }
};

// --- مودال‌ها ---
const openWalletModal = () => {
    const rialAsset = allAssets.find(a => a.symbol === 'RIAL_WALLET');
    const balance = rialAsset ? parseFloat(rialAsset.total_quantity) : 0;
    document.getElementById('wallet-current-balance').textContent = `موجودی: ${formatToman(balance)}`;
    document.getElementById('wallet-modal').classList.remove('hidden');
};

const openHistoryModal = (assetTitle, assetId) => {
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
    
    const txDate = new Date(transaction.date);
    document.getElementById('edit-tx-date').value = txDate.toISOString().split('T')[0];
    
    const isPriceVisible = ['buy', 'sell', 'save_profit'].includes(transaction.type);
    document.getElementById('edit-price-per-unit-group').classList.toggle('hidden', !isPriceVisible);
    
    document.getElementById('edit-modal').classList.remove('hidden');
};

const deleteTransaction = async (id) => {
    if (!confirm('آیا مطمئن هستید که می‌خواهید این تراکنش را حذف کنید؟')) return;
    
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        
        const response = await fetch(`/api/transactions/${id}`, { method: 'DELETE', headers });
        if (response.ok) {
            alert('تراکنش با موفقیت حذف شد.');
            document.getElementById('history-modal').classList.add('hidden');
            await fetchAssets();
            await fetchChartData();
            await updateDailyProfit();
        } else {
            const error = await response.json();
            alert(`خطا در حذف تراکنش: ${error.error}`);
        }
    } catch (error) {
        alert('خطای شبکه یا سرور رخ داد.');
    }
};

const openValueAnalysisModal = async () => {
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        
        const response = await fetch('/api/value-analysis', { headers });
        const data = await response.json();
        
        // نمایش مقادیر اصلی
        document.getElementById('current-value').textContent = formatToman(data.total_value_toman || 0);
        document.getElementById('current-usd').textContent = `$${data.equivalent_usd?.toFixed(2) || '0.00'}`;
        document.getElementById('current-gold').textContent = `${data.equivalent_gold_grams?.toFixed(3) || '0.000'} گرم`;
        
        // نمایش تغییرات
        const usdChange = data.usd_change || 0;
        const goldChange = data.gold_change || 0;
        const usdPercent = data.usd_change_percent || 0;
        const goldPercent = data.gold_change_percent || 0;
        
        // تغییر معادل دلار
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
        
        // تغییر معادل طلا
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
        
        // Simple changes
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
        
        // Load history
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
        console.error('Error opening value analysis:', error);
        showNotification('❌ خطا در بارگذاری تحلیل ارزش', 'error');
    }
};

const showDailyHistory = async () => {
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
        alert('خطا در بارگذاری تاریخچه');
    }
};

// --- مدیریت API ---
const openApiManagementModal = () => {
    document.getElementById('api-management-modal').classList.remove('hidden');
    loadApiKeyStatus();
    loadApiStats();
    loadApiJsonPreview();
};

const loadApiKeyStatus = async () => {
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
        console.error('Error loading API key:', error);
    }
};

const loadApiStats = async () => {
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        
        const response = await fetch('/api/user/api-stats', { headers });
        const data = await response.json();
        
        document.getElementById('api-requests-today').textContent = data.today_requests || 0;
        document.getElementById('api-requests-total').textContent = data.total_requests || 0;
        document.getElementById('api-last-update').textContent = data.last_price_update || '-';
    } catch (error) {
        console.error('Error loading API stats:', error);
    }
};

const loadApiJsonPreview = async () => {
    try {
        const response = await fetch('/api/v1/prices');
        const data = await response.json();
        
        const pre = document.getElementById('api-json-preview');
        pre.textContent = JSON.stringify(data, null, 2);
        
        let html = JSON.stringify(data, null, 2)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"([^"]+)":/g, '<span class="text-yellow-400">"$1"</span>:')
            .replace(/: "([^"]*)"/g, ': <span class="text-green-400">"$1"</span>')
            .replace(/: (\d+\.?\d*)/g, ': <span class="text-blue-400">$1</span>');
        
        pre.innerHTML = html;
    } catch (error) {
        console.error('Error loading API preview:', error);
    }
};

const generateApiKey = async () => {
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
            showToast('✅ کلید API با موفقیت ساخته شد', 'success');
        }
    } catch (error) {
        console.error('Error generating API key:', error);
    }
};

const revokeApiKey = async () => {
    if (!confirm('آیا مطمئن هستید که می‌خواهید کلید API خود را حذف کنید؟')) return;
    
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        
        const response = await fetch('/api/user/api-key', { method: 'DELETE', headers });
        if (response.ok) {
            document.getElementById('no-api-key').classList.remove('hidden');
            document.getElementById('has-api-key').classList.add('hidden');
            showToast('🗑️ کلید API حذف شد', 'success');
        }
    } catch (error) {
        console.error('Error revoking API key:', error);
    }
};

const copyApiKey = () => {
    const input = document.getElementById('api-key-display');
    input.select();
    document.execCommand('copy');
    showToast('📋 کلید API کپی شد', 'success');
};

const copyJsonPreview = () => {
    const pre = document.getElementById('api-json-preview');
    const text = pre.textContent;
    navigator.clipboard?.writeText(text) || (() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    })();
    showToast('📋 خروجی JSON کپی شد', 'success');
};

// --- ورودی/خروجی اطلاعات ---
const openDataManagementModal = () => {
    document.getElementById('data-management-modal').classList.remove('hidden');
    document.getElementById('data-message').classList.add('hidden');
    resetImportState();
};

const resetImportState = () => {
    document.getElementById('import-ready-state').classList.remove('hidden');
    document.getElementById('import-file-selected').classList.add('hidden');
    document.getElementById('import-preview').classList.add('hidden');
    document.getElementById('import-data-btn').disabled = true;
    document.getElementById('import-file-input').value = '';
};

let importFile = null;

const handleFileSelect = (file) => {
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
            const exportDate = data.export_date ? new Date(data.export_date).toLocaleDateString('fa-IR') : 'نامشخص';
            
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
    if (!importFile) return;
    if (!confirm('⚠️ هشدار: تمام اطلاعات فعلی شما با داده‌های فایل جایگزین می‌شود. آیا مطمئن هستید؟')) return;
    
    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                const headers = { 'Content-Type': 'application/json' };
                if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
                
                const response = await fetch('/api/user/import', { method: 'POST', headers, body: JSON.stringify(data) });
                const result = await response.json();
                
                if (response.ok) {
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
        console.error('Import error:', error);
        showDataMessage('❌ خطا در ورودی اطلاعات', 'error');
    }
};

const exportUserData = async () => {
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        
        const response = await fetch('/api/user/export', { headers });
        if (!response.ok) throw new Error('Export failed');
        
        const data = await response.json();
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
        console.error('Export error:', error);
        showDataMessage('❌ خطا در خروجی اطلاعات', 'error');
    }
};

const showDataMessage = (message, type) => {
    const msgEl = document.getElementById('data-message');
    msgEl.textContent = message;
    msgEl.classList.remove('hidden', 'bg-green-900/30', 'text-green-400', 'bg-red-900/30', 'text-red-400');
    
    if (type === 'success') {
        msgEl.classList.add('bg-green-900/30', 'text-green-400');
    } else {
        msgEl.classList.add('bg-red-900/30', 'text-red-400');
    }
};

// --- گزارش‌گیری PDF ---
const openReportModal = () => {
    document.getElementById('report-modal').classList.remove('hidden');
    setTimeout(() => updateMiniPreview(), 100);
};

const updateMiniPreview = () => {
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
    
    const bgColor = isDark ? '#0d1117' : '#ffffff';
    const textColor = isDark ? '#c9d1d9' : '#1f2937';
    const cardBg = isDark ? '#161b22' : '#f3f4f6';
    const borderColor = isDark ? '#30363d' : '#e5e7eb';
    const secondaryText = isDark ? '#8b949e' : '#6b7280';
    
    const chartCanvas = document.getElementById('portfolioChart');
    const pieCanvas = document.getElementById('portfolioPieChart');
    
    const chartImage = chartCanvas ? chartCanvas.toDataURL('image/png') : '';
    const pieImage = pieCanvas ? pieCanvas.toDataURL('image/png') : '';
    
    const date = new Date().toLocaleDateString('fa-IR', { 
        year: 'numeric', month: 'long', day: 'numeric' 
    });
    
    const usdAmount = document.getElementById('usd-amount')?.textContent || '0';
    const goldAmount = document.getElementById('gold-amount')?.textContent || '0';
    const btcAmount = document.getElementById('btc-amount')?.textContent || '0';
    
    let html = `
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <style>
                @font-face {
                    font-family: 'Vazirmatn';
                    src: url('../static/fonts/Vazirmatn-Regular.woff2') format('woff2');
                    font-weight: normal;
                }
                @font-face {
                    font-family: 'Vazirmatn';
                    src: url('../static/fonts/Vazirmatn-Bold.woff2') format('woff2');
                    font-weight: bold;
                }
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Vazirmatn', 'Tahoma', sans-serif; 
                    background: ${bgColor}; 
                    color: ${textColor}; 
                    padding: 30px 25px;
                    direction: rtl;
                }
                h1 { font-size: 28px; margin-bottom: 8px; font-weight: bold; }
                h2 { font-size: 20px; margin-bottom: 16px; border-right: 4px solid #3b82f6; padding-right: 12px; }
                .card { background: ${cardBg}; border: 1px solid ${borderColor}; border-radius: 12px; padding: 18px; }
                .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
                .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
                table { width: 100%; border-collapse: collapse; font-size: 13px; }
                th { background: ${cardBg}; padding: 12px 8px; text-align: right; border-bottom: 2px solid ${borderColor}; }
                td { padding: 10px 8px; border-bottom: 1px solid ${borderColor}; }
                .text-success { color: #34d399; }
                .text-danger { color: #f87171; }
                .text-muted { color: ${secondaryText}; font-size: 13px; }
                .font-mono { font-family: 'Courier New', monospace; }
                .mb-4 { margin-bottom: 25px; }
                .text-center { text-align: center; }
                .chart-container { text-align: center; margin: 20px 0; }
                .chart-container img { max-width: 100%; height: auto; border-radius: 8px; }
            </style>
        </head>
        <body>
            <div class="text-center" style="margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid ${borderColor};">
                <h1 style="color: #3b82f6;">${title}</h1>
                <p class="text-muted">تاریخ گزارش: ${date}</p>
                <p class="text-muted">کاربر: ${currentUser?.first_name || ''} ${currentUser?.last_name || ''}</p>
            </div>
    `;
    
    if (document.getElementById('report-summary')?.checked) {
        const totalValue = document.getElementById('total-value')?.textContent || '-';
        const totalProfit = document.getElementById('total-profit')?.textContent || '-';
        const isPositive = !totalProfit.includes('-') && totalProfit !== '0 ت';
        const profitClass = isPositive ? 'text-success' : 'text-danger';
        
        html += `
            <div class="mb-4">
                <h2>📊 خلاصه پورتفوی</h2>
                <div class="grid-2">
                    <div class="card">
                        <p class="text-muted" style="margin-bottom: 8px;">ارزش کل</p>
                        <p style="font-size: 28px; font-weight: bold;">${totalValue}</p>
                    </div>
                    <div class="card">
                        <p class="text-muted" style="margin-bottom: 8px;">سود/زیان خالص</p>
                        <p style="font-size: 28px; font-weight: bold;" class="${profitClass}">${totalProfit}</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    if (document.getElementById('report-chart')?.checked && chartImage) {
        html += `
            <div class="mb-4">
                <h2>📈 نمودار عملکرد پورتفوی</h2>
                <div class="card chart-container">
                    <img src="${chartImage}" alt="نمودار عملکرد" style="max-width: 100%;">
                </div>
            </div>
        `;
    }
    
    if (document.getElementById('report-pie')?.checked && pieImage) {
        html += `
            <div class="mb-4">
                <h2>🥧 توزیع دارایی‌ها</h2>
                <div class="card chart-container">
                    <img src="${pieImage}" alt="نمودار دایره‌ای" style="max-width: 80%; margin: 0 auto;">
                </div>
            </div>
        `;
    }
    
    if (document.getElementById('report-assets-table')?.checked && allAssets) {
        html += `
            <div class="mb-4">
                <h2>📋 دارایی‌های اسپات</h2>
                <div style="overflow-x: auto; border-radius: 12px; border: 1px solid ${borderColor};">
                    <table>
                        <thead>
                            <tr>
                                <th>دارایی</th>
                                <th>موجودی</th>
                                <th>قیمت</th>
                                <th>ارزش</th>
                                <th>سود/زیان</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        allAssets.forEach(asset => {
            if (asset.symbol === 'RIAL_WALLET' || parseFloat(asset.total_quantity) <= 0) return;
            
            const profit = parseFloat(asset.profit_loss);
            const profitClass = profit >= 0 ? 'text-success' : 'text-danger';
            
            html += `
                <tr>
                    <td><strong>${asset.title}</strong><br><span class="text-muted" style="font-size: 11px;">${asset.symbol}</span></td>
                    <td class="font-mono">${formatPrice(asset.total_quantity)}</td>
                    <td class="font-mono">${formatToman(asset.current_price)}</td>
                    <td class="font-mono">${formatToman(asset.current_value)}</td>
                    <td class="font-mono ${profitClass}">${formatToman(asset.profit_loss)}</td>
                </tr>
            `;
        });
        
        html += `</tbody></table></div></div>`;
    }
    
    if (document.getElementById('report-balance')?.checked) {
        const balanceStatus = document.getElementById('balance-guidance-title')?.textContent || '-';
        const balanceText = document.getElementById('balance-guidance-text')?.textContent || '-';
        const maxAsset = document.getElementById('max-asset-name')?.textContent || '-';
        const maxPercent = document.getElementById('max-asset-percent')?.textContent || '-';
        
        html += `
            <div class="mb-4">
                <h2>⚖️ تحلیل تعادل پورتفوی</h2>
                <div class="card">
                    <p style="font-size: 18px; font-weight: bold; margin-bottom: 8px;">${balanceStatus}</p>
                    <p class="text-muted" style="margin-bottom: 16px;">${balanceText}</p>
                    <p style="font-size: 14px;">بیشترین سهم: <strong>${maxAsset}</strong> (${maxPercent})</p>
                </div>
            </div>
        `;
    }
    
    if (document.getElementById('report-daily')?.checked) {
        const dailyProfit = document.getElementById('daily-profit-toman')?.textContent || '-';
        const dailyPercent = document.getElementById('daily-profit-percent')?.textContent || '-';
        const yesterday = document.getElementById('yesterday-value')?.textContent || '-';
        
        html += `
            <div class="mb-4">
                <h2>📅 عملکرد روزانه</h2>
                <div class="grid-3">
                    <div class="card" style="text-align: center;">
                        <p class="text-muted" style="font-size: 12px; margin-bottom: 8px;">سود/زیان امروز</p>
                        <p style="font-size: 22px; font-weight: bold;">${dailyProfit}</p>
                    </div>
                    <div class="card" style="text-align: center;">
                        <p class="text-muted" style="font-size: 12px; margin-bottom: 8px;">درصد تغییر</p>
                        <p style="font-size: 22px; font-weight: bold;">${dailyPercent}</p>
                    </div>
                    <div class="card" style="text-align: center;">
                        <p class="text-muted" style="font-size: 12px; margin-bottom: 8px;">ارزش دیروز</p>
                        <p style="font-size: 22px; font-weight: bold;">${yesterday}</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    if (document.getElementById('report-purchase-power')?.checked) {
        html += `
            <div class="mb-4">
                <h2>💰 قدرت خرید</h2>
                <div class="grid-3">
                    <div class="card" style="text-align: center;">
                        <p class="text-muted" style="font-size: 12px; margin-bottom: 8px;">💵 دلار آمریکا</p>
                        <p style="font-size: 20px; font-weight: bold;">${usdAmount}</p>
                    </div>
                    <div class="card" style="text-align: center;">
                        <p class="text-muted" style="font-size: 12px; margin-bottom: 8px;">🥇 گرم طلا</p>
                        <p style="font-size: 20px; font-weight: bold;">${goldAmount}</p>
                    </div>
                    <div class="card" style="text-align: center;">
                        <p class="text-muted" style="font-size: 12px; margin-bottom: 8px;">₿ بیت‌کوین</p>
                        <p style="font-size: 20px; font-weight: bold;">${btcAmount}</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    html += `
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid ${borderColor}; text-align: center;" class="text-muted">
                <p style="margin-bottom: 5px;">این گزارش توسط Assetly - سامانه مدیریت حرفه‌ای پورتفوی تولید شده است.</p>
                <p>assetly.ir</p>
            </div>
        </body>
        </html>
    `;
    
    return html;
};

const openPreviewInNewTab = () => {
    const reportHTML = buildReportHTML();
    const newWindow = window.open('', '_blank');
    newWindow.document.write(reportHTML);
    newWindow.document.close();
};

const downloadPDF = () => {
    const reportHTML = buildReportHTML();
    const newWindow = window.open('', '_blank');
    newWindow.document.write(reportHTML);
    newWindow.document.close();
    setTimeout(() => newWindow.print(), 500);
};
// --- Risk Test Functions ---
let riskTestAnswers = {};
let currentRiskQuestion = 0;
let suggestedPortfolioChart = null;

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
    if (score <= 20) return 'شما بسیار محافظه‌کار هستید و ریسک‌گریزی بالایی دارید.';
    if (score <= 40) return 'شما محافظه‌کار هستید و تمایل کمی به ریسک دارید.';
    if (score <= 60) return 'شما ریسک‌پذیری متعادلی دارید.';
    if (score <= 80) return 'شما ریسک‌پذیر هستید و به دنبال بازدهی بالاتر می‌باشید.';
    return 'شما بسیار ریسک‌پذیر هستید و تحمل نوسانات بالا را دارید.';
};

const renderRiskQuestion = () => {
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
    
    const progress = document.getElementById('risk-progress');
    if (progress) progress.textContent = `سوال ${currentRiskQuestion + 1} از ${riskQuestions.length}`;
};

const calculateRiskScore = () => {
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
    riskTestAnswers = {};
    currentRiskQuestion = 0;
    document.getElementById('risk-test-start')?.classList.remove('hidden');
    document.getElementById('risk-test-result')?.classList.add('hidden');
    localStorage.removeItem('riskTestScore');
    localStorage.removeItem('riskTestAnswers');
};

// --- Investment Goal Functions ---
let investmentGoal = null;

const loadInvestmentGoal = () => {
    const saved = localStorage.getItem('investmentGoal');
    if (saved) {
        try {
            investmentGoal = JSON.parse(saved);
            updateGoalDisplay();
        } catch (e) {
            console.error('Error loading goal:', e);
        }
    }
};

const saveInvestmentGoal = (goal) => {
    investmentGoal = { ...goal, startDate: new Date().toISOString() };
    localStorage.setItem('investmentGoal', JSON.stringify(investmentGoal));
    updateGoalDisplay();
};

const deleteInvestmentGoal = () => {
    investmentGoal = null;
    localStorage.removeItem('investmentGoal');
    updateGoalDisplay();
};

const calculateCurrentValue = (type) => {
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
    
    ['toman', 'dollar', 'gold', 'bitcoin'].forEach(t => {
        document.getElementById(`goal-${t}`)?.classList.toggle('hidden', t !== type);
    });
    
    const current = currentRaw;
    const percent = Math.min(100, (current / amount) * 100);
    const remaining = Math.max(0, amount - current);
    const remainingPercent = 100 - percent;
    
    const barEl = document.getElementById(`goal-${type}-bar`);
    if (barEl) barEl.style.width = `${percent}%`;
    
    const currentEl = document.getElementById(`goal-${type}-current`);
    const targetEl = document.getElementById(`goal-${type}-target`);
    if (currentEl) currentEl.textContent = formatNumber(current, type);
    if (targetEl) targetEl.textContent = formatNumber(amount, type);
    
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
    if (type === 'dollar') return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (type === 'gold') return `${num.toLocaleString('fa-IR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
    if (type === 'bitcoin') return `${num.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })}`;
    return num.toLocaleString('fa-IR');
};

const updateGoalAmountLabel = () => {
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

// --- Initialize ---
const initialize = async () => {
    initTheme();
    initPriceTicker();
    loadSavedRiskTest();
    loadInvestmentGoal();
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
    
    updatePurchaseModeUI();
    
    setInterval(fetchPrices, 60000);
    setInterval(() => { if (currentUser) updateDailyProfit(); }, 300000);
};

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
// Goal Management
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
    const days = document.getElementById('goal-days').value ? parseInt(document.getElementById('goal-days').value) : null;
    
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

// Goal section expand/collapse
document.getElementById('goal-collapsed')?.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    const expanded = document.getElementById('goal-expanded');
    const icon = document.getElementById('goal-expand-icon');
    expanded.classList.toggle('hidden');
    if (icon) icon.style.transform = expanded.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
});
  // Risk Test Event Listeners
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
    showNotification(`✅ آزمون با موفقیت شد! نمره شما: ${score} از ۱۰۰`, 'success');
});
    // Auth
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
    
    document.getElementById('close-auth-modal')?.addEventListener('click', () => {
        document.getElementById('auth-modal').classList.add('hidden');
    });
    
    document.getElementById('auth-tab-login')?.addEventListener('click', () => showAuthModal('login'));
    document.getElementById('auth-tab-register')?.addEventListener('click', () => showAuthModal('register'));
    document.getElementById('switch-to-register')?.addEventListener('click', () => showAuthModal('register'));
    document.getElementById('switch-to-login')?.addEventListener('click', () => showAuthModal('login'));
    
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
            console.error('Login error:', error);
        }
    });
    
    document.getElementById('register-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            first_name: formData.get('first_name'),
            last_name: formData.get('last_name'),
            email: formData.get('email'),
            phone: formData.get('phone'),
            password: formData.get('password')
        };
        
        if (data.password !== formData.get('confirm_password')) {
            showAuthMessage('رمز عبور و تکرار آن مطابقت ندارند', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/auth/register', {
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
                showToast(`✅ ${currentUser.first_name} عزیز، به Assetly خوش آمدید!`, 'success');
                await fetchAssets();
                await fetchChartData();
                await updateDailyProfit();
            } else {
                if (result.error.includes('ایمیل') || result.error.includes('تلفن') || result.error.includes('مشخصات')) {
                    showAuthMessage('این مشخصات قبلاً در سایت ثبت شده است. لطفاً وارد شوید.', 'error');
                    setTimeout(() => document.getElementById('switch-to-login')?.click(), 2000);
                } else {
                    showAuthMessage(result.error, 'error');
                }
            }
        } catch (error) {
            console.error('Register error:', error);
        }
    });
    
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
                showToast('✅ پروفایل با موفقیت بروزرسانی شد', 'success');
            }
        } catch (error) {
            console.error('Update profile error:', error);
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
            console.error('Change password error:', error);
        }
    });
    
    // Transactions
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
    
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById(btn.dataset.closeModal)?.classList.add('hidden');
        });
    });
    
    document.querySelectorAll('.fixed.inset-0').forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    });
    
    document.getElementById('tx-type')?.addEventListener('change', (e) => {
        const isWalletTx = e.target.value === 'deposit' || e.target.value === 'withdrawal';
        document.getElementById('asset-type-group')?.classList.toggle('hidden', isWalletTx);
        document.getElementById('asset-name-group')?.classList.toggle('hidden', isWalletTx);
        document.getElementById('price-per-unit-group')?.classList.toggle('hidden', isWalletTx);
        document.getElementById('category-group')?.classList.toggle('hidden', isWalletTx);
        
        const quantityLabel = document.getElementById('quantity-label');
        if (isWalletTx) {
            document.getElementById('asset-name').value = 'RIAL_WALLET';
            if (quantityLabel) quantityLabel.textContent = e.target.value === 'deposit' ? 'مقدار واریز (تومان)' : 'مقدار برداشت (تومان)';
            document.getElementById('tx-price').value = '1';
        } else {
            if (quantityLabel) quantityLabel.textContent = 'مقدار';
        }
        updateWalletBalanceDisplay();
    });
    
    document.getElementById('asset-type')?.addEventListener('change', () => {
        const type = document.getElementById('asset-type').value;
        const select = document.getElementById('asset-name');
        select.innerHTML = '<option value="">...</option>';
        select.disabled = true;
        if (type && allPrices[type]) {
            select.innerHTML = `<option value="">انتخاب کنید</option>${allPrices[type].map(a => `<option value="${a.symbol}">${a.title} (${a.symbol})</option>`).join('')}`;
            select.disabled = false;
        }
    });
    
    document.getElementById('transaction-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        data.quantity = parseFloat(data.quantity);
        if (data.price_per_unit) data.price_per_unit = parseFloat(data.price_per_unit);
        data.date = data.date ? new Date(data.date + 'T12:00:00Z').toISOString() : new Date().toISOString();
        if (data.type === 'deposit' || data.type === 'withdrawal') data.symbol = 'RIAL_WALLET';
        
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
            
            const response = await fetch('/api/transactions', {
                method: 'POST', headers, body: JSON.stringify(data)
            });
            if (response.ok) {
                document.getElementById('transaction-modal')?.classList.add('hidden');
                await fetchAssets();
                await fetchChartData();
                await updateDailyProfit();
            } else {
                const error = await response.json();
                alert(`خطا: ${error.error}`);
            }
        } catch (error) {
            alert('خطای شبکه');
        }
    });
    
    document.getElementById('edit-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const transactionId = document.getElementById('edit-transaction-id').value;
        const data = {
            type: document.getElementById('edit-tx-type').value,
            date: document.getElementById('edit-tx-date').value ? new Date(document.getElementById('edit-tx-date').value + 'T12:00:00Z').toISOString() : null,
            category: document.getElementById('edit-tx-category').value,
            quantity: parseFloat(document.getElementById('edit-tx-quantity').value),
            price_per_unit: document.getElementById('edit-tx-price').value ? parseFloat(document.getElementById('edit-tx-price').value) : null,
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
            } else {
                const error = await response.json();
                alert(`خطا: ${error.error}`);
            }
        } catch (error) {
            alert('خطای شبکه');
        }
    });
    
    document.getElementById('reset-date')?.addEventListener('click', () => {
        document.getElementById('tx-date').value = '';
    });
    
    // Purchase mode
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
    
    // Transactions toggle
    document.getElementById('toggle-transactions-btn')?.addEventListener('click', toggleTransactionsView);
    document.getElementById('load-more-transactions-btn')?.addEventListener('click', toggleTransactionsView);
    
    // Report modal
    document.getElementById('close-report-modal')?.addEventListener('click', () => {
        document.getElementById('report-modal').classList.add('hidden');
    });
    
    document.getElementById('preview-report-btn')?.addEventListener('click', openPreviewInNewTab);
    document.getElementById('print-report-btn')?.addEventListener('click', downloadPDF);
    
    const checkboxIds = ['report-summary', 'report-chart', 'report-pie', 'report-balance', 
                         'report-assets-table', 'report-daily', 'report-purchase-power'];
    
    checkboxIds.forEach(id => {
        document.getElementById(id)?.addEventListener('change', updateMiniPreview);
    });
    
    document.getElementById('report-title')?.addEventListener('input', updateMiniPreview);
    document.getElementById('report-theme')?.addEventListener('change', updateMiniPreview);
    
    // API modal
    document.getElementById('close-api-modal')?.addEventListener('click', () => {
        document.getElementById('api-management-modal').classList.add('hidden');
    });
    
    document.getElementById('generate-api-key-btn')?.addEventListener('click', generateApiKey);
    document.getElementById('regenerate-api-key-btn')?.addEventListener('click', generateApiKey);
    document.getElementById('revoke-api-key-btn')?.addEventListener('click', revokeApiKey);
    document.getElementById('copy-api-key-btn')?.addEventListener('click', copyApiKey);
    document.getElementById('copy-json-preview')?.addEventListener('click', copyJsonPreview);
    document.getElementById('refresh-api-preview')?.addEventListener('click', loadApiJsonPreview);
    
    // Data modal
    document.getElementById('close-data-modal')?.addEventListener('click', () => {
        document.getElementById('data-management-modal').classList.add('hidden');
    });
    
    document.getElementById('export-data-btn')?.addEventListener('click', exportUserData);
    
    const dropzone = document.getElementById('import-dropzone');
    const fileInput = document.getElementById('import-file-input');
    
    dropzone?.addEventListener('click', () => fileInput.click());
    dropzone?.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('border-blue-500'); });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('border-blue-500'));
    dropzone?.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-blue-500');
        handleFileSelect(e.dataTransfer.files[0]);
    });
    
    fileInput?.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
    document.getElementById('import-data-btn')?.addEventListener('click', importUserData);
    
    // Start app
    initialize();
});

// Global exports
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
window.toggleFavorite = (symbol) => {};