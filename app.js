(() => {
  'use strict';

  // ==================== 持久化 Key ====================
  const STORAGE_KEYS = {
    FAVORITES: 'ios_cal_favorites_v1',
    CUSTOM_FOODS: 'ios_cal_custom_foods_v1',
    PLATE: 'ios_cal_plate_v1',
    PLATE_DATE: 'ios_cal_plate_date_v1',
    GOAL: 'ios_cal_goal_v1',
    THEME: 'ios_cal_theme_v1',
    INSTALL_DISMISSED: 'ios_cal_install_dismissed_v1',
    AI_CONFIG: 'ios_cal_ai_config_v1'
  };

  const CUSTOM_EMOJIS = [
    '🍱', '🍚', '🍜', '🥟', '🍞', '🍗', '🥩', '🦐',
    '🥚', '🥦', '🥗', '🍎', '🥑', '🥛', '☕', '🧋',
    '🍔', '🍕', '🍢', '🍰', '🍪', '🍫', '🍲', '🍽️'
  ];

  function getTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getSmartDefaultMeal() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h >= 5 && h < 10.5) return 'breakfast';
    if (h >= 10.5 && h < 14.5) return 'lunch';
    if (h >= 17 && h < 21) return 'dinner';
    return 'snack';
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function loadTodayPlate() {
    const savedDate = localStorage.getItem(STORAGE_KEYS.PLATE_DATE);
    const today = getTodayStr();
    if (savedDate !== today) {
      localStorage.setItem(STORAGE_KEYS.PLATE_DATE, today);
      localStorage.setItem(STORAGE_KEYS.PLATE, '[]');
      return [];
    }
    return loadJSON(STORAGE_KEYS.PLATE, []);
  }

  // ==================== 应用状态 ====================
  const state = {
    activeTab: 'lookup',
    category: 'all',
    levelFilter: 'all',
    searchQuery: '',
    listUnitMode: '100g', // '100g' | 'unit'
    customFoods: loadJSON(STORAGE_KEYS.CUSTOM_FOODS, []),
    favorites: loadJSON(STORAGE_KEYS.FAVORITES, ['egg', 'chicken-breast', 'rice', 'milk-tea']),
    plateItems: loadTodayPlate(),
    dailyGoal: Number(localStorage.getItem(STORAGE_KEYS.GOAL)) || 1800,
    aiConfig: loadJSON(STORAGE_KEYS.AI_CONFIG, {
      provider: 'gemini',
      apiKey: '',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-vl-plus'
    }),
    sheet: {
      food: null,
      mode: 'unit',
      amount: 1,
      meal: getSmartDefaultMeal()
    },
    customFormEmoji: '🍱',
    lastAIResult: null
  };

  function saveCustomFoods() {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_FOODS, JSON.stringify(state.customFoods));
  }

  function saveFavorites() {
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(state.favorites));
  }

  function savePlate() {
    localStorage.setItem(STORAGE_KEYS.PLATE_DATE, getTodayStr());
    localStorage.setItem(STORAGE_KEYS.PLATE, JSON.stringify(state.plateItems));
  }

  function saveGoal() {
    localStorage.setItem(STORAGE_KEYS.GOAL, String(state.dailyGoal));
  }

  function saveAIConfig() {
    localStorage.setItem(STORAGE_KEYS.AI_CONFIG, JSON.stringify(state.aiConfig));
  }

  function getAllFoods() {
    return [...state.customFoods, ...FOOD_DATABASE];
  }

  function getFoodById(id) {
    return state.customFoods.find((x) => x.id === id) || FOOD_DATABASE.find((x) => x.id === id);
  }

  // ==================== DOM 引用 ====================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const dom = {
    toast: $('#toast'),
    installBanner: $('#install-banner'),
    closeInstallBanner: $('#close-install-banner'),

    // Lookup
    searchInput: $('#search-input'),
    searchClear: $('#search-clear'),
    btnOpenCamera: $('#btn-open-camera'),
    btnAddCustom: $('#btn-add-custom'),
    categoryTabs: $('#category-tabs'),
    levelFilters: $('#level-filters'),
    unitToggle: $('#unit-toggle'),
    favUnitToggle: $('#fav-unit-toggle'),
    resultCount: $('#result-count'),
    foodList: $('#food-list'),
    lookupEmpty: $('#lookup-empty'),
    btnEmptyAddCustom: $('#btn-empty-add-custom'),
    btnEmptyCamera: $('#btn-empty-camera'),
    btnResetFilters: $('#btn-reset-filters'),
    btnLegend: $('#btn-legend'),
    btnTheme: $('#btn-theme'),

    // Favorites
    favoritesList: $('#favorites-list'),
    favoritesEmpty: $('#favorites-empty'),
    btnGoLookup: $('#btn-go-lookup'),

    // Plate
    ringProgress: $('#ring-progress'),
    plateTotalKcal: $('#plate-total-kcal'),
    summaryGoalBtn: $('#summary-goal-btn'),
    remainLabel: $('#remain-label'),
    plateRemainKcal: $('#plate-remain-kcal'),
    plateItemCount: $('#plate-item-count'),
    plateBarCarbs: $('#plate-bar-carbs'),
    plateBarProtein: $('#plate-bar-protein'),
    plateBarFat: $('#plate-bar-fat'),
    plateTotalCarbs: $('#plate-total-carbs'),
    plateTotalProtein: $('#plate-total-protein'),
    plateTotalFat: $('#plate-total-fat'),
    plateMealsContainer: $('#plate-meals-container'),
    plateEmpty: $('#plate-empty'),
    btnPlateCamera: $('#btn-plate-camera'),
    btnEditGoal: $('#btn-edit-goal'),
    btnClearPlate: $('#btn-clear-plate'),
    btnPlateGoLookup: $('#btn-plate-go-lookup'),

    // Tab bar & Badges
    tabItems: $$('.tab-item'),
    badgeFavorites: $('#badge-favorites'),
    badgePlate: $('#badge-plate'),

    // Detail Sheet
    detailBackdrop: $('#detail-backdrop'),
    detailSheet: $('#detail-sheet'),
    sheetGrabber: $('#sheet-grabber'),
    sheetCloseBtn: $('#sheet-close-btn'),
    sheetEditBtn: $('#sheet-edit-btn'),
    sheetDeleteBtn: $('#sheet-delete-btn'),
    sheetFavBtn: $('#sheet-fav-btn'),
    sheetEmoji: $('#sheet-emoji'),
    sheetFoodName: $('#sheet-food-name'),
    sheetLevelBadge: $('#sheet-level-badge'),
    sheetCustomBadge: $('#sheet-custom-badge'),
    sheetBaseInfo: $('#sheet-base-info'),
    sheetCalcKcal: $('#sheet-calc-kcal'),
    sheetCalcWeight: $('#sheet-calc-weight'),
    sheetModeToggle: $('#sheet-mode-toggle'),
    sheetModeUnitBtn: $('#sheet-mode-unit-btn'),
    btnStepMinus: $('#btn-step-minus'),
    btnStepPlus: $('#btn-step-plus'),
    sheetAmountInput: $('#sheet-amount-input'),
    sheetAmountUnit: $('#sheet-amount-unit'),
    sheetQuickPicks: $('#sheet-quick-picks'),
    sheetCarbs: $('#sheet-carbs'),
    sheetProtein: $('#sheet-protein'),
    sheetFat: $('#sheet-fat'),
    sheetCarbsPct: $('#sheet-carbs-pct'),
    sheetProteinPct: $('#sheet-protein-pct'),
    sheetFatPct: $('#sheet-fat-pct'),
    sheetBarCarbs: $('#sheet-bar-carbs'),
    sheetBarProtein: $('#sheet-bar-protein'),
    sheetBarFat: $('#sheet-bar-fat'),
    sheetTip: $('#sheet-tip'),
    sheetMealPicker: $('#sheet-meal-picker'),
    sheetAddPlateBtn: $('#sheet-add-plate-btn'),
    sheetAddKcal: $('#sheet-add-kcal'),

    // Custom Food Sheet
    customBackdrop: $('#custom-backdrop'),
    customSheet: $('#custom-sheet'),
    customGrabber: $('#custom-grabber'),
    customCloseBtn: $('#custom-close-btn'),
    customSheetTitle: $('#custom-sheet-title'),
    customFoodForm: $('#custom-food-form'),
    cfId: $('#cf-id'),
    cfEmojiPicker: $('#cf-emoji-picker'),
    cfName: $('#cf-name'),
    cfCategory: $('#cf-category'),
    cfKcal: $('#cf-kcal'),
    cfCarbs: $('#cf-carbs'),
    cfProtein: $('#cf-protein'),
    cfFat: $('#cf-fat'),
    cfUnitName: $('#cf-unit-name'),
    cfUnitGrams: $('#cf-unit-grams'),
    cfTip: $('#cf-tip'),
    cfSubmitBtn: $('#cf-submit-btn'),

    // Camera AI Sheet
    cameraBackdrop: $('#camera-backdrop'),
    cameraSheet: $('#camera-sheet'),
    cameraGrabber: $('#camera-grabber'),
    cameraCloseBtn: $('#camera-close-btn'),
    btnToggleAIConfig: $('#btn-toggle-ai-config'),
    aiStatusPill: $('#ai-status-pill'),
    aiConfigPanel: $('#ai-config-panel'),
    aiProvider: $('#ai-provider'),
    aiOpenAIFields: $('#ai-openai-fields'),
    aiBaseUrl: $('#ai-base-url'),
    aiModel: $('#ai-model'),
    aiApiKey: $('#ai-api-key'),
    btnSaveAIConfig: $('#btn-save-ai-config'),
    cameraCaptureInput: $('#camera-capture-input'),
    cameraGalleryInput: $('#camera-gallery-input'),
    btnTakePhoto: $('#btn-take-photo'),
    btnPickGallery: $('#btn-pick-gallery'),
    cameraPreviewWrap: $('#camera-preview-wrap'),
    cameraPreviewImg: $('#camera-preview-img'),
    cameraScanningOverlay: $('#camera-scanning-overlay'),
    cameraNoKeyTip: $('#camera-no-key-tip'),
    cameraErrorBox: $('#camera-error-box'),
    cameraResultCard: $('#camera-result-card'),
    aiResEmoji: $('#ai-res-emoji'),
    aiResName: $('#ai-res-name'),
    aiResLevel: $('#ai-res-level'),
    aiResPortion: $('#ai-res-portion'),
    aiResTotalKcal: $('#ai-res-total-kcal'),
    aiResCarbs: $('#ai-res-carbs'),
    aiResProtein: $('#ai-res-protein'),
    aiResFat: $('#ai-res-fat'),
    aiResTip: $('#ai-res-tip'),
    btnAIAddPlate: $('#btn-ai-add-plate'),
    btnAISaveCustom: $('#btn-ai-save-custom'),
    aiLocalMatches: $('#ai-local-matches'),
    aiLocalMatchesList: $('#ai-local-matches-list'),

    // Modal
    modalBackdrop: $('#modal-backdrop'),
    modalTitle: $('#modal-title'),
    modalContent: $('#modal-content'),
    modalActions: $('#modal-actions')
  };

  // ==================== Toast 工具 ====================
  let toastTimer = null;
  function showToast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.toast.classList.remove('show');
    }, 2000);
  }

  // ==================== 主题切换 ====================
  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefersDark ? 'dark' : 'light'));
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
    const meta = $('#theme-color-meta');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#000000' : '#F2F2F7');
    }
    dom.btnTheme.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  // ==================== 营养计算辅助 ====================
  function calcNutrition(food, grams) {
    const ratio = Math.max(0, grams) / 100;
    const kcal = Math.round(food.kcal * ratio);
    const carbs = +(food.carbs * ratio).toFixed(1);
    const protein = +(food.protein * ratio).toFixed(1);
    const fat = +(food.fat * ratio).toFixed(1);

    const cCal = carbs * 4;
    const pCal = protein * 4;
    const fCal = fat * 9;
    const totalMacroCal = cCal + pCal + fCal;

    let carbsPct = 0, proteinPct = 0, fatPct = 0;
    if (totalMacroCal > 0) {
      carbsPct = Math.round((cCal / totalMacroCal) * 100);
      proteinPct = Math.round((pCal / totalMacroCal) * 100);
      fatPct = Math.max(0, 100 - carbsPct - proteinPct);
    }

    return { kcal, carbs, protein, fat, carbsPct, proteinPct, fatPct };
  }

  // ==================== 渲染：分类胶囊 ====================
  function renderCategories() {
    dom.categoryTabs.innerHTML = FOOD_CATEGORIES.map((cat) => `
      <button
        class="cat-chip ${state.category === cat.id ? 'active' : ''}"
        data-cat="${cat.id}"
        role="tab"
        aria-selected="${state.category === cat.id}"
      >
        <span>${cat.icon}</span>
        <span>${cat.name}</span>
      </button>
    `).join('');
  }

  // ==================== 渲染：食物列表行 ====================
  function createFoodRowHTML(food) {
    const level = getCalorieLevel(food.kcal);
    const isFav = state.favorites.includes(food.id);
    const isUnitMode = state.listUnitMode === 'unit';
    const displayKcal = isUnitMode
      ? Math.round((food.kcal * food.unitGrams) / 100)
      : food.kcal;
    const displayUnit = isUnitMode
      ? `kcal / ${food.unitName}`
      : 'kcal / 100g';

    const subText = isUnitMode
      ? `约 ${food.unitGrams}g · 蛋白 ${((food.protein * food.unitGrams) / 100).toFixed(1)}g`
      : `${food.unitName}≈${food.unitGrams}g · 蛋白 ${food.protein}g`;

    return `
      <div class="food-row" data-food-id="${food.id}">
        <div class="food-emoji-box">${food.emoji}</div>
        <div class="food-info">
          <div class="food-name-line">
            <span class="dot dot-${level.key}" title="${level.badgeText}"></span>
            <span class="food-name">${escapeHTML(food.name)}</span>
            ${food.isCustom ? '<span class="custom-badge">自定义</span>' : ''}
            ${isFav ? '<span class="fav-heart-mini" title="已收藏">❤️</span>' : ''}
          </div>
          <div class="food-sub">${escapeHTML(subText)}</div>
        </div>
        <div class="food-right">
          <div class="food-kcal-col">
            <div class="food-kcal-val ${level.key}">${displayKcal}</div>
            <div class="food-kcal-unit">${escapeHTML(displayUnit)}</div>
          </div>
          <button class="quick-add-btn" data-quick-add="${food.id}" aria-label="快捷加入餐盘" title="快捷加入今日餐盘">+</button>
        </div>
      </div>
    `;
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 增强检索：支持多关键词空格分词 + 名称/别名/品牌/分类/小贴士/自定义标签全字段搜索
  function getFilteredFoods() {
    const rawQ = state.searchQuery.trim().toLowerCase();
    const tokens = rawQ ? rawQ.split(/\s+/).filter(Boolean) : [];

    return getAllFoods().filter((food) => {
      if (state.category !== 'all' && food.category !== state.category) return false;
      if (state.levelFilter !== 'all' && getCalorieLevel(food.kcal).key !== state.levelFilter) return false;
      if (tokens.length > 0) {
        const catObj = FOOD_CATEGORIES.find((c) => c.id === food.category);
        const haystack = [
          food.name,
          food.alias || '',
          catObj ? catObj.name : '',
          food.unitName || '',
          food.tip || '',
          food.isCustom ? '自定义' : ''
        ].join(' ').toLowerCase();
        return tokens.every((tk) => haystack.includes(tk));
      }
      return true;
    });
  }

  function renderLookupList() {
    const foods = getFilteredFoods();
    const customCount = state.customFoods.length;
    dom.resultCount.textContent = customCount > 0
      ? `共 ${foods.length} 种食物（含 ${customCount} 种自定义）`
      : `共 ${foods.length} 种食物`;

    if (foods.length === 0) {
      dom.foodList.classList.add('hidden');
      dom.lookupEmpty.classList.remove('hidden');
      const q = state.searchQuery.trim();
      dom.btnEmptyAddCustom.textContent = q
        ? `＋ 添加「${q.slice(0, 12)}」到食物库`
        : '＋ 添加到我的食物库';
      return;
    }

    dom.lookupEmpty.classList.add('hidden');
    dom.foodList.classList.remove('hidden');
    dom.foodList.innerHTML = foods.map(createFoodRowHTML).join('');
  }

  // ==================== 渲染：收藏列表 ====================
  function renderFavoritesList() {
    const favFoods = state.favorites
      .map(getFoodById)
      .filter(Boolean);

    updateBadges();

    if (favFoods.length === 0) {
      dom.favoritesList.classList.add('hidden');
      dom.favoritesEmpty.classList.remove('hidden');
      return;
    }

    dom.favoritesEmpty.classList.add('hidden');
    dom.favoritesList.classList.remove('hidden');
    dom.favoritesList.innerHTML = favFoods.map(createFoodRowHTML).join('');
  }

  // ==================== 渲染：今日餐盘 ====================
  function renderPlate() {
    let totalKcal = 0;
    let totalCarbs = 0;
    let totalProtein = 0;
    let totalFat = 0;

    const enriched = state.plateItems.map((item) => {
      const food = getFoodById(item.foodId) || item.snapshot;
      if (!food) return null;
      const nut = calcNutrition(food, item.grams);
      totalKcal += nut.kcal;
      totalCarbs += nut.carbs;
      totalProtein += nut.protein;
      totalFat += nut.fat;
      return { ...item, food, nut, existsInDb: Boolean(getFoodById(item.foodId)) };
    }).filter(Boolean);

    const circumference = 2 * Math.PI * 50;
    const ratio = state.dailyGoal > 0 ? totalKcal / state.dailyGoal : 0;
    const clampedRatio = Math.min(ratio, 1);
    dom.ringProgress.style.strokeDashoffset = String(circumference * (1 - clampedRatio));

    if (ratio > 1) {
      dom.ringProgress.style.stroke = 'var(--ios-red)';
    } else if (ratio >= 0.85) {
      dom.ringProgress.style.stroke = 'var(--ios-yellow)';
    } else {
      dom.ringProgress.style.stroke = 'var(--ios-green)';
    }

    dom.plateTotalKcal.textContent = totalKcal;
    dom.summaryGoalBtn.textContent = `${state.dailyGoal} kcal ✎`;
    dom.plateItemCount.textContent = `${enriched.length} 项`;

    const diff = state.dailyGoal - totalKcal;
    if (diff >= 0) {
      dom.remainLabel.textContent = '还可摄入';
      dom.plateRemainKcal.textContent = `${diff} kcal`;
      dom.plateRemainKcal.classList.remove('over');
    } else {
      dom.remainLabel.textContent = '已超出';
      dom.plateRemainKcal.textContent = `${Math.abs(diff)} kcal`;
      dom.plateRemainKcal.classList.add('over');
    }

    dom.plateTotalCarbs.textContent = `${totalCarbs.toFixed(1)}g`;
    dom.plateTotalProtein.textContent = `${totalProtein.toFixed(1)}g`;
    dom.plateTotalFat.textContent = `${totalFat.toFixed(1)}g`;

    const cCal = totalCarbs * 4;
    const pCal = totalProtein * 4;
    const fCal = totalFat * 9;
    const macroSum = cCal + pCal + fCal;
    if (macroSum > 0) {
      const cp = Math.round((cCal / macroSum) * 100);
      const pp = Math.round((pCal / macroSum) * 100);
      const fp = Math.max(0, 100 - cp - pp);
      dom.plateBarCarbs.style.width = `${cp}%`;
      dom.plateBarProtein.style.width = `${pp}%`;
      dom.plateBarFat.style.width = `${fp}%`;
    } else {
      dom.plateBarCarbs.style.width = '33.3%';
      dom.plateBarProtein.style.width = '33.3%';
      dom.plateBarFat.style.width = '33.4%';
    }

    updateBadges();

    if (enriched.length === 0) {
      dom.plateMealsContainer.innerHTML = '';
      dom.plateEmpty.classList.remove('hidden');
      return;
    }

    dom.plateEmpty.classList.add('hidden');

    const sectionsHTML = MEAL_TYPES.map((meal) => {
      const items = enriched.filter((it) => it.meal === meal.id);
      if (items.length === 0) return '';
      const mealKcal = items.reduce((sum, it) => sum + it.nut.kcal, 0);

      const rowsHTML = items.map((it) => `
        <div class="plate-row">
          <div class="food-emoji-box">${it.food.emoji || '🍽️'}</div>
          <div class="food-info" ${it.existsInDb ? `data-open-food="${it.foodId}" style="cursor:pointer;"` : ''}>
            <div class="food-name">${escapeHTML(it.food.name)}</div>
            <div class="food-sub">${escapeHTML(it.label)}（${Math.round(it.grams)}g）· 蛋${it.nut.protein}g</div>
          </div>
          <div class="food-right">
            <div class="food-kcal-col">
              <div class="food-kcal-val">${it.nut.kcal}</div>
              <div class="food-kcal-unit">kcal</div>
            </div>
            <button class="plate-delete-btn" data-delete-plate="${it.uid}" aria-label="删除">✕</button>
          </div>
        </div>
      `).join('');

      return `
        <div class="meal-section">
          <div class="meal-section-header">
            <span>${meal.icon} ${meal.name}</span>
            <span>${mealKcal} kcal</span>
          </div>
          <div class="ios-inset-list">${rowsHTML}</div>
        </div>
      `;
    }).join('');

    dom.plateMealsContainer.innerHTML = sectionsHTML;
  }

  function updateBadges() {
    const validFavs = state.favorites.filter((id) => Boolean(getFoodById(id)));
    if (validFavs.length > 0) {
      dom.badgeFavorites.textContent = validFavs.length;
      dom.badgeFavorites.classList.remove('hidden');
    } else {
      dom.badgeFavorites.classList.add('hidden');
    }

    if (state.plateItems.length > 0) {
      dom.badgePlate.textContent = state.plateItems.length;
      dom.badgePlate.classList.remove('hidden');
    } else {
      dom.badgePlate.classList.add('hidden');
    }
  }

  function syncUnitToggleUI() {
    [dom.unitToggle, dom.favUnitToggle].forEach((container) => {
      container.querySelectorAll('.seg-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.mode === state.listUnitMode);
      });
    });
  }

  function switchTab(tabName) {
    state.activeTab = tabName;
    dom.tabItems.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    $$('.view').forEach((v) => v.classList.remove('active'));
    $(`#view-${tabName}`).classList.add('active');

    if (tabName === 'lookup') renderLookupList();
    if (tabName === 'favorites') renderFavoritesList();
    if (tabName === 'plate') renderPlate();
  }

  // ==================== 通用 Sheet 动画开关 ====================
  function showSheet(backdrop, sheet) {
    backdrop.classList.remove('hidden');
    sheet.classList.remove('hidden');
    requestAnimationFrame(() => {
      backdrop.classList.add('open');
      sheet.classList.add('open');
    });
  }

  function hideSheet(backdrop, sheet) {
    backdrop.classList.remove('open');
    sheet.classList.remove('open');
    setTimeout(() => {
      backdrop.classList.add('hidden');
      sheet.classList.add('hidden');
    }, 300);
  }

  // ==================== Sheet 1：食物详情 ====================
  function openFoodSheet(foodId) {
    const food = getFoodById(foodId);
    if (!food) return;

    state.sheet.food = food;
    state.sheet.mode = state.listUnitMode === '100g' ? 'gram' : 'unit';
    state.sheet.amount = state.sheet.mode === 'gram' ? 100 : 1;
    state.sheet.meal = getSmartDefaultMeal();

    const level = getCalorieLevel(food.kcal);
    dom.sheetEmoji.textContent = food.emoji;
    dom.sheetFoodName.textContent = food.name;
    dom.sheetLevelBadge.textContent = level.badgeText;
    dom.sheetLevelBadge.className = `level-badge ${level.key}`;
    dom.sheetCustomBadge.classList.toggle('hidden', !food.isCustom);
    dom.sheetEditBtn.classList.toggle('hidden', !food.isCustom);
    dom.sheetDeleteBtn.classList.toggle('hidden', !food.isCustom);
    dom.sheetBaseInfo.textContent = `${food.kcal} kcal / 100g`;
    dom.sheetModeUnitBtn.textContent = `${food.unitName} (${food.unitGrams}g)`;
    dom.sheetTip.textContent = food.tip || '自定义录入食物，建议结合包装营养成分表参考。';

    updateSheetFavUI();
    updateSheetModeUI();
    updateSheetMealUI();
    updateSheetCalculations();

    showSheet(dom.detailBackdrop, dom.detailSheet);
  }

  function closeFoodSheet() {
    hideSheet(dom.detailBackdrop, dom.detailSheet);
  }

  function updateSheetFavUI() {
    if (!state.sheet.food) return;
    const isFav = state.favorites.includes(state.sheet.food.id);
    dom.sheetFavBtn.textContent = isFav ? '❤️' : '🤍';
    dom.sheetFavBtn.setAttribute('aria-label', isFav ? '取消收藏' : '收藏食物');
  }

  function updateSheetModeUI() {
    const isUnit = state.sheet.mode === 'unit';
    dom.sheetModeToggle.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === state.sheet.mode);
    });

    dom.sheetAmountUnit.textContent = isUnit ? '份' : '克 (g)';
    dom.sheetAmountInput.step = isUnit ? '0.5' : '25';
    dom.sheetAmountInput.value = state.sheet.amount;

    const picks = isUnit
      ? [
          { label: '半份', val: 0.5 },
          { label: '1 份', val: 1 },
          { label: '1.5 份', val: 1.5 },
          { label: '2 份', val: 2 }
        ]
      : [
          { label: '50g', val: 50 },
          { label: '100g', val: 100 },
          { label: '150g', val: 150 },
          { label: '200g', val: 200 }
        ];

    dom.sheetQuickPicks.innerHTML = picks.map((p) => `
      <button class="quick-pick-btn ${Number(state.sheet.amount) === p.val ? 'active' : ''}" data-pick="${p.val}">
        ${p.label}
      </button>
    `).join('');
  }

  function updateSheetMealUI() {
    dom.sheetMealPicker.querySelectorAll('.meal-chip').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.meal === state.sheet.meal);
    });
  }

  function getSheetGrams() {
    const food = state.sheet.food;
    if (!food) return 0;
    const amt = Math.max(0, Number(state.sheet.amount) || 0);
    return state.sheet.mode === 'unit' ? amt * food.unitGrams : amt;
  }

  function updateSheetCalculations() {
    const food = state.sheet.food;
    if (!food) return;
    const grams = getSheetGrams();
    const nut = calcNutrition(food, grams);

    dom.sheetCalcKcal.textContent = nut.kcal;
    dom.sheetAddKcal.textContent = nut.kcal;

    if (state.sheet.mode === 'unit') {
      dom.sheetCalcWeight.textContent = `${state.sheet.amount} × ${food.unitName}（约 ${Math.round(grams)}g）`;
    } else {
      const equiv = (grams / food.unitGrams).toFixed(1);
      dom.sheetCalcWeight.textContent = `${Math.round(grams)}g（约 ${equiv} × ${food.unitName}）`;
    }

    dom.sheetCarbs.textContent = `${nut.carbs}g`;
    dom.sheetProtein.textContent = `${nut.protein}g`;
    dom.sheetFat.textContent = `${nut.fat}g`;

    dom.sheetCarbsPct.textContent = `${nut.carbsPct}%`;
    dom.sheetProteinPct.textContent = `${nut.proteinPct}%`;
    dom.sheetFatPct.textContent = `${nut.fatPct}%`;

    dom.sheetBarCarbs.style.width = `${nut.carbsPct}%`;
    dom.sheetBarProtein.style.width = `${nut.proteinPct}%`;
    dom.sheetBarFat.style.width = `${nut.fatPct}%`;

    dom.sheetQuickPicks.querySelectorAll('.quick-pick-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.pick) === Number(state.sheet.amount));
    });
  }

  // ==================== Sheet 2：添加 / 编辑自定义食物 ====================
  function initCustomFoodFormOptions() {
    dom.cfCategory.innerHTML = FOOD_CATEGORIES
      .filter((c) => c.id !== 'all')
      .map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`)
      .join('');

    renderEmojiPicker();
  }

  function renderEmojiPicker() {
    dom.cfEmojiPicker.innerHTML = CUSTOM_EMOJIS.map((em) => `
      <button type="button" class="emoji-opt ${state.customFormEmoji === em ? 'active' : ''}" data-emoji="${em}">${em}</button>
    `).join('');
  }

  function openCustomFoodSheet(prefill = {}) {
    const isEdit = Boolean(prefill.id);
    dom.customSheetTitle.textContent = isEdit ? '编辑自定义食物' : '补充未知食物';
    dom.cfSubmitBtn.textContent = isEdit ? '保存修改' : '保存到我的食物库';

    dom.cfId.value = prefill.id || '';
    state.customFormEmoji = prefill.emoji || '🍱';
    renderEmojiPicker();

    dom.cfName.value = prefill.name || '';
    dom.cfCategory.value = prefill.category && prefill.category !== 'all' ? prefill.category : 'dish';
    dom.cfKcal.value = prefill.kcal !== undefined && prefill.kcal !== null ? prefill.kcal : '';
    dom.cfCarbs.value = prefill.carbs !== undefined && prefill.carbs !== null ? prefill.carbs : '';
    dom.cfProtein.value = prefill.protein !== undefined && prefill.protein !== null ? prefill.protein : '';
    dom.cfFat.value = prefill.fat !== undefined && prefill.fat !== null ? prefill.fat : '';
    dom.cfUnitName.value = prefill.unitName || '1份';
    dom.cfUnitGrams.value = prefill.unitGrams || 100;
    dom.cfTip.value = prefill.tip || '';

    showSheet(dom.customBackdrop, dom.customSheet);
    if (!isEdit && !prefill.name) {
      setTimeout(() => dom.cfName.focus(), 320);
    }
  }

  function closeCustomFoodSheet() {
    hideSheet(dom.customBackdrop, dom.customSheet);
  }

  function handleSaveCustomFood(e) {
    e.preventDefault();
    const name = dom.cfName.value.trim();
    const kcal = parseFloat(dom.cfKcal.value);
    if (!name) {
      showToast('请输入食物名称');
      return;
    }
    if (isNaN(kcal) || kcal < 0) {
      showToast('请输入有效的热量数值');
      return;
    }

    const carbs = Math.max(0, parseFloat(dom.cfCarbs.value) || 0);
    const protein = Math.max(0, parseFloat(dom.cfProtein.value) || 0);
    const fat = Math.max(0, parseFloat(dom.cfFat.value) || 0);
    const unitName = dom.cfUnitName.value.trim() || '1份';
    const unitGrams = Math.max(1, Math.round(parseFloat(dom.cfUnitGrams.value) || 100));
    const tip = dom.cfTip.value.trim() || '自定义录入食物，可根据实际份量灵活换算。';
    const category = dom.cfCategory.value || 'dish';

    const editId = dom.cfId.value;
    if (editId) {
      const idx = state.customFoods.findIndex((x) => x.id === editId);
      if (idx >= 0) {
        state.customFoods[idx] = {
          ...state.customFoods[idx],
          name,
          category,
          emoji: state.customFormEmoji,
          kcal: Math.round(kcal),
          carbs: +carbs.toFixed(1),
          protein: +protein.toFixed(1),
          fat: +fat.toFixed(1),
          unitName,
          unitGrams,
          tip
        };
      }
      saveCustomFoods();
      closeCustomFoodSheet();
      renderLookupList();
      renderFavoritesList();
      renderPlate();
      showToast(`✓ 已更新「${name}」`);
    } else {
      const newFood = {
        id: `custom_${Date.now()}`,
        name,
        alias: `自定义 ${name}`,
        category,
        emoji: state.customFormEmoji,
        kcal: Math.round(kcal),
        carbs: +carbs.toFixed(1),
        protein: +protein.toFixed(1),
        fat: +fat.toFixed(1),
        unitName,
        unitGrams,
        tip,
        isCustom: true
      };
      state.customFoods.unshift(newFood);
      saveCustomFoods();
      closeCustomFoodSheet();

      // 若当前在筛选无结果状态，切回全部方便用户看到新食物
      if (state.searchQuery.trim()) {
        state.searchQuery = '';
        dom.searchInput.value = '';
        dom.searchClear.classList.add('hidden');
      }
      state.category = 'all';
      state.levelFilter = 'all';
      dom.levelFilters.querySelectorAll('.level-chip').forEach((b) =>
        b.classList.toggle('active', b.dataset.level === 'all')
      );
      renderCategories();
      renderLookupList();
      showToast(`🎉 已收录「${name}」到我的食物库`);
    }
  }

  function deleteCustomFood(foodId) {
    const food = getFoodById(foodId);
    if (!food || !food.isCustom) return;

    openModal({
      title: `删除「${food.name}」？`,
      html: '<p style="margin:0;text-align:center;">删除后将从我的食物库和收藏夹移除（已记录到今日餐盘的历史条目不受影响）。</p>',
      actions: [
        { text: '取消', cls: 'cancel' },
        {
          text: '确认删除',
          cls: 'danger',
          onClick: () => {
            state.customFoods = state.customFoods.filter((x) => x.id !== foodId);
            state.favorites = state.favorites.filter((id) => id !== foodId);
            saveCustomFoods();
            saveFavorites();
            closeFoodSheet();
            renderLookupList();
            renderFavoritesList();
            renderPlate();
            showToast(`已删除「${food.name}」`);
          }
        }
      ]
    });
  }

  // ==================== Sheet 3：📷 拍照识别食物 ====================
  function syncAIConfigUI() {
    const cfg = state.aiConfig;
    dom.aiProvider.value = cfg.provider || 'gemini';
    dom.aiBaseUrl.value = cfg.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    dom.aiModel.value = cfg.model || 'qwen-vl-plus';
    dom.aiApiKey.value = cfg.apiKey || '';
    dom.aiOpenAIFields.classList.toggle('hidden', cfg.provider !== 'openai');

    if (cfg.apiKey) {
      dom.aiStatusPill.textContent = cfg.provider === 'gemini'
        ? '已连接 Gemini 视觉识别'
        : `已连接 ${cfg.model || 'OpenAI 兼容模型'}`;
      dom.cameraNoKeyTip.classList.add('hidden');
    } else {
      dom.aiStatusPill.textContent = '点右上角 ⚙️ 填入 API Key 即可自动识图';
      dom.cameraNoKeyTip.classList.remove('hidden');
    }
  }

  function openCameraSheet() {
    syncAIConfigUI();
    dom.cameraErrorBox.classList.add('hidden');
    showSheet(dom.cameraBackdrop, dom.cameraSheet);
  }

  function closeCameraSheet() {
    hideSheet(dom.cameraBackdrop, dom.cameraSheet);
  }

  function compressImageToBase64(file, maxSide = 1024, quality = 0.78) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.onload = (ev) => {
        const img = new Image();
        img.onerror = () => reject(new Error('图片解析失败'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxSide || height > maxSide) {
            if (width > height) {
              height = Math.round((height * maxSide) / width);
              width = maxSide;
            } else {
              width = Math.round((width * maxSide) / height);
              height = maxSide;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64 = dataUrl.split(',')[1];
          resolve({ dataUrl, base64, mimeType: 'image/jpeg' });
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  const AI_FOOD_PROMPT = `你是一位专业的中国注册营养师。请仔细识别图片中的食物（如果有多种，按最主要的一道菜或整份餐食综合估算），并严格只返回一个 JSON 对象（不要任何多余解释文字），格式如下：
{
  "name": "食物中文名称（简洁准确，如：番茄炒蛋盖饭）",
  "emoji": "最贴合的单个食物emoji",
  "category": "从以下8个ID中选一个最匹配的: staple, protein, veggie, fruit, dairy, dish, fastfood, snack",
  "kcalPer100g": 150,
  "carbsPer100g": 18.0,
  "proteinPer100g": 8.5,
  "fatPer100g": 5.2,
  "portionName": "图中估算份量名称，如：1碗 / 1盘 / 1杯 / 1个",
  "portionGrams": 300,
  "tip": "一句简短实用的减脂控卡点评（35字以内）"
}
注意：所有数值必须为数字类型，且符合中国常见食物营养成分常识。如果图片不是食物，请返回 {"error": "未在图片中识别到明显食物，请重新拍摄食物正面清晰照片"}。`;

  function parseAIJsonText(text) {
    const cleaned = String(text || '')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new Error('模型返回格式异常，请重试');
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  async function callVisionModel(base64, mimeType) {
    const { provider, apiKey, baseUrl, model } = state.aiConfig;
    if (!apiKey) {
      throw new Error('请先点击右上角 ⚙️ 配置你的 AI API Key');
    }

    if (provider === 'gemini') {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: AI_FOOD_PROMPT },
              { inline_data: { mime_type: mimeType, data: base64 } }
            ]
          }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || `Gemini API 错误 (${res.status})`);
      }
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return parseAIJsonText(text);
    } else {
      const cleanBase = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const endpoint = `${cleanBase}/chat/completions`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          temperature: 0.2,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: AI_FOOD_PROMPT },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
            ]
          }]
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || `接口请求失败 (${res.status})`);
      }
      const text = data?.choices?.[0]?.message?.content;
      return parseAIJsonText(text);
    }
  }

  function findSimilarLocalFoods(name) {
    if (!name) return [];
    const chars = name.replace(/[（）()、，,\s]/g, '').split('');
    const scored = getAllFoods().map((item) => {
      let score = 0;
      const target = `${item.name} ${item.alias || ''}`.toLowerCase();
      if (target.includes(name.toLowerCase())) score += 10;
      for (const ch of chars) {
        if (ch.length && target.includes(ch.toLowerCase())) score += 1;
      }
      return { item, score };
    }).filter((x) => x.score >= 2);

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 3).map((x) => x.item);
  }

  function renderAIResult(result) {
    state.lastAIResult = result;
    const kcal100 = Math.max(0, Math.round(Number(result.kcalPer100g) || 0));
    const carbs100 = Math.max(0, +(Number(result.carbsPer100g) || 0).toFixed(1));
    const protein100 = Math.max(0, +(Number(result.proteinPer100g) || 0).toFixed(1));
    const fat100 = Math.max(0, +(Number(result.fatPer100g) || 0).toFixed(1));
    const grams = Math.max(10, Math.round(Number(result.portionGrams) || 100));
    const portionName = result.portionName || '1份';

    const nut = calcNutrition(
      { kcal: kcal100, carbs: carbs100, protein: protein100, fat: fat100 },
      grams
    );
    const level = getCalorieLevel(kcal100);

    dom.aiResEmoji.textContent = result.emoji || '🍽️';
    dom.aiResName.textContent = result.name || '未知食物';
    dom.aiResLevel.textContent = level.badgeText;
    dom.aiResLevel.className = `level-badge ${level.key}`;
    dom.aiResPortion.textContent = `${portionName}（约 ${grams}g · ${kcal100} kcal/100g）`;
    dom.aiResTotalKcal.textContent = nut.kcal;
    dom.aiResCarbs.textContent = `${nut.carbs}g`;
    dom.aiResProtein.textContent = `${nut.protein}g`;
    dom.aiResFat.textContent = `${nut.fat}g`;
    dom.aiResTip.textContent = result.tip || 'AI 视觉估算仅供参考，实际热量受烹调油量和份量影响。';

    const matches = findSimilarLocalFoods(result.name);
    if (matches.length > 0) {
      dom.aiLocalMatchesList.innerHTML = matches.map(createFoodRowHTML).join('');
      dom.aiLocalMatches.classList.remove('hidden');
    } else {
      dom.aiLocalMatches.classList.add('hidden');
    }

    dom.cameraResultCard.classList.remove('hidden');
  }

  async function handleImageSelected(file) {
    if (!file) return;
    dom.cameraErrorBox.classList.add('hidden');
    dom.cameraResultCard.classList.add('hidden');

    try {
      const { dataUrl, base64, mimeType } = await compressImageToBase64(file);
      dom.cameraPreviewImg.src = dataUrl;
      dom.cameraPreviewWrap.classList.remove('hidden');

      if (!state.aiConfig.apiKey) {
        dom.cameraNoKeyTip.classList.remove('hidden');
        dom.aiConfigPanel.classList.remove('hidden');
        showToast('请先配置 AI Key 再进行自动识别');
        return;
      }

      dom.cameraScanningOverlay.classList.remove('hidden');
      const result = await callVisionModel(base64, mimeType);
      dom.cameraScanningOverlay.classList.add('hidden');

      if (result.error) {
        dom.cameraErrorBox.textContent = `⚠️ ${result.error}`;
        dom.cameraErrorBox.classList.remove('hidden');
        return;
      }

      renderAIResult(result);
    } catch (err) {
      dom.cameraScanningOverlay.classList.add('hidden');
      dom.cameraErrorBox.textContent = `⚠️ 识别失败：${err.message || '请检查网络或 API Key 配置'}`;
      dom.cameraErrorBox.classList.remove('hidden');
    }
  }

  // ==================== 收藏与餐盘操作 ====================
  function toggleFavorite(foodId) {
    const idx = state.favorites.indexOf(foodId);
    const food = getFoodById(foodId);
    if (idx >= 0) {
      state.favorites.splice(idx, 1);
      showToast(`已取消收藏 ${food ? food.name : ''}`);
    } else {
      state.favorites.unshift(foodId);
      showToast(`❤️ 已收藏 ${food ? food.name : ''}`);
    }
    saveFavorites();
    updateSheetFavUI();
    renderLookupList();
    renderFavoritesList();
  }

  function addToPlate(foodId, grams, label, meal, customSnapshot = null) {
    const food = customSnapshot || getFoodById(foodId);
    if (!food || grams <= 0) return;

    const nut = calcNutrition(food, grams);
    state.plateItems.push({
      uid: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      foodId,
      meal: meal || getSmartDefaultMeal(),
      grams,
      label,
      snapshot: {
        name: food.name,
        emoji: food.emoji || '🍽️',
        kcal: food.kcal,
        carbs: food.carbs,
        protein: food.protein,
        fat: food.fat
      },
      addedAt: Date.now()
    });
    savePlate();
    renderPlate();

    const mealObj = MEAL_TYPES.find((m) => m.id === (meal || getSmartDefaultMeal()));
    showToast(`✓ 已加入${mealObj ? mealObj.name : '餐盘'} · +${nut.kcal} kcal`);
  }

  function quickAddFood(foodId) {
    const food = getFoodById(foodId);
    if (!food) return;
    const isUnit = state.listUnitMode === 'unit';
    const grams = isUnit ? food.unitGrams : 100;
    const label = isUnit ? food.unitName : '100g';
    addToPlate(foodId, grams, label, getSmartDefaultMeal());
  }

  function removeFromPlate(uid) {
    state.plateItems = state.plateItems.filter((it) => it.uid !== uid);
    savePlate();
    renderPlate();
    showToast('已从今日餐盘移除');
  }

  // ==================== 通用 iOS Modal ====================
  function openModal({ title, html, actions }) {
    dom.modalTitle.textContent = title;
    dom.modalContent.innerHTML = html;
    dom.modalActions.innerHTML = actions.map((act, idx) => `
      <button class="modal-btn ${act.cls || ''}" data-modal-act="${idx}">${act.text}</button>
    `).join('');

    dom.modalActions.querySelectorAll('.modal-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.modalAct);
        const keepOpen = actions[idx].onClick && actions[idx].onClick() === false;
        if (!keepOpen) closeModal();
      });
    });

    dom.modalBackdrop.classList.remove('hidden');
  }

  function closeModal() {
    dom.modalBackdrop.classList.add('hidden');
  }

  function showLegendModal() {
    openModal({
      title: '🚦 热量红绿灯分级标准',
      html: `
        <div class="legend-item">
          <span>🟢</span>
          <div><strong>绿灯低卡（≤100 kcal / 100g）</strong><br/>如大部分蔬菜、低糖水果、虾仁、脱脂奶等，饱腹低负担，推荐常吃。</div>
        </div>
        <div class="legend-item">
          <span>🟡</span>
          <div><strong>黄灯适中（101 ~ 250 kcal / 100g）</strong><br/>如米饭、鸡胸肉、鸡蛋、瘦牛肉、家常菜等，日常核心营养，注意均衡份量。</div>
        </div>
        <div class="legend-item" style="margin-bottom:0;">
          <span>🔴</span>
          <div><strong>红灯高卡（>250 kcal / 100g）</strong><br/>如坚果、油炸零食、五花肉、蛋糕等能量密度高，建议严格控量浅尝。</div>
        </div>
      `,
      actions: [{ text: '知道了' }]
    });
  }

  function showGoalModal() {
    const presets = [
      { label: '减脂 1400', val: 1400 },
      { label: '轻减 1600', val: 1600 },
      { label: '标准 1800', val: 1800 },
      { label: '维持 2000', val: 2000 },
      { label: '增肌 2300', val: 2300 },
      { label: '高耗 2600', val: 2600 }
    ];

    openModal({
      title: '🎯 设置每日目标热量',
      html: `
        <p style="margin:0 0 8px;text-align:center;">选择推荐方案或输入自定义热量（kcal）</p>
        <div class="goal-presets">
          ${presets.map((p) => `
            <button type="button" class="goal-preset-btn ${state.dailyGoal === p.val ? 'active' : ''}" data-goal-preset="${p.val}">
              ${p.label}
            </button>
          `).join('')}
        </div>
        <input id="goal-custom-input" class="goal-input" type="number" inputmode="numeric" min="800" max="5000" step="50" value="${state.dailyGoal}" />
      `,
      actions: [
        { text: '取消', cls: 'cancel' },
        {
          text: '保存',
          onClick: () => {
            const val = Math.round(Number($('#goal-custom-input').value));
            if (!val || val < 500 || val > 8000) {
              showToast('请输入 500 ~ 8000 之间的目标值');
              return false;
            }
            state.dailyGoal = val;
            saveGoal();
            renderPlate();
            showToast(`🎯 每日目标已更新为 ${val} kcal`);
          }
        }
      ]
    });

    dom.modalContent.querySelectorAll('[data-goal-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = Number(btn.dataset.goalPreset);
        $('#goal-custom-input').value = val;
        dom.modalContent.querySelectorAll('[data-goal-preset]').forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
      });
    });
  }

  function showClearPlateConfirm() {
    if (state.plateItems.length === 0) {
      showToast('今日餐盘已经是空的啦');
      return;
    }
    openModal({
      title: '清空今日餐盘？',
      html: '<p style="margin:0;text-align:center;">将移除今天已记录的全部食物，此操作不可撤销。</p>',
      actions: [
        { text: '取消', cls: 'cancel' },
        {
          text: '确认清空',
          cls: 'danger',
          onClick: () => {
            state.plateItems = [];
            savePlate();
            renderPlate();
            showToast('已清空今日餐盘');
          }
        }
      ]
    });
  }

  // ==================== 事件绑定 ====================
  function bindEvents() {
    dom.btnTheme.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    dom.btnLegend.addEventListener('click', showLegendModal);

    // 搜索框
    dom.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      dom.searchClear.classList.toggle('hidden', !state.searchQuery);
      renderLookupList();
    });

    dom.searchClear.addEventListener('click', () => {
      state.searchQuery = '';
      dom.searchInput.value = '';
      dom.searchClear.classList.add('hidden');
      dom.searchInput.focus();
      renderLookupList();
    });

    // 添加未知食物入口
    dom.btnAddCustom.addEventListener('click', () => {
      openCustomFoodSheet({ name: state.searchQuery.trim() });
    });

    dom.btnEmptyAddCustom.addEventListener('click', () => {
      openCustomFoodSheet({ name: state.searchQuery.trim() });
    });

    // 拍照识别入口
    dom.btnOpenCamera.addEventListener('click', openCameraSheet);
    dom.btnEmptyCamera.addEventListener('click', openCameraSheet);
    dom.btnPlateCamera.addEventListener('click', openCameraSheet);

    // 分类筛选
    dom.categoryTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.cat-chip');
      if (!btn) return;
      state.category = btn.dataset.cat;
      renderCategories();
      renderLookupList();
    });

    // 红绿灯筛选
    dom.levelFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.level-chip');
      if (!btn) return;
      state.levelFilter = btn.dataset.level;
      dom.levelFilters.querySelectorAll('.level-chip').forEach((b) =>
        b.classList.toggle('active', b === btn)
      );
      renderLookupList();
    });

    // 重置筛选
    dom.btnResetFilters.addEventListener('click', () => {
      state.category = 'all';
      state.levelFilter = 'all';
      state.searchQuery = '';
      dom.searchInput.value = '';
      dom.searchClear.classList.add('hidden');
      dom.levelFilters.querySelectorAll('.level-chip').forEach((b) =>
        b.classList.toggle('active', b.dataset.level === 'all')
      );
      renderCategories();
      renderLookupList();
    });

    // 单位切换
    [dom.unitToggle, dom.favUnitToggle].forEach((el) => {
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('.seg-btn');
        if (!btn) return;
        state.listUnitMode = btn.dataset.mode;
        syncUnitToggleUI();
        renderLookupList();
        renderFavoritesList();
      });
    });

    // 列表点击（含 AI 本地相似列表）
    [dom.foodList, dom.favoritesList, dom.aiLocalMatchesList].forEach((listEl) => {
      listEl.addEventListener('click', (e) => {
        const quickBtn = e.target.closest('[data-quick-add]');
        if (quickBtn) {
          e.stopPropagation();
          quickAddFood(quickBtn.dataset.quickAdd);
          return;
        }
        const row = e.target.closest('.food-row');
        if (row) {
          if (listEl === dom.aiLocalMatchesList) closeCameraSheet();
          openFoodSheet(row.dataset.foodId);
        }
      });
    });

    dom.btnGoLookup.addEventListener('click', () => switchTab('lookup'));
    dom.btnPlateGoLookup.addEventListener('click', () => switchTab('lookup'));

    dom.tabItems.forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // 餐盘页
    dom.btnEditGoal.addEventListener('click', showGoalModal);
    dom.summaryGoalBtn.addEventListener('click', showGoalModal);
    dom.btnClearPlate.addEventListener('click', showClearPlateConfirm);

    dom.plateMealsContainer.addEventListener('click', (e) => {
      const delBtn = e.target.closest('[data-delete-plate]');
      if (delBtn) {
        removeFromPlate(delBtn.dataset.deletePlate);
        return;
      }
      const openInfo = e.target.closest('[data-open-food]');
      if (openInfo) {
        openFoodSheet(openInfo.dataset.openFood);
      }
    });

    // Sheet 1：详情页
    dom.detailBackdrop.addEventListener('click', closeFoodSheet);
    dom.sheetCloseBtn.addEventListener('click', closeFoodSheet);
    dom.sheetGrabber.addEventListener('click', closeFoodSheet);

    dom.sheetFavBtn.addEventListener('click', () => {
      if (state.sheet.food) toggleFavorite(state.sheet.food.id);
    });

    dom.sheetEditBtn.addEventListener('click', () => {
      if (state.sheet.food && state.sheet.food.isCustom) {
        const food = state.sheet.food;
        closeFoodSheet();
        setTimeout(() => openCustomFoodSheet(food), 220);
      }
    });

    dom.sheetDeleteBtn.addEventListener('click', () => {
      if (state.sheet.food && state.sheet.food.isCustom) {
        deleteCustomFood(state.sheet.food.id);
      }
    });

    dom.sheetModeToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn || btn.dataset.mode === state.sheet.mode) return;
      state.sheet.mode = btn.dataset.mode;
      state.sheet.amount = state.sheet.mode === 'unit' ? 1 : 100;
      updateSheetModeUI();
      updateSheetCalculations();
    });

    dom.btnStepMinus.addEventListener('click', () => {
      const step = state.sheet.mode === 'unit' ? 0.5 : 25;
      const min = state.sheet.mode === 'unit' ? 0.5 : 10;
      state.sheet.amount = Math.max(min, +(Number(state.sheet.amount) - step).toFixed(1));
      dom.sheetAmountInput.value = state.sheet.amount;
      updateSheetCalculations();
    });

    dom.btnStepPlus.addEventListener('click', () => {
      const step = state.sheet.mode === 'unit' ? 0.5 : 25;
      state.sheet.amount = +(Number(state.sheet.amount) + step).toFixed(1);
      dom.sheetAmountInput.value = state.sheet.amount;
      updateSheetCalculations();
    });

    dom.sheetAmountInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      state.sheet.amount = isNaN(val) ? 0 : Math.max(0, val);
      updateSheetCalculations();
    });

    dom.sheetQuickPicks.addEventListener('click', (e) => {
      const btn = e.target.closest('.quick-pick-btn');
      if (!btn) return;
      state.sheet.amount = Number(btn.dataset.pick);
      dom.sheetAmountInput.value = state.sheet.amount;
      updateSheetCalculations();
    });

    dom.sheetMealPicker.addEventListener('click', (e) => {
      const btn = e.target.closest('.meal-chip');
      if (!btn) return;
      state.sheet.meal = btn.dataset.meal;
      updateSheetMealUI();
    });

    dom.sheetAddPlateBtn.addEventListener('click', () => {
      const food = state.sheet.food;
      const grams = getSheetGrams();
      if (!food || grams <= 0) {
        showToast('请输入大于 0 的份量');
        return;
      }
      const label = state.sheet.mode === 'unit'
        ? `${state.sheet.amount} × ${food.unitName}`
        : `${Math.round(grams)}g`;
      addToPlate(food.id, grams, label, state.sheet.meal);
      closeFoodSheet();
    });

    // Sheet 2：自定义食物表单
    dom.customBackdrop.addEventListener('click', closeCustomFoodSheet);
    dom.customCloseBtn.addEventListener('click', closeCustomFoodSheet);
    dom.customGrabber.addEventListener('click', closeCustomFoodSheet);

    dom.cfEmojiPicker.addEventListener('click', (e) => {
      const btn = e.target.closest('.emoji-opt');
      if (!btn) return;
      state.customFormEmoji = btn.dataset.emoji;
      renderEmojiPicker();
    });

    dom.customFoodForm.addEventListener('submit', handleSaveCustomFood);

    // Sheet 3：拍照识别
    dom.cameraBackdrop.addEventListener('click', closeCameraSheet);
    dom.cameraCloseBtn.addEventListener('click', closeCameraSheet);
    dom.cameraGrabber.addEventListener('click', closeCameraSheet);

    dom.btnToggleAIConfig.addEventListener('click', () => {
      dom.aiConfigPanel.classList.toggle('hidden');
    });

    dom.aiProvider.addEventListener('change', (e) => {
      dom.aiOpenAIFields.classList.toggle('hidden', e.target.value !== 'openai');
    });

    dom.btnSaveAIConfig.addEventListener('click', () => {
      state.aiConfig = {
        provider: dom.aiProvider.value,
        apiKey: dom.aiApiKey.value.trim(),
        baseUrl: dom.aiBaseUrl.value.trim() || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: dom.aiModel.value.trim() || 'qwen-vl-plus'
      };
      saveAIConfig();
      syncAIConfigUI();
      dom.aiConfigPanel.classList.add('hidden');
      showToast('✓ AI 识别配置已保存到本机');
    });

    dom.btnTakePhoto.addEventListener('click', () => {
      dom.cameraCaptureInput.value = '';
      dom.cameraCaptureInput.click();
    });

    dom.btnPickGallery.addEventListener('click', () => {
      dom.cameraGalleryInput.value = '';
      dom.cameraGalleryInput.click();
    });

    dom.cameraCaptureInput.addEventListener('change', (e) => {
      handleImageSelected(e.target.files[0]);
    });

    dom.cameraGalleryInput.addEventListener('change', (e) => {
      handleImageSelected(e.target.files[0]);
    });

    dom.btnAIAddPlate.addEventListener('click', () => {
      const r = state.lastAIResult;
      if (!r) return;
      const grams = Math.max(10, Math.round(Number(r.portionGrams) || 100));
      const snapshot = {
        name: r.name || '拍照识别食物',
        emoji: r.emoji || '📷',
        kcal: Math.max(0, Math.round(Number(r.kcalPer100g) || 0)),
        carbs: Math.max(0, +(Number(r.carbsPer100g) || 0).toFixed(1)),
        protein: Math.max(0, +(Number(r.proteinPer100g) || 0).toFixed(1)),
        fat: Math.max(0, +(Number(r.fatPer100g) || 0).toFixed(1))
      };
      addToPlate(`ai_${Date.now()}`, grams, r.portionName || '1份', getSmartDefaultMeal(), snapshot);
      closeCameraSheet();
    });

    dom.btnAISaveCustom.addEventListener('click', () => {
      const r = state.lastAIResult;
      if (!r) return;
      closeCameraSheet();
      setTimeout(() => {
        openCustomFoodSheet({
          name: r.name || '',
          emoji: r.emoji || '🍽️',
          category: r.category || 'dish',
          kcal: Math.round(Number(r.kcalPer100g) || 0),
          carbs: +(Number(r.carbsPer100g) || 0).toFixed(1),
          protein: +(Number(r.proteinPer100g) || 0).toFixed(1),
          fat: +(Number(r.fatPer100g) || 0).toFixed(1),
          unitName: r.portionName || '1份',
          unitGrams: Math.round(Number(r.portionGrams) || 100),
          tip: r.tip || ''
        });
      }, 240);
    });

    // Modal
    dom.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === dom.modalBackdrop) closeModal();
    });

    dom.closeInstallBanner.addEventListener('click', () => {
      dom.installBanner.classList.add('hidden');
      localStorage.setItem(STORAGE_KEYS.INSTALL_DISMISSED, '1');
    });
  }

  // ==================== PWA & iOS Safari 安装提示 ====================
  function initPWA() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    const isNativeWrapper = Boolean(window.__IOS_NATIVE_APP__) || location.protocol === 'file:';
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    const dismissed = localStorage.getItem(STORAGE_KEYS.INSTALL_DISMISSED) === '1';

    if (isIOS && !isStandalone && !isNativeWrapper && !dismissed) {
      dom.installBanner.classList.remove('hidden');
    }
  }

  // ==================== 启动初始化 ====================
  function init() {
    initTheme();
    initPWA();
    initCustomFoodFormOptions();
    renderCategories();
    syncUnitToggleUI();
    renderLookupList();
    renderFavoritesList();
    renderPlate();
    bindEvents();
  }

  init();
})();
