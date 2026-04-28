// ============================================================
//  Assetly - تور راهنمای کاربر (Onboarding Tour)
//  نمایش مرحله‌بهمرحله قابلیت‌های سایت به کاربر جدید
// ============================================================

// ============================================================
//  بخش ۱: تعریف مراحل تور
// ============================================================

const onboardingSteps = [
    {
        target: '#summary-cards',
        title: '📊 کارت‌های خلاصه',
        text: 'اینجا یه نگاه سریع به وضعیت پورتفوی خودت داری. ارزش کل، سود/زیان خالص و موجودی کیف پول ریالی.',
        position: 'bottom',
        icon: '📊'
    },
    {
        target: '#investment-goal-section',
        title: '🎯 هدف سرمایه‌گذاری',
        text: 'می‌تونی برای خودت هدف مالی تعیین کنی. مثلاً "می‌خوام ۱۰۰ میلیون تومن سرمایه داشته باشم". نوار پیشرفت کمکت می‌کنه ببینی چقدر به هدفت نزدیک شدی.',
        position: 'bottom',
        icon: '🎯'
    },
    {
        target: '#purchase-power-box',
        title: '💰 قدرت خرید',
        text: 'ببین با موجودی فعلیت چقدر دلار، طلا یا بیت‌کوین می‌تونی بخری. حتی می‌تونی بین "کیف ریالی" و "کل پورتفو" جابجا شی.',
        position: 'top',
        icon: '💰'
    },
    {
        target: '#add-transaction-btn',
        title: '➕ ثبت تراکنش',
        text: 'مهم‌ترین دکمه! هر وقت خریدی، فروختی، سود سیو کردی یا واریز/برداشت داشتی، از اینجا ثبت کن. بدون تراکنش، هیچی کار نمی‌کنه!',
        position: 'bottom',
        icon: '➕'
    },
    {
        target: '#assets-table-body',
        title: '📋 دارایی‌های تو',
        text: 'اینجا لیست همه دارایی‌هات رو می‌بینی. قیمت سر به سر (همون قیمتی که خریدیش)، قیمت لحظه‌ای، موجودی و سود/زیانت.',
        position: 'top',
        icon: '📋'
    },
    {
        target: '#ticker-content',
        title: '📈 نوار قیمت‌های زنده',
        text: 'پایین صفحه قیمت‌های لحظه‌ای طلا، ارز، رمزارز و بورس رو می‌بینی. می‌تونی با دکمه "پنهان کردن" جمعش کنی یا دوباره بازش کنی.',
        position: 'top',
        icon: '📈'
    },
    {
        target: '#risk-test-section',
        title: '🧪 آزمون سنجش ریسک',
        text: 'می‌خوای بدونی چقدر ریسک‌پذیری؟ این آزمون ۱۰ سواله بهت یه پورتفوی پیشنهادی اختصاصی میده. حتماً امتحانش کن!',
        position: 'top',
        icon: '🧪'
    }
];


// ============================================================
//  بخش ۲: متغیرهای حالت تور
// ============================================================

// ---------- شماره مرحله فعلی ----------
let currentStep = 0;

// ---------- آیا تور در حال اجراست ----------
let tourActive = false;

// ---------- وضعیت نوار قیمت قبل از تور (برای بازگردانی) ----------
let tickerWasVisible = true;


// ============================================================
//  بخش ۳: توابع اصلی تور
// ============================================================

function startOnboarding() {
    // شروع تور راهنما
    // فقط در صورتی اجرا می‌شود که تور فعال نباشد و قبلاً کامل نشده باشد
    if (tourActive) return;
    if (localStorage.getItem('onboarding_completed')) return;
    if (!document.getElementById('summary-cards')) return;

    tourActive = true;
    currentStep = 0;
    tickerWasVisible = tickerVisible;

    showStep(0);
}


function showStep(stepIndex) {
    // نمایش یک مرحله از تور
    // المان target را هایلایت کرده و tooltip را نمایش می‌دهد

    // پاکسازی مراحل قبلی
    removeTourElements();

    // اگر به انتها رسیدیم، تور را تمام کن
    if (stepIndex >= onboardingSteps.length) {
        finishOnboarding();
        return;
    }

    const step = onboardingSteps[stepIndex];
    const target = document.querySelector(step.target);

    // اگر المان مورد نظر وجود نداشت، برو به مرحله بعد
    if (!target) {
        currentStep++;
        showStep(currentStep);
        return;
    }

    // اگر مرحله نوار قیمت است و نوار بسته است، بازش کن
    if (stepIndex === 5 && !tickerVisible) {
        togglePriceTicker();
        tickerWasVisible = false;
    }

    // اسکرول به المان هدف
    const rect = target.getBoundingClientRect();
    let scrollTop;

    if (stepIndex === 5) {
        // برای نوار قیمت، برو به پایین صفحه
        scrollTop = document.body.scrollHeight;
    } else {
        scrollTop = window.pageYOffset + rect.top - (window.innerHeight / 3);
    }

    window.scrollTo({
        top: scrollTop,
        behavior: 'smooth'
    });

    // تأخیر برای انیمیشن اسکرول
    // مرحله نوار قیمت تأخیر بیشتری نیاز دارد
    const delay = stepIndex === 5 ? 1000 : 800;

    setTimeout(() => {
        createOverlay(target);
        createTooltip(target, step, stepIndex);
        highlightTarget(target);
    }, delay);
}


// ============================================================
//  بخش ۴: توابع رابط کاربری تور
// ============================================================

function createOverlay(target) {
    // ساخت overlay تیره با حفره شفاف دور المان هدف
    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.className = 'fixed inset-0 z-[9998] transition-all duration-300';
    overlay.style.background = 'rgba(0, 0, 0, 0.7)';

    const rect = target.getBoundingClientRect();
    const cutout = document.createElement('div');
    cutout.id = 'onboarding-cutout';
    cutout.className = 'absolute transition-all duration-500';

    // موقعیت و اندازه حفره (با کمی padding)
    cutout.style.left = (rect.left - 8) + 'px';
    cutout.style.top = (rect.top - 8) + 'px';
    cutout.style.width = (rect.width + 16) + 'px';
    cutout.style.height = (rect.height + 16) + 'px';

    // ایجاد حفره شفاف با باکس-شادو
    cutout.style.boxShadow = '0 0 0 9999px rgba(0, 0, 0, 0.7)';
    cutout.style.borderRadius = '12px';
    cutout.style.background = 'transparent';
    cutout.style.pointerEvents = 'none';

    overlay.appendChild(cutout);
    document.body.appendChild(overlay);

    // نوار قیمت را ببر بالاتر از overlay
    const tickerBar = document.getElementById('price-ticker-bar');
    if (tickerBar) {
        tickerBar.style.zIndex = '9999';
        tickerBar.style.position = 'relative';
    }
}


function highlightTarget(target) {
    // اضافه کردن حلقه درخشان دور المان هدف
    target.classList.add('ring-2', 'ring-blue-400', 'ring-offset-2', 'ring-offset-transparent');
    target.style.position = 'relative';
    target.style.zIndex = '9999';
}


function createTooltip(target, step, index) {
    // ساخت tooltip راهنما با متن مرحله
    const tooltip = document.createElement('div');
    tooltip.id = 'onboarding-tooltip';
    tooltip.className = 'fixed z-[9999] bg-gray-900 border border-gray-700 rounded-2xl p-5 shadow-2xl max-w-sm';

    // محاسبه درصد پیشرفت
    const progressPercent = ((index + 1) / onboardingSteps.length) * 100;

    // متن دکمه مرحله آخر
    const isLastStep = index === onboardingSteps.length - 1;
    const nextButtonText = isLastStep ? '🎉 تموم!' : 'بعدی ←';

    tooltip.innerHTML = `
        <div class="flex items-start gap-3 mb-3">
            <span class="text-2xl">${step.icon}</span>
            <div class="flex-1">
                <h3 class="text-white font-bold text-lg">${step.title}</h3>
                <p class="text-gray-300 text-sm mt-1 leading-relaxed">${step.text}</p>
            </div>
        </div>

        <!-- نوار پیشرفت -->
        <div class="h-1 bg-gray-700 rounded-full mb-4">
            <div class="h-1 bg-blue-500 rounded-full transition-all duration-500"
                 style="width: ${progressPercent}%"></div>
        </div>

        <!-- دکمه‌های کنترل -->
        <div class="flex justify-between items-center">
            <span class="text-gray-500 text-xs">${index + 1} از ${onboardingSteps.length}</span>
            <div class="flex gap-2">
                <button onclick="skipOnboarding()"
                        class="text-gray-500 hover:text-gray-300 text-xs px-3 py-1.5 transition">
                    رد کردن
                </button>
                <button onclick="nextOnboardingStep()"
                        class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-1.5 rounded-lg transition font-medium">
                    ${nextButtonText}
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(tooltip);

    // محاسبه موقعیت tooltip
    const tooltipHeight = tooltip.offsetHeight;
    const tooltipWidth = tooltip.offsetWidth;

    const rect = target.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let top, left;

    // برای مرحله نوار قیمت، tooltip را وسط صفحه قرار بده
    if (index === 5) {
        top = (viewportHeight / 2) - (tooltipHeight / 2);
        left = (viewportWidth / 2) - (tooltipWidth / 2);
    } else {
        // تصمیم‌گیری برای نمایش بالا یا پایین المان
        const spaceBelow = viewportHeight - rect.bottom;
        const spaceAbove = rect.top;

        if (step.position === 'bottom' || spaceBelow > spaceAbove) {
            top = rect.bottom + 12;
            // اگر از پایین صفحه خارج شد، برو بالا
            if (top + tooltipHeight > viewportHeight - 80) {
                top = rect.top - tooltipHeight - 12;
            }
        } else {
            top = rect.top - tooltipHeight - 12;
            // اگر از بالای صفحه خارج شد، برو پایین
            if (top < 80) {
                top = rect.bottom + 12;
            }
        }

        // وسط‌چین افقی
        left = rect.left + (rect.width / 2) - (tooltipWidth / 2);

        // محدود کردن به لبه‌های صفحه
        if (left < 16) left = 16;
        if (left + tooltipWidth > viewportWidth - 16) {
            left = viewportWidth - tooltipWidth - 16;
        }

        if (top < 16) top = 16;
    }

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.style.opacity = '1';
}


// ============================================================
//  بخش ۵: توابع پاکسازی
// ============================================================

function removeTourElements() {
    // حذف تمام المان‌های مربوط به تور (overlay و tooltip)
    document.getElementById('onboarding-overlay')?.remove();
    document.getElementById('onboarding-tooltip')?.remove();

    // حذف حلقه‌های هایلایت از المان‌ها
    document.querySelectorAll('.ring-2.ring-blue-400').forEach(el => {
        el.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-2', 'ring-offset-transparent');
        el.style.position = '';
        el.style.zIndex = '';
    });

    // برگرداندن z-index نوار قیمت به حالت عادی
    const tickerBar = document.getElementById('price-ticker-bar');
    if (tickerBar) {
        tickerBar.style.zIndex = '40';
        tickerBar.style.position = 'fixed';
    }
}


// ============================================================
//  بخش ۶: کنترل جریان تور
// ============================================================

function nextOnboardingStep() {
    // رفتن به مرحله بعد
    removeTourElements();
    currentStep++;

    if (currentStep >= onboardingSteps.length) {
        finishOnboarding();
    } else {
        setTimeout(() => showStep(currentStep), 300);
    }
}


function skipOnboarding() {
    // رد کردن (پرش از) تور
    removeTourElements();
    finishOnboarding();
}


function finishOnboarding() {
    // پایان تور و ذخیره وضعیت
    removeTourElements();
    tourActive = false;
    localStorage.setItem('onboarding_completed', 'true');

    // اگر نوار قیمت قبلاً بسته بود، دوباره جمعش کن
    if (!tickerWasVisible && tickerVisible) {
        togglePriceTicker();
    }

    // نمایش پیام خوش‌آمدگویی نهایی
    showWelcomeToast();
}


// ============================================================
//  بخش ۷: پیام خوش‌آمدگویی
// ============================================================

function showWelcomeToast() {
    // نمایش پیام نهایی بعد از اتمام تور
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 left-6 z-[9999] bg-gray-900 border border-green-800 rounded-xl p-4 shadow-2xl max-w-sm';
    toast.style.animation = 'tooltipIn 0.3s ease-out';

    toast.innerHTML = `
        <div class="flex items-start gap-3">
            <span class="text-3xl">🚀</span>
            <div>
                <p class="text-white font-bold">آماده‌ای برای شروع!</p>
                <p class="text-gray-400 text-sm mt-1">
                    حالا می‌تونی اولین تراکنش خودت رو ثبت کنی. از دکمه "+ ثبت تراکنش" شروع کن.
                </p>
            </div>
            <button onclick="this.parentElement.parentElement.remove()"
                    class="text-gray-500 hover:text-white">✕</button>
        </div>
    `;

    document.body.appendChild(toast);

    // حذف خودکار بعد از ۸ ثانیه
    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, 8000);
}


// ============================================================
//  بخش ۸: توابع مدیریتی
// ============================================================

function resetOnboarding() {
    // ریست کردن تور برای اجرای مجدد
    localStorage.removeItem('onboarding_completed');
    tourActive = false;
    currentStep = 0;
    removeTourElements();
    tickerWasVisible = tickerVisible;
}


function initOnboarding() {
    // بررسی و شروع خودکار تور برای کاربران جدید
    // فقط برای کاربرانی که وارد شده‌اند و تور را کامل نکرده‌اند
    if (!localStorage.getItem('onboarding_completed') && currentUser) {
        setTimeout(() => {
            if (document.getElementById('summary-cards')) {
                startOnboarding();
            }
        }, 2000);
    }
}


// ============================================================
//  Export توابع گلوبال
// ============================================================

window.startOnboarding = startOnboarding;
window.nextOnboardingStep = nextOnboardingStep;
window.skipOnboarding = skipOnboarding;
window.resetOnboarding = resetOnboarding;