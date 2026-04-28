// ============================================================
//  Assetly - صفحه نمای بازارها
//  نمایش قیمت‌های لحظه‌ای تمام بازارها با قابلیت جستجو و دیده‌بان
// ============================================================

// ============================================================
//  بخش ۱: متغیرهای گلوبال
// ============================================================

// ---------- داده‌های بازار ----------
let allMarkets = [];

// ---------- لیست علاقه‌مندی‌ها ----------
let favoriteMarkets = new Set(
    JSON.parse(localStorage.getItem('favoriteMarkets') || '[]')
);

// ---------- وضعیت فعلی صفحه ----------
let currentTab = 'watchlist';
let searchQuery = '';


// ============================================================
//  بخش ۲: ثابت‌ها
// ============================================================

// ---------- نام فارسی دسته‌بندی‌ها ----------
const categoryNames = {
    'gold_coin': '🏆 سکه و طلا',
    'currency': '💵 ارز',
    'crypto': '₿ ارز دیجیتال',
    'stock': '📈 بورس'
};

// ---------- رنگ هر دسته‌بندی ----------
const categoryColors = {
    'gold_coin': 'bg-yellow-600/20 text-yellow-400 border-yellow-600',
    'currency': 'bg-green-600/20 text-green-400 border-green-600',
    'crypto': 'bg-blue-600/20 text-blue-400 border-blue-600',
    'stock': 'bg-purple-600/20 text-purple-400 border-purple-600'
};


// ============================================================
//  بخش ۳: توابع فرمت‌کننده
// ============================================================

const formatToman = (price) => {
    // فرمت عدد به تومان با جداکننده فارسی
    if (!price && price !== 0) return '-';
    const num = parseFloat(price);
    if (isNaN(num)) return '-';
    return num.toLocaleString('fa-IR') + ' ت';
};

const formatDollar = (price) => {
    // فرمت عدد به دلار
    if (!price && price !== 0) return '-';
    const num = parseFloat(price);
    if (isNaN(num)) return '-';
    return '$' + num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
    });
};

const formatPercent = (percent) => {
    // فرمت درصد با علامت +/-
    if (percent === null || percent === undefined) return '0.00%';
    const num = parseFloat(percent);
    if (isNaN(num)) return '0.00%';
    return (num >= 0 ? '+' : '') + num.toFixed(2) + '%';
};

const formatDateTime = (dateStr) => {
    // تبدیل تاریخ به فرمت شمسی با ساعت
    // پشتیبانی از چندین فرمت ورودی مختلف
    if (!dateStr) return '--:--';

    try {
        // فرمت ۱: "2024-01-20 14:30" (بورس)
        if (dateStr.includes(' ') && dateStr.includes('-')) {
            const [datePart, timePart] = dateStr.split(' ');
            const [year, month, day] = datePart.split('-');
            const [hour, minute] = timePart.split(':');

            const gregorianDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            const persianDate = gregorianDate.toLocaleDateString('fa-IR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).replace(/\//g, '/');

            return `${persianDate} | ${hour}:${minute}`;
        }

        // فرمت ۲: "۱۴۰۴/۰۱/۳۱" یا "1404/01/31" (شمسی)
        if (dateStr.includes('/')) {
            const parts = dateStr.split(' ');
            const datePart = parts[0];
            const timePart = parts.length > 1 ? parts[1] : '';

            // تبدیل اعداد فارسی به انگلیسی
            const persianNumbers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
            const englishNumbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

            let normalizedDate = datePart;
            persianNumbers.forEach((p, i) => {
                normalizedDate = normalizedDate.replace(new RegExp(p, 'g'), englishNumbers[i]);
            });

            if (timePart) {
                let normalizedTime = timePart;
                persianNumbers.forEach((p, i) => {
                    normalizedTime = normalizedTime.replace(new RegExp(p, 'g'), englishNumbers[i]);
                });
                return `${normalizedDate.replace(/\//g, '/')} | ${normalizedTime}`;
            }

            return normalizedDate.replace(/\//g, '/');
        }

        // فرمت ۳: ISO string یا هر فرمت استاندارد دیگر
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            const persianDate = date.toLocaleDateString('fa-IR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).replace(/\//g, '/');

            const time = date.toLocaleTimeString('fa-IR', {
                hour: '2-digit',
                minute: '2-digit'
            });

            return `${persianDate} | ${time}`;
        }

        // اگر هیچ فرمتی match نشد، خود رشته را برگردان
        return dateStr;

    } catch (error) {
        console.warn('⚠️ خطا در پارس تاریخ:', dateStr, error);
        return dateStr || '--:--';
    }
};


// ============================================================
//  بخش ۴: دریافت داده‌ها از سرور
// ============================================================

const fetchAllPrices = async () => {
    // دریافت قیمت‌های لحظه‌ای از API و تبدیل به آرایه یکپارچه
    try {
        const response = await fetch('/api/prices');
        if (!response.ok) throw new Error('Failed to fetch prices');

        const data = await response.json();

        // تبدیل داده‌های دسته‌بندی شده به آرایه یکپارچه
        const markets = [];

        Object.keys(data).forEach(category => {
            // رد کردن فیلدهای غیر دیتا
            if (category === 'last_updated' || category === 'api_error') return;

            const items = data[category];
            if (Array.isArray(items)) {
                items.forEach(item => {
                    const marketItem = {
                        ...item,
                        category: category,
                        displayPrice: item.toman_price || item.price,
                        displayName: item.title || item.name || item.symbol
                    };

                    // برای بورس، عنوان رو از name یا title می‌گیریم
                    if (category === 'stock') {
                        marketItem.displayName = item.name || item.title || item.symbol;
                        marketItem.change_percent = item.change_percent || 0;
                        marketItem.change_value = item.change_value || 0;
                    }

                    markets.push(marketItem);
                });
            }
        });

        allMarkets = markets;

        console.log(`✅ ${markets.length} بازار بارگذاری شد`);

        // بروزرسانی زمان آخرین بروزرسانی
        const now = new Date();
        document.getElementById('last-update-time').textContent =
            `آخرین بروزرسانی: ${now.toLocaleTimeString('fa-IR')}`;

        renderMarkets();

    } catch (error) {
        console.error('❌ خطا در دریافت قیمت‌ها:', error);
        document.getElementById('markets-grid').innerHTML =
            '<div class="col-span-full text-center py-8 text-red-400">خطا در بارگذاری قیمت‌ها</div>';
    }
};


// ============================================================
//  بخش ۵: مدیریت علاقه‌مندی‌ها (دیده‌بان)
// ============================================================

const toggleFavorite = (symbol) => {
    // اضافه یا حذف کردن یک نماد از لیست دیده‌بان
    if (favoriteMarkets.has(symbol)) {
        favoriteMarkets.delete(symbol);
    } else {
        favoriteMarkets.add(symbol);
    }

    // ذخیره در localStorage
    localStorage.setItem('favoriteMarkets', JSON.stringify([...favoriteMarkets]));

    // بروزرسانی تعداد
    updateWatchlistCount();

    // رندر مجدد در صورت نیاز
    if (currentTab === 'watchlist' || currentTab === 'all') {
        renderMarkets();
    } else {
        // فقط آیکون ستاره را بروزرسانی کن (بدون رندر کامل)
        document.querySelectorAll(`.favorite-btn[data-symbol="${symbol}"]`).forEach(btn => {
            const isFavorite = favoriteMarkets.has(symbol);
            btn.classList.toggle('active', isFavorite);
            const svg = btn.querySelector('svg');
            if (svg) {
                svg.setAttribute('fill', isFavorite ? '#fbbf24' : 'none');
            }
        });
    }
};

const updateWatchlistCount = () => {
    // بروزرسانی عدد badge دیده‌بان
    const countEl = document.getElementById('watchlist-count');
    if (countEl) {
        countEl.textContent = favoriteMarkets.size;
    }
};


// ============================================================
//  بخش ۶: فیلتر و جستجو
// ============================================================

const filterMarkets = () => {
    // فیلتر بازارها بر اساس تب فعال و متن جستجو
    let filtered = [...allMarkets];

    // فیلتر بر اساس تب
    if (currentTab === 'watchlist') {
        filtered = filtered.filter(m => favoriteMarkets.has(m.symbol));
    } else if (currentTab !== 'all') {
        filtered = filtered.filter(m => m.category === currentTab);
    }

    // فیلتر بر اساس جستجو
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(m =>
            m.symbol.toLowerCase().includes(query) ||
            (m.displayName || '').toLowerCase().includes(query) ||
            (m.title || '').toLowerCase().includes(query) ||
            (m.name || '').toLowerCase().includes(query)
        );
    }

    return filtered;
};

const highlightText = (text, query) => {
    // هایلایت کردن بخشی از متن که با query مطابقت دارد
    if (!query || !text) return text || '';

    try {
        const regex = new RegExp(`(${query})`, 'gi');
        return String(text).replace(regex, '<span class="search-highlight">$1</span>');
    } catch {
        return text;
    }
};


// ============================================================
//  بخش ۷: رندر کارت‌های بازار
// ============================================================

const renderMarkets = () => {
    // رندر شبکه کارت‌های بازار
    const grid = document.getElementById('markets-grid');
    const emptyMsg = document.getElementById('empty-message');

    if (!grid) return;

    const filtered = filterMarkets();

    // حالت خالی
    if (filtered.length === 0) {
        grid.innerHTML = '';
        if (emptyMsg) emptyMsg.classList.remove('hidden');
        return;
    }

    if (emptyMsg) emptyMsg.classList.add('hidden');

    let html = '';

    filtered.forEach(market => {
        const isFavorite = favoriteMarkets.has(market.symbol);
        const changePercent = market.change_percent ? parseFloat(market.change_percent) : 0;
        const isPositive = changePercent >= 0;
        const changeColor = isPositive ? 'text-green-400' : 'text-red-400';
        const changeIcon = isPositive ? '▲' : '▼';

        // هایلایت متن جستجو شده
        const displayName = highlightText(market.displayName || market.symbol, searchQuery);
        const displaySymbol = highlightText(market.symbol, searchQuery);

        // تعیین قیمت نمایشی بر اساس نوع دارایی
        let priceDisplay = '';
        let secondaryPrice = '';

        if (market.category === 'stock') {
            // بورس: قیمت به تومان + مقدار تغییر
            priceDisplay = formatToman(market.toman_price || market.price);
            if (market.change_value) {
                const changeVal = parseFloat(market.change_value);
                const changeSign = changeVal >= 0 ? '+' : '';
                secondaryPrice = `${changeSign}${formatToman(Math.abs(changeVal))}`;
            }
        } else if (market.symbol === 'XAUUSD' || market.category === 'crypto') {
            // طلای جهانی و رمزارز: قیمت به دلار + معادل تومان
            const usdPrice = market.usd_price || market.price;
            priceDisplay = formatDollar(usdPrice);
            if (market.toman_price) {
                secondaryPrice = formatToman(market.toman_price);
            }
        } else if (market.symbol === 'USDT_IRT') {
            // تتر: قیمت به تومان
            priceDisplay = formatToman(market.toman_price || market.price);
        } else {
            // بقیه موارد: قیمت به تومان
            priceDisplay = formatToman(market.toman_price || market.price);
        }

        // زمان آخرین بروزرسانی
        const updateTime = market.last_update ? formatDateTime(market.last_update) : '';

        html += `
            <div class="market-card rounded-xl p-4" data-symbol="${market.symbol}" data-category="${market.category}">
                <!-- هدر کارت -->
                <div class="flex justify-between items-start mb-3">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="category-badge ${categoryColors[market.category] || 'bg-gray-600/20 text-gray-400 border-gray-600'} border">
                                ${categoryNames[market.category] || market.category}
                            </span>
                        </div>
                        <h3 class="font-medium text-white text-lg">${displayName}</h3>
                        <p class="text-gray-500 text-sm font-mono">${displaySymbol}</p>
                    </div>
                    <button class="favorite-btn ${isFavorite ? 'active' : ''} text-gray-400 hover:text-yellow-400 transition"
                            data-symbol="${market.symbol}" onclick="toggleFavorite('${market.symbol}')">
                        <svg class="w-5 h-5" fill="${isFavorite ? '#fbbf24' : 'none'}" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
                        </svg>
                    </button>
                </div>

                <!-- بخش قیمت -->
                <div class="mb-3">
                    <div class="flex items-baseline gap-2">
                        <span class="text-2xl font-bold text-white font-mono">${priceDisplay}</span>
                        <span class="text-sm ${changeColor} flex items-center gap-0.5">
                            ${changeIcon} ${Math.abs(changePercent).toFixed(2)}%
                        </span>
                    </div>
                    ${secondaryPrice ? `<p class="text-gray-400 text-sm font-mono mt-1">${secondaryPrice}</p>` : ''}
                </div>

                <!-- فوتر کارت -->
                <div class="flex justify-between items-center text-xs text-gray-500 border-t border-gray-700 pt-3 mt-2">
                    <span>${updateTime}</span>
                    <button class="text-blue-400 hover:text-blue-300" onclick="window.location.href='/'">
                        خرید/فروش ←
                    </button>
                </div>
            </div>
        `;
    });

    grid.innerHTML = html;
};


// ============================================================
//  بخش ۸: مدیریت تب‌ها
// ============================================================

const switchTab = (tabId) => {
    // تغییر تب فعال و رندر مجدد
    currentTab = tabId;

    // بروزرسانی کلاس‌های فعال
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const isActive = btn.dataset.tab === tabId;
        btn.classList.toggle('tab-active', isActive);
        btn.classList.toggle('tab-inactive', !isActive);
    });

    renderMarkets();
};


// ============================================================
//  بخش ۹: راه‌اندازی و Event Listeners
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

    // لود اولیه قیمت‌ها
    fetchAllPrices();
    updateWatchlistCount();

    // کلیک روی تب‌ها
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // جستجوی بازارها (با debounce 300ms)
    const searchInput = document.getElementById('market-search');
    let searchTimeout;

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchQuery = e.target.value.trim();
                renderMarkets();
            }, 300);
        });
    }

    // بروزرسانی خودکار هر ۲ دقیقه
    setInterval(fetchAllPrices, 120000);
});


// ============================================================
//  Export توابع گلوبال
// ============================================================

window.toggleFavorite = toggleFavorite;