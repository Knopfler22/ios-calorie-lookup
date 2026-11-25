(() => {
  'use strict';

  // ==================== 持久化 Key ====================
  const APP_VERSION = 'v1.8.1';
  const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';
  const GEMINI_FALLBACK_MODELS = [
    'gemini-4-hydrogen',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash'
  ];
  const DEPRECATED_GEMINI_MODELS = new Set([
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-pro'
  ]);
  const STORAGE_KEYS = {
    FAVORITES: 'ios_cal_favorites_v1',
    CUSTOM_FOODS: 'ios_cal_custom_foods_v1',
    HIDDEN_FOODS: 'ios_cal_hidden_foods_v1',
    CATEGORY_OVERRIDES: 'ios_cal_cat_overrides_v1',
    PLATE: 'ios_cal_plate_v1',
    PLATE_DATE: 'ios_cal_plate_date_v1',
    PLATE_HISTORY: 'ios_cal_plate_history_v1',
    GOAL: 'ios_cal_goal_v1',
    PROTEIN_GOAL: 'ios_cal_protein_goal_v1',
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

  function shiftDateStr(dateStr, deltaDays) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + deltaDays);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  function formatDateDisplay(dateStr) {
    const today = getTodayStr();
    const yesterday = shiftDateStr(today, -1);
    const dayBefore = shiftDateStr(today, -2);
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const md = `${m}月${d}日`;
    if (dateStr === today) return `今天 · ${md}`;
    if (dateStr === yesterday) return `昨天 · ${md}`;
    if (dateStr === dayBefore) return `前天 · ${md}`;
    return `${md} ${weekNames[dt.getDay()]}`;
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

  // 加载按日期分桶的餐盘历史，并自动无损迁移旧版单日数据
  function loadPlateHistory() {
    const history = loadJSON(STORAGE_KEYS.PLATE_HISTORY, {});
    const legacyPlate = loadJSON(STORAGE_KEYS.PLATE, null);
    if (Array.isArray(legacyPlate) && legacyPlate.length > 0) {
      const legacyDate = localStorage.getItem(STORAGE_KEYS.PLATE_DATE) || getTodayStr();
      if (!Array.isArray(history[legacyDate]) || history[legacyDate].length === 0) {
        history[legacyDate] = legacyPlate;
        localStorage.setItem(STORAGE_KEYS.PLATE_HISTORY, JSON.stringify(history));
      }
      localStorage.removeItem(STORAGE_KEYS.PLATE);
    }
    return history;
  }

  // ==================== 应用状态 ====================
  const state = {
    activeTab: 'lookup',
    category: 'all',
    levelFilter: 'all',
    searchQuery: '',
    listUnitMode: '100g', // '100g' | 'unit'
    customFoods: loadJSON(STORAGE_KEYS.CUSTOM_FOODS, []),
    hiddenFoodIds: loadJSON(STORAGE_KEYS.HIDDEN_FOODS, []),
    categoryOverrides: loadJSON(STORAGE_KEYS.CATEGORY_OVERRIDES, {}),
    batchMode: false,
    selectedFoodIds: new Set(),
    favorites: loadJSON(STORAGE_KEYS.FAVORITES, ['egg', 'chicken-breast', 'rice', 'milk-tea']),
    plateHistory: loadPlateHistory(),
    plateDate: getTodayStr(),
    dailyGoal: Number(localStorage.getItem(STORAGE_KEYS.GOAL)) || 1800,
    proteinGoal: Number(localStorage.getItem(STORAGE_KEYS.PROTEIN_GOAL)) || 100,
    aiConfig: loadJSON(STORAGE_KEYS.AI_CONFIG, {
      provider: 'gemini',
      geminiModel: DEFAULT_GEMINI_MODEL,
      apiKey: '',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-vl-plus'
    }),
    sheet: {
      food: null,
      mode: 'unit',
      amount: 1,
      meal: getSmartDefaultMeal(),
      editingPlateUid: null
    },
    customFormEmoji: '🍱',
    lastAIResult: null,
    lastImagePayload: null,
    recipeDraft: [],
    textImport: { mode: 'recipe', recipeName: '', items: [] },
    customFoodCallback: null
  };

  function getPlateItemsForDate(dateStr) {
    return Array.isArray(state.plateHistory[dateStr]) ? state.plateHistory[dateStr] : [];
  }

  function getCurrentPlateItems() {
    return getPlateItemsForDate(state.plateDate);
  }

  function setPlateItemsForDate(dateStr, items) {
    if (items.length === 0) {
      delete state.plateHistory[dateStr];
    } else {
      state.plateHistory[dateStr] = items;
    }
    savePlate();
  }

  function saveCustomFoods() {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_FOODS, JSON.stringify(state.customFoods));
  }

  function saveHiddenFoods() {
    localStorage.setItem(STORAGE_KEYS.HIDDEN_FOODS, JSON.stringify(state.hiddenFoodIds));
  }

  function saveCategoryOverrides() {
    localStorage.setItem(STORAGE_KEYS.CATEGORY_OVERRIDES, JSON.stringify(state.categoryOverrides));
  }

  function saveFavorites() {
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(state.favorites));
  }

  function savePlate() {
    localStorage.setItem(STORAGE_KEYS.PLATE_HISTORY, JSON.stringify(state.plateHistory));
  }

  function saveGoal() {
    localStorage.setItem(STORAGE_KEYS.GOAL, String(state.dailyGoal));
    localStorage.setItem(STORAGE_KEYS.PROTEIN_GOAL, String(state.proteinGoal));
  }

  function saveAIConfig() {
    localStorage.setItem(STORAGE_KEYS.AI_CONFIG, JSON.stringify(state.aiConfig));
  }

  function getAllFoods() {
    const hiddenSet = new Set(state.hiddenFoodIds);
    const overrides = state.categoryOverrides || {};
    const builtIns = FOOD_DATABASE
      .filter((x) => !hiddenSet.has(x.id))
      .map((x) => (overrides[x.id] ? { ...x, category: overrides[x.id] } : x));
    return [...state.customFoods, ...builtIns];
  }

  function getFoodById(id) {
    const custom = state.customFoods.find((x) => x.id === id);
    if (custom) return custom;
    const base = FOOD_DATABASE.find((x) => x.id === id);
    if (!base) return undefined;
    const ov = state.categoryOverrides && state.categoryOverrides[id];
    return ov ? { ...base, category: ov } : base;
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
    btnRestoreHidden: $('#btn-restore-hidden'),
    btnBatchMode: $('#btn-batch-mode'),
    batchActionBar: $('#batch-action-bar'),
    batchSelectedCount: $('#batch-selected-count'),
    btnBatchSelectAll: $('#btn-batch-select-all'),
    btnBatchDone: $('#btn-batch-done'),
    btnBatchFav: $('#btn-batch-fav'),
    btnBatchCat: $('#btn-batch-cat'),
    btnBatchDelete: $('#btn-batch-delete'),
    foodList: $('#food-list'),
    lookupEmpty: $('#lookup-empty'),
    btnEmptyAddCustom: $('#btn-empty-add-custom'),
    btnEmptyCamera: $('#btn-empty-camera'),
    btnResetFilters: $('#btn-reset-filters'),
    btnBackup: $('#btn-backup'),
    btnLegend: $('#btn-legend'),
    btnTheme: $('#btn-theme'),

    // Favorites
    favoritesList: $('#favorites-list'),
    favoritesEmpty: $('#favorites-empty'),
    btnGoLookup: $('#btn-go-lookup'),

    // Plate
    plateViewTitle: $('#plate-view-title'),
    btnPrevDay: $('#btn-prev-day'),
    btnNextDay: $('#btn-next-day'),
    btnPickHistory: $('#btn-pick-history'),
    plateDateLabel: $('#plate-date-label'),
    btnBackToday: $('#btn-back-today'),
    ringProgress: $('#ring-progress'),
    plateTotalKcal: $('#plate-total-kcal'),
    summaryGoalBtn: $('#summary-goal-btn'),
    remainLabel: $('#remain-label'),
    plateRemainKcal: $('#plate-remain-kcal'),
    plateItemCount: $('#plate-item-count'),
    proteinGoalBox: $('.protein-goal-box'),
    plateProteinProgressText: $('#plate-protein-progress-text'),
    plateProteinPct: $('#plate-protein-pct'),
    plateProteinProgressFill: $('#plate-protein-progress-fill'),
    plateBarCarbs: $('#plate-bar-carbs'),
    plateBarProtein: $('#plate-bar-protein'),
    plateBarFat: $('#plate-bar-fat'),
    plateTotalCarbs: $('#plate-total-carbs'),
    plateTotalProtein: $('#plate-total-protein'),
    plateTotalFat: $('#plate-total-fat'),
    plateMealsContainer: $('#plate-meals-container'),
    plateEmpty: $('#plate-empty'),
    btnSaveRecipe: $('#btn-save-recipe'),
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
    sheetForkBtn: $('#sheet-fork-btn'),
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
    sheetDeletePlateBtn: $('#sheet-delete-plate-btn'),
    sheetAddPlateBtn: $('#sheet-add-plate-btn'),
    sheetAddBtnLabel: $('#sheet-add-btn-label'),
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
    cfDeleteBtn: $('#cf-delete-btn'),
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
    aiGeminiFields: $('#ai-gemini-fields'),
    aiGeminiModel: $('#ai-gemini-model'),
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
    cameraScanText: $('#camera-scan-text'),
    cameraNoKeyTip: $('#camera-no-key-tip'),
    cameraErrorBox: $('#camera-error-box'),
    cameraErrorText: $('#camera-error-text'),
    btnAIRetry: $('#btn-ai-retry'),
    cameraResultCard: $('#camera-result-card'),
    aiResSource: $('#ai-res-source'),
    btnForceCloudAI: $('#btn-force-cloud-ai'),
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
    modalActions: $('#modal-actions'),

    // Recipe Sheet
    recipeBackdrop: $('#recipe-backdrop'),
    recipeSheet: $('#recipe-sheet'),
    recipeGrabber: $('#recipe-grabber'),
    recipeCloseBtn: $('#recipe-close-btn'),
    recipeEmojiPreview: $('#recipe-emoji-preview'),
    recipeTotalKcal: $('#recipe-total-kcal'),
    recipeSumSub: $('#recipe-sum-sub'),
    recipeTotalCarbs: $('#recipe-total-carbs'),
    recipeTotalProtein: $('#recipe-total-protein'),
    recipeTotalFat: $('#recipe-total-fat'),
    recipeName: $('#recipe-name'),
    recipeUnitName: $('#recipe-unit-name'),
    recipeCategory: $('#recipe-category'),
    recipeEmojiSelect: $('#recipe-emoji-select'),
    recipeSeasoningChips: $('#recipe-seasoning-chips'),
    recipeIngredientsList: $('#recipe-ingredients-list'),
    btnConfirmSaveRecipe: $('#btn-confirm-save-recipe'),
    btnRecipeToTextImport: $('#btn-recipe-to-text-import'),

    // Sheet 5: Text Import
    btnTextImport: $('#btn-text-import'),
    textImportBackdrop: $('#text-import-backdrop'),
    textImportSheet: $('#text-import-sheet'),
    textImportGrabber: $('#text-import-grabber'),
    textImportCloseBtn: $('#text-import-close-btn'),
    tiStepInput: $('#ti-step-input'),
    tiInputFooter: $('#ti-input-footer'),
    tiInputText: $('#ti-input-text'),
    tiBtnPaste: $('#ti-btn-paste'),
    tiBtnSample: $('#ti-btn-sample'),
    tiBtnClear: $('#ti-btn-clear'),
    tiBtnParse: $('#ti-btn-parse'),
    tiStepReview: $('#ti-step-review'),
    tiReviewFooter: $('#ti-review-footer'),
    tiModeBadge: $('#ti-mode-badge'),
    tiBtnBackInput: $('#ti-btn-back-input'),
    tiTotalKcal: $('#ti-total-kcal'),
    tiSumSub: $('#ti-sum-sub'),
    tiTotalCarbs: $('#ti-total-carbs'),
    tiTotalProtein: $('#ti-total-protein'),
    tiTotalFat: $('#ti-total-fat'),
    tiRecipeMeta: $('#ti-recipe-meta'),
    tiRecipeName: $('#ti-recipe-name'),
    tiUnitName: $('#ti-unit-name'),
    tiCategory: $('#ti-category'),
    tiEmoji: $('#ti-emoji'),
    tiSectionsContainer: $('#ti-sections-container'),
    tiBlockerHint: $('#ti-blocker-hint'),
    tiRecipeActions: $('#ti-recipe-actions'),
    tiBtnSaveRecipe: $('#ti-btn-save-recipe'),
    tiBtnSaveAndPlate: $('#ti-btn-save-and-plate'),
    tiDishlistActions: $('#ti-dishlist-actions'),
    tiBtnBatchPlate: $('#ti-btn-batch-plate'),
    tiBtnMergeRecipe: $('#ti-btn-merge-recipe')
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
  function createFoodRowHTML(food, context = 'lookup') {
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

    const isBatch = context === 'lookup' && state.batchMode;
    const isSelected = isBatch && state.selectedFoodIds.has(food.id);

    const rowInner = `
      <div class="food-row ${isSelected ? 'selected' : ''}" data-food-id="${food.id}">
        ${isBatch ? `<div class="batch-check ${isSelected ? 'checked' : ''}">${isSelected ? '✓' : ''}</div>` : ''}
        <div class="food-emoji-box">${food.emoji}</div>
        <div class="food-info">
          <div class="food-name-line">
            <span class="dot dot-${level.key}" title="${level.badgeText}"></span>
            <span class="food-name">${escapeHTML(food.name)}</span>
            ${food.isRecipe ? '<span class="recipe-badge">📖 菜谱</span>' : (food.isCustom ? '<span class="custom-badge">自定义</span>' : '')}
            ${isFav ? '<span class="fav-heart-mini" title="已收藏">❤️</span>' : ''}
          </div>
          <div class="food-sub">${escapeHTML(subText)}</div>
        </div>
        <div class="food-right">
          <div class="food-kcal-col">
            <div class="food-kcal-val ${level.key}">${displayKcal}</div>
            <div class="food-kcal-unit">${escapeHTML(displayUnit)}</div>
          </div>
          ${isBatch ? '' : `<button class="quick-add-btn" data-quick-add="${food.id}" aria-label="快捷加入餐盘" title="快捷加入餐盘">+</button>`}
        </div>
      </div>
    `;

    if (isBatch || context === 'plain') {
      return rowInner;
    }

    // 左侧（右滑露出）：速查页所有食物支持右滑收藏/取消收藏
    const leftActions = [];
    if (context === 'lookup') {
      leftActions.push(
        isFav
          ? `<button class="swipe-btn unfav" data-swipe-fav="${food.id}">取消收藏</button>`
          : `<button class="swipe-btn fav" data-swipe-fav="${food.id}">❤️ 收藏</button>`
      );
    }

    // 右侧（左滑露出）：速查页所有食物支持左滑删除（自定义含编辑+删除）；收藏页支持取消收藏+删除
    const rightActions = [];
    if (context === 'favorites') {
      rightActions.push(`<button class="swipe-btn unfav" data-swipe-unfav="${food.id}">取消收藏</button>`);
    }
    if (food.isCustom && (context === 'lookup' || context === 'favorites')) {
      rightActions.push(`<button class="swipe-btn edit" data-swipe-edit-food="${food.id}">编辑</button>`);
    }
    if (context === 'lookup' || (food.isCustom && context === 'favorites')) {
      rightActions.push(`<button class="swipe-btn delete" data-swipe-delete-food="${food.id}">删除</button>`);
    }

    if (leftActions.length === 0 && rightActions.length === 0) {
      return rowInner;
    }

    return `
      <div class="swipe-item">
        ${leftActions.length > 0 ? `<div class="swipe-actions-left">${leftActions.join('')}</div>` : ''}
        ${rightActions.length > 0 ? `<div class="swipe-actions">${rightActions.join('')}</div>` : ''}
        <div class="swipe-content">${rowInner}</div>
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

  // 增强检索：支持多关键词空格分词 + 名称/别名/品牌/分类/国标编码全字段搜索 + 相关度排序
  let lookupDisplayLimit = 60;
  let lastFilteredFoods = [];

  function getFilteredFoods() {
    const rawQ = state.searchQuery.trim().toLowerCase();
    const tokens = rawQ ? rawQ.split(/\s+/).filter(Boolean) : [];

    const matched = getAllFoods().filter((food) => {
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

    if (tokens.length > 0) {
      matched.sort((a, b) => {
        const an = a.name.toLowerCase();
        const bn = b.name.toLowerCase();
        const aExact = an === rawQ ? 100 : (an.startsWith(rawQ) ? 50 : (an.includes(rawQ) ? 20 : 0));
        const bExact = bn === rawQ ? 100 : (bn.startsWith(rawQ) ? 50 : (bn.includes(rawQ) ? 20 : 0));
        const aBonus = a.isCustom ? 200 : (a.isStandard ? 0 : 8);
        const bBonus = b.isCustom ? 200 : (b.isStandard ? 0 : 8);
        return (bExact + bBonus) - (aExact + aBonus);
      });
    }

    return matched;
  }

  function renderLookupList(resetLimit = true) {
    if (resetLimit) lookupDisplayLimit = 60;
    const foods = getFilteredFoods();
    lastFilteredFoods = foods;

    const customCount = state.customFoods.length;
    dom.resultCount.textContent = customCount > 0
      ? `共 ${foods.length} 种食物（含 ${customCount} 种自定义）`
      : `共 ${foods.length} 种食物`;

    const hiddenCount = state.hiddenFoodIds.length;
    dom.btnRestoreHidden.classList.toggle('hidden', hiddenCount === 0);
    if (hiddenCount > 0) {
      dom.btnRestoreHidden.textContent = `恢复已删(${hiddenCount})`;
    }

    updateBatchBarUI();

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

    const visible = foods.slice(0, lookupDisplayLimit);
    const remain = foods.length - visible.length;
    const moreHTML = remain > 0
      ? `<button type="button" class="load-more-btn" data-load-more="1">显示更多（还有 ${remain} 种）</button>`
      : '';
    dom.foodList.innerHTML = visible.map((f) => createFoodRowHTML(f, 'lookup')).join('') + moreHTML;
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
    dom.favoritesList.innerHTML = favFoods.map((f) => createFoodRowHTML(f, 'favorites')).join('');
  }

  // ==================== 渲染：餐盘与历史 ====================
  function renderPlate() {
    const today = getTodayStr();
    const isToday = state.plateDate === today;
    const currentItems = getCurrentPlateItems();

    // 顶部日期栏更新
    dom.plateViewTitle.textContent = isToday ? '今日餐盘' : '历史餐盘';
    dom.plateDateLabel.textContent = formatDateDisplay(state.plateDate);
    dom.btnNextDay.disabled = isToday;
    dom.btnBackToday.classList.toggle('hidden', isToday);

    let totalKcal = 0;
    let totalCarbs = 0;
    let totalProtein = 0;
    let totalFat = 0;

    const enriched = currentItems.map((item) => {
      // 优先使用记录当时的营养快照，保证食物改名/改数值/删除后历史记录数值恒定不变
      const food = item.snapshot || getFoodById(item.foodId);
      if (!food) return null;
      const nut = calcNutrition(food, item.grams);
      totalKcal += nut.kcal;
      totalCarbs += nut.carbs;
      totalProtein += nut.protein;
      totalFat += nut.fat;
      return { ...item, food, nut };
    }).filter(Boolean);

    // 热量环形进度条
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

    // 蛋白质目标进度条
    const pGoal = Math.max(1, state.proteinGoal);
    const pPct = Math.round((totalProtein / pGoal) * 100);
    const pReached = totalProtein >= pGoal;
    dom.plateProteinProgressText.textContent = `${totalProtein.toFixed(1)} / ${pGoal}g`;
    dom.plateProteinPct.textContent = pReached ? `✓ 已达标 (${pPct}%)` : `${pPct}%`;
    dom.plateProteinPct.classList.toggle('reached', pReached);
    dom.plateProteinProgressFill.style.width = `${Math.min(100, pPct)}%`;
    dom.plateProteinProgressFill.classList.toggle('reached', pReached);

    // 三大营养素供能占比
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
      dom.plateEmpty.querySelector('h3').textContent = isToday
        ? '今日餐盘还是空的'
        : `${formatDateDisplay(state.plateDate)} 暂无记录`;
      return;
    }

    dom.plateEmpty.classList.add('hidden');

    const sectionsHTML = MEAL_TYPES.map((meal) => {
      const items = enriched.filter((it) => it.meal === meal.id);
      if (items.length === 0) return '';
      const mealKcal = items.reduce((sum, it) => sum + it.nut.kcal, 0);
      const mealProtein = items.reduce((sum, it) => sum + it.nut.protein, 0);

      const rowsHTML = items.map((it) => `
        <div class="swipe-item">
          <div class="swipe-actions">
            <button class="swipe-btn edit" data-edit-plate="${it.uid}">改份量</button>
            <button class="swipe-btn delete" data-delete-plate="${it.uid}">删除</button>
          </div>
          <div class="swipe-content">
            <div class="plate-row" data-edit-plate="${it.uid}" style="cursor:pointer;">
              <div class="food-emoji-box">${it.food.emoji || '🍽️'}</div>
              <div class="food-info">
                <div class="food-name">${escapeHTML(it.food.name)}</div>
                <div class="food-sub">${escapeHTML(it.label)}（${Math.round(it.grams)}g）· 蛋${it.nut.protein}g · 点击改份量</div>
              </div>
              <div class="food-right">
                <div class="food-kcal-col">
                  <div class="food-kcal-val">${it.nut.kcal}</div>
                  <div class="food-kcal-unit">kcal</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `).join('');

      return `
        <div class="meal-section">
          <div class="meal-section-header">
            <span>${meal.icon} ${meal.name}</span>
            <div class="meal-header-right">
              <span>${mealKcal} kcal · 蛋 ${mealProtein.toFixed(1)}g</span>
              <button type="button" class="meal-recipe-btn" data-save-meal-recipe="${meal.id}">📖 存菜谱</button>
            </div>
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

    const todayCount = getPlateItemsForDate(getTodayStr()).length;
    if (todayCount > 0) {
      dom.badgePlate.textContent = todayCount;
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

  // ==================== Sheet 1：食物详情 / 编辑餐盘份量 ====================
  function openFoodSheet(foodId) {
    const food = getFoodById(foodId);
    if (!food) return;

    state.sheet.food = food;
    state.sheet.editingPlateUid = null;
    // 自定义食物默认使用用户设定的常用单位（如 1片=50g / 1瓶=260ml），仍可一键切换按克输入
    if (food.isCustom) {
      state.sheet.mode = 'unit';
      state.sheet.amount = 1;
    } else {
      state.sheet.mode = state.listUnitMode === '100g' ? 'gram' : 'unit';
      state.sheet.amount = state.sheet.mode === 'gram' ? 100 : 1;
    }
    state.sheet.meal = getSmartDefaultMeal();

    const isToday = state.plateDate === getTodayStr();
    dom.sheetDeletePlateBtn.classList.add('hidden');
    dom.sheetAddBtnLabel.textContent = isToday ? '加入今日餐盘' : `补录到 ${formatDateDisplay(state.plateDate)}`;

    populateFoodSheetUI(food, true);
    showSheet(dom.detailBackdrop, dom.detailSheet);
  }

  function openEditPlateSheet(uid) {
    const items = getCurrentPlateItems();
    const item = items.find((it) => it.uid === uid);
    if (!item) return;

    const dbFood = getFoodById(item.foodId);
    // 优先保持记录当时的营养快照数值，unitName/unitGrams 优先参考原条目或快照
    const food = item.snapshot
      ? {
          id: item.foodId,
          name: item.snapshot.name,
          emoji: item.snapshot.emoji || '🍽️',
          kcal: item.snapshot.kcal,
          carbs: item.snapshot.carbs,
          protein: item.snapshot.protein,
          fat: item.snapshot.fat,
          unitName: item.snapshot.unitName || dbFood?.unitName || '1份',
          unitGrams: item.snapshot.unitGrams || dbFood?.unitGrams || Math.max(10, Math.round(item.grams || 100)),
          isCustom: Boolean(dbFood?.isCustom),
          tip: '修改克数、份数或餐次后点击保存，即可原地更新本条记录（沿用记录当时的营养数值）。'
        }
      : (dbFood || {
          id: item.foodId,
          name: '记录食物',
          emoji: '🍽️',
          kcal: 0,
          carbs: 0,
          protein: 0,
          fat: 0,
          unitName: '1份',
          unitGrams: Math.max(10, Math.round(item.grams || 100)),
          tip: '修改克数、份数或餐次后点击保存，即可原地更新本条记录。'
        });

    state.sheet.food = food;
    state.sheet.editingPlateUid = uid;
    state.sheet.meal = item.meal || getSmartDefaultMeal();

    // 若克数刚好是常见份量的 0.5 倍数，优先按份数显示；否则按克数显示
    const units = food.unitGrams > 0 ? item.grams / food.unitGrams : 0;
    const roundedHalf = Math.round(units * 2) / 2;
    if (roundedHalf >= 0.5 && Math.abs(units - roundedHalf) < 0.05) {
      state.sheet.mode = 'unit';
      state.sheet.amount = roundedHalf;
    } else {
      state.sheet.mode = 'gram';
      state.sheet.amount = Math.round(item.grams);
    }

    dom.sheetDeletePlateBtn.classList.remove('hidden');
    dom.sheetAddBtnLabel.textContent = '保存份量修改';

    populateFoodSheetUI(food, Boolean(dbFood));
    showSheet(dom.detailBackdrop, dom.detailSheet);
  }

  function populateFoodSheetUI(food, existsInDb) {
    const level = getCalorieLevel(food.kcal);
    dom.sheetEmoji.textContent = food.emoji;
    dom.sheetFoodName.textContent = food.name;
    dom.sheetLevelBadge.textContent = level.badgeText;
    dom.sheetLevelBadge.className = `level-badge ${level.key}`;
    dom.sheetCustomBadge.classList.toggle('hidden', !food.isCustom);
    dom.sheetForkBtn.classList.toggle('hidden', Boolean(food.isCustom) || !existsInDb);
    dom.sheetEditBtn.classList.toggle('hidden', !food.isCustom);
    dom.sheetDeleteBtn.classList.toggle('hidden', !food.isCustom);
    dom.sheetFavBtn.classList.toggle('hidden', !existsInDb);
    dom.sheetBaseInfo.textContent = `${food.kcal} kcal / 100g`;
    dom.sheetModeUnitBtn.textContent = `${food.unitName} (${food.unitGrams}g)`;
    dom.sheetTip.textContent = food.tip || '自定义录入食物，建议结合包装营养成分表参考。';

    updateSheetFavUI();
    updateSheetModeUI();
    updateSheetMealUI();
    updateSheetCalculations();
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
    const optionsHTML = FOOD_CATEGORIES
      .filter((c) => c.id !== 'all')
      .map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`)
      .join('');
    dom.cfCategory.innerHTML = optionsHTML;
    dom.recipeCategory.innerHTML = optionsHTML;
    dom.tiCategory.innerHTML = optionsHTML;

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
    dom.cfDeleteBtn.classList.toggle('hidden', !isEdit);

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

  function findDuplicateFoodByName(name, excludeId = null) {
    const target = String(name || '').trim();
    if (!target) return null;
    const all = [...state.customFoods, ...FOOD_DATABASE];
    return all.find((x) => x.id !== excludeId && String(x.name || '').trim() === target) || null;
  }

  function suggestUniqueRecipeName(baseName) {
    const clean = String(baseName || '').trim() || '我的菜谱';
    let candidate = `${clean}（自制）`;
    let n = 2;
    while (findDuplicateFoodByName(candidate)) {
      candidate = `${clean}（自制${n}）`;
      n++;
    }
    return candidate;
  }

  function handleSaveCustomFood(e) {
    e.preventDefault();
    const name = dom.cfName.value.trim();
    const kcal = parseFloat(dom.cfKcal.value);
    if (!name) {
      showToast('请输入食物名称');
      return;
    }
    if (isNaN(kcal) || !Number.isFinite(kcal) || kcal < 0) {
      showToast('请输入有效的热量数值');
      return;
    }

    const carbs = Math.max(0, parseFloat(dom.cfCarbs.value) || 0);
    const protein = Math.max(0, parseFloat(dom.cfProtein.value) || 0);
    const fat = Math.max(0, parseFloat(dom.cfFat.value) || 0);
    const unitName = dom.cfUnitName.value.trim() || '1份';
    const unitGrams = Math.max(1, +(parseFloat(dom.cfUnitGrams.value) || 100).toFixed(1));
    const tip = dom.cfTip.value.trim() || '自定义录入食物，可根据实际份量灵活换算。';
    const category = dom.cfCategory.value || 'dish';
    const kcalVal = +kcal.toFixed(1);

    const editId = dom.cfId.value;
    if (editId) {
      const idx = state.customFoods.findIndex((x) => x.id === editId);
      if (idx >= 0) {
        const prev = state.customFoods[idx];
        state.customFoods[idx] = {
          ...prev,
          name,
          alias: `${prev.isRecipe ? '菜谱 组合菜 ' : ''}自定义 ${name}`,
          category,
          emoji: state.customFormEmoji,
          kcal: kcalVal,
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
      const dup = findDuplicateFoodByName(name);
      if (dup) {
        showToast(`库内已有同名食物「${name}」，禁止覆盖，请复用或改名`);
        dom.cfName.focus();
        return;
      }
      const newFood = {
        id: `custom_${Date.now()}`,
        name,
        alias: `自定义 ${name}`,
        category,
        emoji: state.customFormEmoji,
        kcal: kcalVal,
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

      if (typeof state.customFoodCallback === 'function') {
        const cb = state.customFoodCallback;
        state.customFoodCallback = null;
        cb(newFood);
      }

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
    const geminiModel = cfg.geminiModel || DEFAULT_GEMINI_MODEL;
    dom.aiProvider.value = cfg.provider || 'gemini';
    dom.aiGeminiModel.value = geminiModel;
    dom.aiBaseUrl.value = cfg.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    dom.aiModel.value = cfg.model || 'qwen-vl-plus';
    dom.aiApiKey.value = cfg.apiKey || '';
    dom.aiGeminiFields.classList.toggle('hidden', cfg.provider === 'openai');
    dom.aiOpenAIFields.classList.toggle('hidden', cfg.provider !== 'openai');

    if (cfg.apiKey) {
      dom.aiStatusPill.textContent = cfg.provider === 'gemini'
        ? `已连接 ${geminiModel}`
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

  const AI_FOOD_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      emoji: { type: 'string' },
      category: {
        type: 'string',
        enum: ['staple', 'protein', 'veggie', 'fruit', 'dairy', 'dish', 'fastfood', 'snack']
      },
      kcalPer100g: { type: 'number' },
      carbsPer100g: { type: 'number' },
      proteinPer100g: { type: 'number' },
      fatPer100g: { type: 'number' },
      portionName: { type: 'string' },
      portionGrams: { type: 'number' },
      tip: { type: 'string' },
      error: { type: 'string' }
    }
  };

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

  // ==================== 引擎 1：iOS 原生离线 Vision OCR ====================
  const pendingOCRRequests = new Map();
  window.__onNativeOCRResult = (payload) => {
    if (!payload || !payload.requestId) return;
    const resolver = pendingOCRRequests.get(payload.requestId);
    if (resolver) {
      pendingOCRRequests.delete(payload.requestId);
      resolver(payload);
    }
  };

  function runNativeOCR(base64) {
    return new Promise((resolve) => {
      const hasIOSOCR = Boolean(window.__IOS_NATIVE_OCR__ && window.webkit?.messageHandlers?.nativeOCR);
      const hasAndroidOCR = Boolean(window.__ANDROID_NATIVE_OCR__ && window.AndroidBridge?.runNativeOCR);
      if (!hasIOSOCR && !hasAndroidOCR) {
        resolve({ lines: [], unsupported: true });
        return;
      }
      const requestId = `ocr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const timer = setTimeout(() => {
        pendingOCRRequests.delete(requestId);
        resolve({ lines: [], error: 'OCR 超时' });
      }, 6000);

      pendingOCRRequests.set(requestId, (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });

      try {
        if (hasIOSOCR) {
          window.webkit.messageHandlers.nativeOCR.postMessage({ requestId, base64 });
        } else {
          window.AndroidBridge.runNativeOCR(requestId, base64);
        }
      } catch {
        clearTimeout(timer);
        pendingOCRRequests.delete(requestId);
        resolve({ lines: [] });
      }
    });
  }

  // 解析中国预包装食品「营养成分表」(GB 28050)
  function parseNutritionLabelOCR(lines) {
    if (!Array.isArray(lines) || lines.length === 0) return null;
    const text = lines.join(' ').replace(/\s+/g, ' ');

    // 提取能量（支持 千焦/kJ 自动 ÷4.184 转 kcal，也支持 千卡/kcal/大卡）
    let kcalRaw = null;
    let energyUnit = '';
    let energyOrig = null;

    const kjMatch = text.match(/能\s*量[^0-9]{0,18}(\d+(?:\.\d+)?)\s*(?:千\s*焦|k\s*j|KJ)/i)
      || text.match(/(\d+(?:\.\d+)?)\s*(?:千\s*焦|k\s*j)/i);
    const kcalMatch = text.match(/能\s*量[^0-9]{0,18}(\d+(?:\.\d+)?)\s*(?:千\s*卡|大\s*卡|k\s*c\s*a\s*l)/i)
      || text.match(/(\d+(?:\.\d+)?)\s*(?:千\s*卡|大\s*卡|k\s*c\s*a\s*l)/i);

    if (kcalMatch) {
      kcalRaw = parseFloat(kcalMatch[1]);
      energyUnit = 'kcal';
      energyOrig = `${kcalMatch[1]} 千卡`;
    } else if (kjMatch) {
      const kjVal = parseFloat(kjMatch[1]);
      kcalRaw = kjVal / 4.184;
      energyUnit = 'kJ';
      energyOrig = `${kjMatch[1]} 千焦`;
    }

    // 提取蛋白/脂肪/碳水（脂肪排除反式脂肪、饱和脂肪）
    const proteinMatch = text.match(/蛋\s*白\s*质?[^0-9]{0,14}(\d+(?:\.\d+)?)\s*(?:克|g)/i);
    const fatCleaned = text.replace(/(?:反式|饱和|不饱和)\s*脂\s*肪(?:酸)?[^0-9]{0,14}\d+(?:\.\d+)?\s*(?:克|g)?/gi, '');
    const fatMatch = fatCleaned.match(/脂\s*肪[^0-9]{0,14}(\d+(?:\.\d+)?)\s*(?:克|g)/i);
    const carbsMatch = text.match(/碳\s*水(?:\s*化\s*合\s*物)?[^0-9]{0,14}(\d+(?:\.\d+)?)\s*(?:克|g)/i);

    const hasMacro = Boolean(proteinMatch || fatMatch || carbsMatch);
    const hasTableKeyword = /营养成分表|营养素参考值|NRV|每\s*100|千焦|kJ/i.test(text);

    // 必须识别到能量，且具备成分表特征或至少一项营养素，才判定为营养成分表
    if (kcalRaw === null || (!hasMacro && !hasTableKeyword)) {
      return null;
    }

    // 识别基准份量（每100g / 每100mL / 每份XXg）
    let baseGrams = 100;
    let isLiquid = /100\s*(?:毫\s*升|m\s*l)|净\s*含\s*量[^0-9]{0,8}\d+\s*(?:毫\s*升|m\s*l)/i.test(text);
    const perPortionMatch = text.match(/每\s*份\s*[（(]?\s*(\d+(?:\.\d+)?)\s*(?:克|g|毫\s*升|m\s*l)/i);
    const per100Match = text.match(/每\s*100\s*(?:克|g|毫\s*升|m\s*l)/i);
    if (!per100Match && perPortionMatch) {
      const pVal = parseFloat(perPortionMatch[1]);
      if (pVal > 5 && pVal <= 1000) baseGrams = pVal;
    }

    const scale = 100 / baseGrams;
    const kcalPer100g = Math.round(kcalRaw * scale);
    const proteinPer100g = proteinMatch ? +(parseFloat(proteinMatch[1]) * scale).toFixed(1) : 0;
    const fatPer100g = fatMatch ? +(parseFloat(fatMatch[1]) * scale).toFixed(1) : 0;
    const carbsPer100g = carbsMatch ? +(parseFloat(carbsMatch[1]) * scale).toFixed(1) : 0;

    // 识别净含量作为常见份量参考（如 250ml / 950ml / 100g）
    let portionGrams = isLiquid ? 250 : 100;
    let portionName = isLiquid ? '1杯 (250ml)' : '100g';
    const netMatch = text.match(/净\s*含\s*量[^0-9]{0,10}(\d+(?:\.\d+)?)\s*(毫\s*升|m\s*l|升|L|克|g|千\s*克|k\s*g)/i);
    if (netMatch) {
      let val = parseFloat(netMatch[1]);
      const unit = netMatch[2].toLowerCase().replace(/\s+/g, '');
      if (unit === 'l' || unit === '升' || unit === 'kg' || unit === '千克') val *= 1000;
      if (val >= 15 && val <= 600) {
        portionGrams = Math.round(val);
        portionName = isLiquid ? `1瓶/盒` : `1袋/份`;
      } else if (val > 600 && isLiquid) {
        portionGrams = 250;
        portionName = '1杯';
      }
    }

    // 智能猜测品名、分类和 Emoji
    const keywordRules = [
      { re: /鲜牛奶|纯牛奶|巴氏杀菌|鲜奶|牛乳|牛奶/, name: '鲜牛奶 / 纯牛奶', emoji: '🥛', cat: 'dairy' },
      { re: /酸奶|发酵乳|风味乳/, name: '酸奶 / 发酵乳', emoji: '🥣', cat: 'dairy' },
      { re: /豆浆|豆奶|植物蛋白/, name: '豆浆 / 植物奶', emoji: '🥛', cat: 'dairy' },
      { re: /咖啡|拿铁|美式/, name: '咖啡饮品', emoji: '☕', cat: 'dairy' },
      { re: /奶茶|果茶|乌龙茶|茶饮料/, name: '瓶装茶饮 / 奶茶', emoji: '🧋', cat: 'snack' },
      { re: /可乐|汽水|气泡水|苏打水|果汁/, name: '包装饮料', emoji: '🥤', cat: 'snack' },
      { re: /吐司|面包|全麦|贝果|可颂/, name: '包装面包', emoji: '🍞', cat: 'staple' },
      { re: /燕麦|麦片|谷物/, name: '燕麦 / 谷物', emoji: '🥣', cat: 'staple' },
      { re: /鸡胸|牛肉|猪肉|火腿|香肠|午餐肉/, name: '包装肉制品', emoji: '🥩', cat: 'protein' },
      { re: /薯片|饼干|巧克力|坚果|糖|蛋糕|辣条|海苔/, name: '包装零食', emoji: '🍪', cat: 'snack' }
    ];

    let matchedRule = keywordRules.find((r) => r.re.test(text));
    const name = matchedRule ? `${matchedRule.name}（成分表）` : '包装食品（成分表识别）';

    return {
      name,
      emoji: matchedRule ? matchedRule.emoji : '📦',
      category: matchedRule ? matchedRule.cat : 'snack',
      kcalPer100g,
      carbsPer100g,
      proteinPer100g,
      fatPer100g,
      portionName,
      portionGrams,
      tip: `已离线提取包装营养成分表（原始能量 ${energyOrig} → ${kcalPer100g} kcal/100${isLiquid ? 'ml' : 'g'}），点「存入食物库」可改名永久保存。`,
      _isOffline: true,
      _sourceLabel: window.__ANDROID_NATIVE_APP__ ? '⚡ 本机离线 OCR 识别' : '⚡ iPhone 本地离线 OCR 识别'
    };
  }

  // ==================== 引擎 2：云端 AI 视觉模型（含多模型容灾防堵车） ====================
  async function callSingleGeminiModel(targetModel, apiKey, base64, mimeType) {
    const cleanModel = targetModel.replace(/^models\//, '');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
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
          thinkingConfig: { thinkingLevel: 'low' },
          responseMimeType: 'application/json',
          responseJsonSchema: AI_FOOD_RESPONSE_SCHEMA
        }
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `Gemini API 错误 (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts
      .filter((p) => p && !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('');
    const parsed = parseAIJsonText(text);
    parsed._isOffline = false;
    parsed._sourceLabel = `🤖 ${cleanModel} 估算`;
    return parsed;
  }

  async function callVisionModel(base64, mimeType, onStatus) {
    const { provider, geminiModel, apiKey, baseUrl, model } = state.aiConfig;
    if (!apiKey) {
      throw new Error('请先点击右上角 ⚙️ 配置你的 AI API Key');
    }

    if (provider === 'gemini') {
      // 主模型 + 自动容灾备用链
      const primary = (geminiModel || DEFAULT_GEMINI_MODEL).trim();
      const candidates = [...new Set([
        primary,
        ...GEMINI_FALLBACK_MODELS
      ].filter(Boolean))];

      let lastErr = null;
      for (let i = 0; i < candidates.length; i++) {
        const m = candidates[i];
        try {
          if (onStatus) {
            onStatus(i === 0 ? `正在使用 ${m} 识别...` : `主模型繁忙，自动切换 ${m}...`);
          }
          return await callSingleGeminiModel(m, apiKey, base64, mimeType);
        } catch (err) {
          lastErr = err;
          const msg = (err.message || '').toLowerCase();
          const retryable = err.status === 503 || err.status === 429 || err.status === 404 || err.status === 410
            || msg.includes('high demand') || msg.includes('overloaded')
            || msg.includes('no longer available') || msg.includes('not found')
            || msg.includes('deprecated') || msg.includes('retired') || msg.includes('shut down')
            || msg.includes('quota') || msg.includes('resource exhausted');
          if (!retryable) throw err;
        }
      }
      throw lastErr || new Error('所有备用模型当前均繁忙，请稍后重试');
    } else {
      if (onStatus) onStatus(`正在使用 ${model || '视觉模型'} 识别...`);
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

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message || `接口请求失败 (${res.status})`);
      }
      const text = data?.choices?.[0]?.message?.content;
      const parsed = parseAIJsonText(text);
      parsed._isOffline = false;
      parsed._sourceLabel = `🤖 ${model || '云端 AI'} 估算`;
      return parsed;
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

    dom.aiResSource.textContent = result._sourceLabel || '🤖 AI 识别';
    dom.aiResSource.classList.toggle('cloud', !result._isOffline);
    dom.btnForceCloudAI.classList.toggle('hidden', !result._isOffline || !state.aiConfig.apiKey);

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
      dom.aiLocalMatchesList.innerHTML = matches.map((f) => createFoodRowHTML(f, 'plain')).join('');
      dom.aiLocalMatches.classList.remove('hidden');
    } else {
      dom.aiLocalMatches.classList.add('hidden');
    }

    dom.cameraResultCard.classList.remove('hidden');
  }

  async function runRecognitionPipeline(base64, mimeType, forceCloud = false) {
    dom.cameraErrorBox.classList.add('hidden');
    dom.cameraResultCard.classList.add('hidden');
    dom.cameraScanningOverlay.classList.remove('hidden');

    try {
      // 1. 优先尝试原生离线 OCR 识别「营养成分表」（0.2秒秒出，永不堵车）
      if (!forceCloud && (window.__IOS_NATIVE_OCR__ || window.__ANDROID_NATIVE_OCR__)) {
        dom.cameraScanText.textContent = '⚡ 离线扫描营养成分表中...';
        const ocrRes = await runNativeOCR(base64);
        const parsedLabel = parseNutritionLabelOCR(ocrRes.lines);
        if (parsedLabel) {
          dom.cameraScanningOverlay.classList.add('hidden');
          renderAIResult(parsedLabel);
          showToast('⚡ 离线秒出！已提取营养成分表');
          return;
        }
      }

      // 2. 非包装成分表图片，走云端 AI 视觉模型（自动容灾防堵车）
      if (!state.aiConfig.apiKey) {
        dom.cameraScanningOverlay.classList.add('hidden');
        dom.cameraNoKeyTip.classList.remove('hidden');
        dom.aiConfigPanel.classList.remove('hidden');
        showToast('未检测到营养成分表，请配置 AI Key 识别菜肴');
        return;
      }

      const result = await callVisionModel(base64, mimeType, (statusText) => {
        dom.cameraScanText.textContent = statusText;
      });
      dom.cameraScanningOverlay.classList.add('hidden');

      if (result.error) {
        dom.cameraErrorText.textContent = `⚠️ ${result.error}`;
        dom.cameraErrorBox.classList.remove('hidden');
        return;
      }

      renderAIResult(result);
    } catch (err) {
      dom.cameraScanningOverlay.classList.add('hidden');
      dom.cameraErrorText.textContent = `⚠️ 识别失败：${err.message || '请检查网络或 API Key 配置'}`;
      dom.cameraErrorBox.classList.remove('hidden');
    }
  }

  async function handleImageSelected(file) {
    if (!file) return;
    try {
      const { dataUrl, base64, mimeType } = await compressImageToBase64(file);
      state.lastImagePayload = { base64, mimeType };
      dom.cameraPreviewImg.src = dataUrl;
      dom.cameraPreviewWrap.classList.remove('hidden');
      await runRecognitionPipeline(base64, mimeType, false);
    } catch (err) {
      dom.cameraScanningOverlay.classList.add('hidden');
      dom.cameraErrorText.textContent = `⚠️ 图片读取失败：${err.message || ''}`;
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
    const items = [...getCurrentPlateItems()];
    items.push({
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
        fat: food.fat,
        unitName: food.unitName || '1份',
        unitGrams: food.unitGrams || 100
      },
      addedAt: Date.now()
    });
    setPlateItemsForDate(state.plateDate, items);
    renderPlate();

    const mealObj = MEAL_TYPES.find((m) => m.id === (meal || getSmartDefaultMeal()));
    const dayTag = state.plateDate === getTodayStr() ? '' : `${formatDateDisplay(state.plateDate)} `;
    showToast(`✓ 已加入${dayTag}${mealObj ? mealObj.name : '餐盘'} · +${nut.kcal} kcal`);
  }

  function updatePlateItem(uid, grams, label, meal) {
    const items = [...getCurrentPlateItems()];
    const idx = items.findIndex((it) => it.uid === uid);
    if (idx < 0 || grams <= 0) return;

    items[idx] = {
      ...items[idx],
      grams,
      label,
      meal: meal || items[idx].meal
    };
    setPlateItemsForDate(state.plateDate, items);
    renderPlate();
    showToast('✓ 已更新份量与餐次');
  }

  function quickAddFood(foodId) {
    const food = getFoodById(foodId);
    if (!food) return;
    // 自定义食物默认优先按用户设定的常用单位（如 1片=50g / 1瓶=260ml）一键加入餐盘
    const useUnit = food.isCustom || state.listUnitMode === 'unit';
    const grams = useUnit ? food.unitGrams : 100;
    const label = useUnit ? food.unitName : '100g';
    addToPlate(foodId, grams, label, getSmartDefaultMeal());
  }

  function removeFromPlate(uid) {
    const next = getCurrentPlateItems().filter((it) => it.uid !== uid);
    setPlateItemsForDate(state.plateDate, next);
    renderPlate();
    showToast('已从餐盘移除');
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

  // ==================== 食品库单条删除/隐藏 & 批量编辑 ====================
  function removeFoodFromLibrary(foodId) {
    const food = getFoodById(foodId);
    if (!food) return;

    if (food.isCustom) {
      deleteCustomFood(foodId);
      return;
    }

    // 内置/国标食物：加入隐藏名单（可随时恢复）
    if (!state.hiddenFoodIds.includes(foodId)) {
      state.hiddenFoodIds.push(foodId);
      saveHiddenFoods();
    }
    state.favorites = state.favorites.filter((id) => id !== foodId);
    saveFavorites();
    state.selectedFoodIds.delete(foodId);
    renderLookupList(false);
    renderFavoritesList();
    showToast(`已移除「${food.name}」（可点击恢复已删找回）`);
  }

  function restoreHiddenFoods() {
    const count = state.hiddenFoodIds.length;
    if (count === 0) return;
    openModal({
      title: `恢复已删除的 ${count} 种内置食物？`,
      html: '<p style="margin:0;text-align:center;">将把你此前左滑或批量删除的内置/国标食物重新恢复到速查库中。</p>',
      actions: [
        { text: '取消', cls: 'cancel' },
        {
          text: '全部恢复',
          onClick: () => {
            state.hiddenFoodIds = [];
            saveHiddenFoods();
            renderLookupList(false);
            showToast(`✓ 已恢复 ${count} 种内置食物`);
          }
        }
      ]
    });
  }

  function updateBatchBarUI() {
    dom.btnBatchMode.textContent = state.batchMode ? '完成' : '批量编辑';
    dom.batchActionBar.classList.toggle('hidden', !state.batchMode);
    if (!state.batchMode) return;

    const count = state.selectedFoodIds.size;
    dom.batchSelectedCount.textContent = `已选 ${count} 项`;
    const visibleIds = lastFilteredFoods.slice(0, lookupDisplayLimit).map((f) => f.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => state.selectedFoodIds.has(id));
    dom.btnBatchSelectAll.textContent = allVisibleSelected ? '取消全选' : '全选当前页';
  }

  function toggleBatchMode(forceVal = null) {
    closeAllSwipes();
    state.batchMode = forceVal !== null ? forceVal : !state.batchMode;
    if (!state.batchMode) {
      state.selectedFoodIds.clear();
    }
    renderLookupList(false);
  }

  function batchFavoriteSelected() {
    const ids = Array.from(state.selectedFoodIds);
    if (ids.length === 0) {
      showToast('请先勾选要收藏的食物');
      return;
    }
    let added = 0;
    ids.forEach((id) => {
      if (!state.favorites.includes(id)) {
        state.favorites.unshift(id);
        added++;
      }
    });
    saveFavorites();
    renderFavoritesList();
    renderLookupList(false);
    showToast(added > 0 ? `❤️ 已批量收藏 ${added} 种食物` : '选中的食物已在收藏夹中');
  }

  function batchChangeCategorySelected() {
    const ids = Array.from(state.selectedFoodIds);
    if (ids.length === 0) {
      showToast('请先勾选要改分类的食物');
      return;
    }
    const cats = FOOD_CATEGORIES.filter((c) => c.id !== 'all');
    openModal({
      title: `批量修改 ${ids.length} 项的分类`,
      html: `
        <div class="cat-pick-grid">
          ${cats.map((c) => `
            <button type="button" class="cat-pick-btn" data-batch-cat-target="${c.id}">
              ${c.icon} ${c.name}
            </button>
          `).join('')}
        </div>
      `,
      actions: [{ text: '取消', cls: 'cancel' }]
    });

    dom.modalContent.querySelectorAll('[data-batch-cat-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetCat = btn.dataset.batchCatTarget;
        const catObj = cats.find((c) => c.id === targetCat);
        ids.forEach((id) => {
          const custom = state.customFoods.find((x) => x.id === id);
          if (custom) {
            custom.category = targetCat;
          } else {
            state.categoryOverrides[id] = targetCat;
          }
        });
        saveCustomFoods();
        saveCategoryOverrides();
        state.selectedFoodIds.clear();
        closeModal();
        renderLookupList(false);
        showToast(`📂 已将 ${ids.length} 种食物移至「${catObj ? catObj.name : targetCat}」`);
      });
    });
  }

  function batchDeleteSelected() {
    const ids = Array.from(state.selectedFoodIds);
    if (ids.length === 0) {
      showToast('请先勾选要删除的食物');
      return;
    }
    openModal({
      title: `批量删除 ${ids.length} 种食物？`,
      html: '<p style="margin:0;text-align:center;">自定义食物将永久删除，内置食物将从速查库隐藏（可随时点击“恢复已删”找回）。</p>',
      actions: [
        { text: '取消', cls: 'cancel' },
        {
          text: '确认删除',
          cls: 'danger',
          onClick: () => {
            const idSet = new Set(ids);
            state.customFoods = state.customFoods.filter((x) => !idSet.has(x.id));
            ids.forEach((id) => {
              if (!id.startsWith('custom_') && !state.hiddenFoodIds.includes(id)) {
                state.hiddenFoodIds.push(id);
              }
            });
            state.favorites = state.favorites.filter((id) => !idSet.has(id));
            saveCustomFoods();
            saveHiddenFoods();
            saveFavorites();
            state.selectedFoodIds.clear();
            renderLookupList(false);
            renderFavoritesList();
            showToast(`🗑️ 已删除 ${ids.length} 种食物`);
          }
        }
      ]
    });
  }

  // ==================== Sheet 4：📖 组合菜谱（餐盘一键存为菜谱） ====================
  const SEASONING_PRESETS = {
    oil10: { id: 'cooking-oil', name: '烹调植物油', emoji: '🫗', kcal: 899, carbs: 0, protein: 0, fat: 99.9, grams: 10 },
    oil5: { id: 'cooking-oil', name: '烹调植物油', emoji: '🫗', kcal: 899, carbs: 0, protein: 0, fat: 99.9, grams: 5 },
    sugar5: { id: 'white-sugar', name: '白砂糖', emoji: '🧂', kcal: 400, carbs: 99.9, protein: 0, fat: 0, grams: 5 },
    oyster15: { id: 'oyster-sauce', name: '蚝油', emoji: '🫙', kcal: 114, carbs: 24.0, protein: 3.8, fat: 0.3, grams: 15 },
    soy15: { id: 'soy-sauce', name: '生抽 / 酱油', emoji: '🫙', kcal: 63, carbs: 9.8, protein: 5.6, fat: 0.1, grams: 15 }
  };

  function openRecipeSheet(mealId = null) {
    const allItems = getCurrentPlateItems();
    const sourceItems = mealId ? allItems.filter((it) => it.meal === mealId) : allItems;

    if (sourceItems.length === 0) {
      showToast('先在餐盘里添加这道菜的原料（生重+油糖），再点存菜谱哦');
      return;
    }

    state.recipeDraft = sourceItems.map((it) => {
      const food = getFoodById(it.foodId) || it.snapshot;
      return {
        key: `${it.uid}_${Math.random().toString(36).slice(2, 5)}`,
        foodId: it.foodId,
        name: food ? food.name : '未知原料',
        emoji: food ? (food.emoji || '🍽️') : '🍽️',
        kcal: food ? food.kcal : 0,
        carbs: food ? food.carbs : 0,
        protein: food ? food.protein : 0,
        fat: food ? food.fat : 0,
        grams: Math.max(1, Math.round(it.grams)),
        checked: true
      };
    });

    // 自动根据前两样主要原料生成默认菜名提示
    const mainNames = state.recipeDraft
      .slice(0, 2)
      .map((x) => x.name.replace(/[（(][^）)]*[）)]/g, '').slice(0, 5));
    dom.recipeName.value = mainNames.length >= 2 ? `我家${mainNames.join('+')}` : '';
    dom.recipeUnitName.value = '1盘';
    dom.recipeCategory.value = 'dish';
    dom.recipeEmojiSelect.value = '🍳';
    dom.recipeEmojiPreview.textContent = '🍳';

    renderRecipeDraft();
    showSheet(dom.recipeBackdrop, dom.recipeSheet);
  }

  function closeRecipeSheet() {
    hideSheet(dom.recipeBackdrop, dom.recipeSheet);
  }

  function addSeasoningToDraft(presetKey) {
    const preset = SEASONING_PRESETS[presetKey];
    if (!preset) return;
    const existing = state.recipeDraft.find((x) => x.foodId === preset.id && x.checked);
    if (existing) {
      existing.grams = Math.round(existing.grams + preset.grams);
    } else {
      state.recipeDraft.push({
        key: `s_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        foodId: preset.id,
        name: preset.name,
        emoji: preset.emoji,
        kcal: preset.kcal,
        carbs: preset.carbs,
        protein: preset.protein,
        fat: preset.fat,
        grams: preset.grams,
        checked: true
      });
    }
    renderRecipeDraft();
    showToast(`已补记 ${preset.name} +${preset.grams}g`);
  }

  function calcRecipeTotals() {
    let totalGrams = 0;
    let totalKcal = 0;
    let totalCarbs = 0;
    let totalProtein = 0;
    let totalFat = 0;

    state.recipeDraft.forEach((ing) => {
      if (!ing.checked || ing.grams <= 0) return;
      const nut = calcNutrition(ing, ing.grams);
      totalGrams += ing.grams;
      totalKcal += nut.kcal;
      totalCarbs += nut.carbs;
      totalProtein += nut.protein;
      totalFat += nut.fat;
    });

    const kcalPer100g = totalGrams > 0 ? Math.round((totalKcal / totalGrams) * 100) : 0;
    const carbsPer100g = totalGrams > 0 ? +((totalCarbs / totalGrams) * 100).toFixed(1) : 0;
    const proteinPer100g = totalGrams > 0 ? +((totalProtein / totalGrams) * 100).toFixed(1) : 0;
    const fatPer100g = totalGrams > 0 ? +((totalFat / totalGrams) * 100).toFixed(1) : 0;

    return {
      totalGrams: Math.round(totalGrams),
      totalKcal: Math.round(totalKcal),
      totalCarbs: +totalCarbs.toFixed(1),
      totalProtein: +totalProtein.toFixed(1),
      totalFat: +totalFat.toFixed(1),
      kcalPer100g,
      carbsPer100g,
      proteinPer100g,
      fatPer100g
    };
  }

  function updateRecipeSummaryOnly() {
    const t = calcRecipeTotals();
    dom.recipeTotalKcal.textContent = t.totalKcal;
    dom.recipeSumSub.textContent = `总重 ${t.totalGrams}g · 折合 ${t.kcalPer100g} kcal/100g`;
    dom.recipeTotalCarbs.textContent = t.totalCarbs;
    dom.recipeTotalProtein.textContent = t.totalProtein;
    dom.recipeTotalFat.textContent = t.totalFat;
  }

  function renderRecipeDraft() {
    updateRecipeSummaryOnly();
    dom.recipeIngredientsList.innerHTML = state.recipeDraft.map((ing, idx) => {
      const nut = calcNutrition(ing, ing.grams);
      return `
        <div class="recipe-ing-row" data-ing-idx="${idx}">
          <input type="checkbox" class="recipe-ing-check" data-ing-check="${idx}" ${ing.checked ? 'checked' : ''} />
          <div class="recipe-ing-info">
            <div class="recipe-ing-name">${ing.emoji} ${escapeHTML(ing.name)}</div>
            <div class="recipe-ing-kcal">${nut.kcal} kcal · 蛋 ${nut.protein}g</div>
          </div>
          <div class="recipe-ing-grams">
            <input type="number" inputmode="decimal" min="1" max="5000" value="${ing.grams}" data-ing-grams="${idx}" />
            <span>g</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function saveRecipeToLibrary() {
    const name = dom.recipeName.value.trim();
    if (!name) {
      showToast('请给这道菜谱起个名字，如「我家番茄炒蛋」');
      dom.recipeName.focus();
      return;
    }

    const activeIngs = state.recipeDraft.filter((x) => x.checked && x.grams > 0);
    if (activeIngs.length === 0) {
      showToast('请至少勾选一项原料');
      return;
    }

    const t = calcRecipeTotals();
    const unitName = dom.recipeUnitName.value.trim() || '1盘';
    const category = dom.recipeCategory.value || 'dish';
    const emoji = dom.recipeEmojiSelect.value || '🍳';

    const ingSummary = activeIngs
      .map((x) => `${x.name.replace(/[（(][^）)]*[）)]/g, '')} ${Math.round(x.grams)}g`)
      .join(' + ');

    const newRecipe = {
      id: `custom_recipe_${Date.now()}`,
      name,
      alias: `菜谱 组合菜 自定义 ${name} ${activeIngs.map((x) => x.name).join(' ')}`,
      category,
      emoji,
      kcal: t.kcalPer100g,
      carbs: t.carbsPer100g,
      protein: t.proteinPer100g,
      fat: t.fatPer100g,
      unitName,
      unitGrams: Math.max(1, t.totalGrams),
      tip: `📖 组合菜谱（整份 ${t.totalGrams}g ≈ ${t.totalKcal} kcal）：${ingSummary}。吃不完可按 0.5 份等比例折算！`,
      recipeIngredients: activeIngs.map((x) => ({
        foodId: x.foodId,
        name: x.name,
        grams: Math.round(x.grams)
      })),
      isCustom: true,
      isRecipe: true
    };

    state.customFoods.unshift(newRecipe);
    saveCustomFoods();
    closeRecipeSheet();
    renderLookupList(true);
    showToast(`📖 已保存菜谱「${name}」（整份 ${t.totalKcal} kcal）`);
  }

  // ==================== Sheet 5：📝 文本离线导入菜谱 ====================
  function openTextImportSheet() {
    dom.tiStepInput.classList.remove('hidden');
    dom.tiInputFooter.classList.remove('hidden');
    dom.tiStepReview.classList.add('hidden');
    dom.tiReviewFooter.classList.add('hidden');
    showSheet(dom.textImportBackdrop, dom.textImportSheet);
  }

  function closeTextImportSheet() {
    hideSheet(dom.textImportBackdrop, dom.textImportSheet);
  }

  function getTextImportPendingItems() {
    return state.textImport.items.filter(
      (it) => it.checked && !it.ignoredZeroCal && (it.status === 'unmatched' || it.status === 'needs_weight')
    );
  }

  function calcTextImportTotals() {
    let totalGrams = 0;
    let totalKcal = 0;
    let totalCarbs = 0;
    let totalProtein = 0;
    let totalFat = 0;

    state.textImport.items.forEach((it) => {
      if (!it.checked || it.ignoredZeroCal || it.status !== 'matched' || !it.food || !it.grams || it.grams <= 0) return;
      const nut = calcNutrition(it.food, it.grams);
      totalGrams += it.grams;
      totalKcal += nut.kcal;
      totalCarbs += nut.carbs;
      totalProtein += nut.protein;
      totalFat += nut.fat;
    });

    const kcalPer100g = totalGrams > 0 ? Math.round((totalKcal / totalGrams) * 100) : 0;
    return {
      totalGrams: Math.round(totalGrams),
      totalKcal: Math.round(totalKcal),
      totalCarbs: +totalCarbs.toFixed(1),
      totalProtein: +totalProtein.toFixed(1),
      totalFat: +totalFat.toFixed(1),
      kcalPer100g,
      carbsPer100g: totalGrams > 0 ? +((totalCarbs / totalGrams) * 100).toFixed(1) : 0,
      proteinPer100g: totalGrams > 0 ? +((totalProtein / totalGrams) * 100).toFixed(1) : 0,
      fatPer100g: totalGrams > 0 ? +((totalFat / totalGrams) * 100).toFixed(1) : 0
    };
  }

  function updateTextImportSummary() {
    const t = calcTextImportTotals();
    const pending = getTextImportPendingItems();
    const unmatchedCount = state.textImport.items.filter((it) => it.checked && !it.ignoredZeroCal && it.status === 'unmatched').length;

    dom.tiTotalKcal.textContent = t.totalKcal;
    dom.tiSumSub.textContent = unmatchedCount > 0
      ? `总重 ${t.totalGrams}g · 折合 ${t.kcalPer100g} kcal/100g（尚未含 ${unmatchedCount} 项未匹配原料）`
      : `总重 ${t.totalGrams}g · 折合 ${t.kcalPer100g} kcal/100g`;
    dom.tiTotalCarbs.textContent = t.totalCarbs;
    dom.tiTotalProtein.textContent = t.totalProtein;
    dom.tiTotalFat.textContent = t.totalFat;

    const blocked = pending.length > 0;
    dom.tiBlockerHint.classList.toggle('hidden', !blocked);
    if (blocked) {
      dom.tiBlockerHint.textContent = `还有 ${pending.length} 项原料/用量待确认（未处理前禁止保存）`;
    }
    dom.tiBtnSaveRecipe.disabled = blocked;
    dom.tiBtnSaveAndPlate.disabled = blocked;
    dom.tiBtnBatchPlate.disabled = blocked;
    dom.tiBtnMergeRecipe.disabled = blocked;
  }

  function renderTextImportReview() {
    const { mode, items } = state.textImport;
    const isDishList = mode === 'dish_list';

    dom.tiModeBadge.textContent = isDishList ? '🍽️ 纯菜名清单模式' : '📖 配方菜谱模式';
    dom.tiRecipeMeta.classList.toggle('hidden', isDishList);
    dom.tiRecipeActions.classList.toggle('hidden', isDishList);
    dom.tiDishlistActions.classList.toggle('hidden', !isDishList);

    const matchedItems = items.filter((it) => it.status === 'matched' && !it.ignoredZeroCal);
    const needsWeightItems = items.filter((it) => it.status === 'needs_weight' && !it.ignoredZeroCal);
    const unmatchedItems = items.filter((it) => it.status === 'unmatched' && !it.ignoredZeroCal);
    const ignoredItems = items.filter((it) => it.ignoredZeroCal);

    let html = '';

    if (matchedItems.length > 0) {
      const title = isDishList
        ? `🟢 菜品清单预览（${matchedItems.length} 项 · 按库内常见份量，可逐项改克数）`
        : `🟢 已匹配且用量明确（${matchedItems.length} 项）`;
      html += `<div class="ti-sec-title green">${title}</div>`;
      html += matchedItems.map((it) => {
        const nut = calcNutrition(it.food, it.grams || 0);
        const candBtns = (it.candidates || []).length > 1
          ? it.candidates.map((c) => `
              <button type="button" class="ti-mini-btn" data-ti-cand="${it.uid}" data-food-id="${c.id}">
                ${c.id === it.food.id ? '✓ ' : ''}${escapeHTML(c.name)}
              </button>
            `).join('')
          : '';
        return `
          <div class="ti-item-card" data-ti-uid="${it.uid}">
            <div class="ti-item-head">
              ${isDishList ? `<input type="checkbox" class="recipe-ing-check" data-ti-check="${it.uid}" ${it.checked ? 'checked' : ''} />` : ''}
              <div class="ti-item-main">
                <div class="ti-item-title">${it.food.emoji} ${escapeHTML(it.food.name)} <span style="font-weight:400;color:var(--secondary-label);font-size:12px;">← ${escapeHTML(it.raw)}</span></div>
                <div class="ti-item-sub">${escapeHTML(it.basis)} · <strong data-ti-nut="${it.uid}">${nut.kcal} kcal / 蛋 ${nut.protein}g</strong></div>
              </div>
              <div class="recipe-ing-grams">
                <input type="number" inputmode="decimal" min="1" max="5000" value="${it.grams}" data-ti-grams="${it.uid}" />
                <span>g</span>
              </div>
            </div>
            <div class="ti-item-actions">
              ${candBtns}
              <button type="button" class="ti-mini-btn" data-ti-pick="${it.uid}">🔍 换食物</button>
              ${isDishList ? `<button type="button" class="ti-mini-btn danger" data-ti-remove="${it.uid}">移除</button>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    if (needsWeightItems.length > 0) {
      html += `<div class="ti-sec-title yellow">🟡 用量待确认（${needsWeightItems.length} 项 · 绝不静默瞎猜）</div>`;
      html += needsWeightItems.map((it) => `
        <div class="ti-item-card yellow" data-ti-uid="${it.uid}">
          <div class="ti-item-head">
            <div class="ti-item-main">
              <div class="ti-item-title">${it.food.emoji} ${escapeHTML(it.food.name)} <span style="font-weight:400;color:var(--secondary-label);font-size:12px;">← ${escapeHTML(it.raw)}</span></div>
              <div class="ti-item-sub">${escapeHTML(it.basis)}</div>
            </div>
          </div>
          <div class="ti-item-actions">
            ${[5, 10, 15, 30, 50, 100].map((g) => `
              <button type="button" class="ti-mini-btn warn" data-ti-quickg="${it.uid}" data-g="${g}">${g}g</button>
            `).join('')}
            <div class="recipe-ing-grams">
              <input type="number" inputmode="decimal" min="1" max="5000" placeholder="克数" data-ti-manualg="${it.uid}" />
              <button type="button" class="ti-mini-btn" data-ti-applyg="${it.uid}">确认</button>
            </div>
            ${it.isZeroCalSeasoning ? `<button type="button" class="ti-mini-btn" data-ti-ignore="${it.uid}">0 卡忽略</button>` : ''}
          </div>
        </div>
      `).join('');
    }

    if (unmatchedItems.length > 0) {
      html += `<div class="ti-sec-title red">🔴 未匹配原料（${unmatchedItems.length} 项 · 必须显式处理）</div>`;
      html += unmatchedItems.map((it) => `
        <div class="ti-item-card red" data-ti-uid="${it.uid}">
          <div class="ti-item-head">
            <div class="ti-item-main">
              <div class="ti-item-title">❓ ${escapeHTML(it.rawName)} ${it.grams ? `<span style="color:var(--ios-blue);font-size:12px;">(${it.grams}g)</span>` : ''}</div>
              <div class="ti-item-sub">${escapeHTML(it.basis)}</div>
            </div>
          </div>
          <div class="ti-item-actions">
            <button type="button" class="ti-mini-btn" data-ti-pick="${it.uid}">🔍 手动指认</button>
            <button type="button" class="ti-mini-btn" data-ti-create="${it.uid}">＋ 新建食物</button>
            <button type="button" class="ti-mini-btn" data-ti-ignore="${it.uid}">设为 0 卡忽略</button>
          </div>
        </div>
      `).join('');
    }

    if (ignoredItems.length > 0) {
      html += `<div class="ti-sec-title" style="color:var(--secondary-label);">⚪ 已确认 0 卡忽略（${ignoredItems.length} 项）</div>`;
      html += ignoredItems.map((it) => `
        <div class="ti-item-card ignored" data-ti-uid="${it.uid}">
          <div class="ti-item-head">
            <div class="ti-item-main">
              <div class="ti-item-title">${escapeHTML(it.rawName)}（已忽略 · 0 kcal）</div>
            </div>
            <button type="button" class="ti-mini-btn" data-ti-unignore="${it.uid}">撤销</button>
          </div>
        </div>
      `).join('');
    }

    if (!html) {
      html = '<p style="text-align:center;color:var(--secondary-label);padding:20px 0;">未解析出有效原料，请返回检查文本。</p>';
    }

    dom.tiSectionsContainer.innerHTML = html;
    updateTextImportSummary();
  }

  function runTextImportParse() {
    const raw = dom.tiInputText.value.trim();
    if (!raw) {
      showToast('请先粘贴或输入菜谱文本');
      dom.tiInputText.focus();
      return;
    }
    if (!window.RecipeParser) {
      showToast('离线解析模块未加载');
      return;
    }
    const parsed = window.RecipeParser.parseText(raw, getAllFoods());
    if (!parsed.items || parsed.items.length === 0) {
      showToast('未能识别出原料或菜品，请检查文本格式');
      return;
    }

    state.textImport = parsed;
    dom.tiRecipeName.value = parsed.recipeName || '';
    dom.tiUnitName.value = '1盘';
    dom.tiCategory.value = 'dish';
    dom.tiEmoji.value = '🍳';

    dom.tiStepInput.classList.add('hidden');
    dom.tiInputFooter.classList.add('hidden');
    dom.tiStepReview.classList.remove('hidden');
    dom.tiReviewFooter.classList.remove('hidden');

    renderTextImportReview();
  }

  function openManualPickModal(uid) {
    const item = state.textImport.items.find((x) => x.uid === uid);
    if (!item) return;

    const allFoods = getAllFoods();
    const renderPickList = (q) => {
      const kw = String(q || '').trim().toLowerCase();
      const list = kw
        ? allFoods.filter((f) => f.name.toLowerCase().includes(kw) || (f.alias || '').toLowerCase().includes(kw)).slice(0, 30)
        : allFoods.slice(0, 20);
      return list.map((f) => `
        <div class="ti-pick-row" data-pick-food="${f.id}">
          <span>${f.emoji} ${escapeHTML(f.name)}</span>
          <span style="color:var(--secondary-label);font-size:12px;">${f.kcal} kcal/100g</span>
        </div>
      `).join('') || '<div style="padding:12px;text-align:center;color:var(--secondary-label);">未找到匹配食物</div>';
    };

    openModal({
      title: `为「${item.rawName}」指认食物`,
      html: `
        <input id="ti-pick-search" class="ios-input" type="search" placeholder="输入关键字搜索 1,884+ 食物库..." value="${escapeHTML(item.rawName)}" />
        <div id="ti-pick-results" class="ti-pick-list">${renderPickList(item.rawName)}</div>
      `,
      actions: [{ text: '取消', cls: 'cancel' }]
    });

    const searchInp = $('#ti-pick-search');
    const resultsBox = $('#ti-pick-results');
    if (searchInp && resultsBox) {
      searchInp.addEventListener('input', () => {
        resultsBox.innerHTML = renderPickList(searchInp.value);
      });
      resultsBox.addEventListener('click', (e) => {
        const row = e.target.closest('[data-pick-food]');
        if (!row) return;
        const food = getFoodById(row.dataset.pickFood);
        if (!food) return;
        item.food = food;
        item.ignoredZeroCal = false;
        if (item.grams && item.grams > 0) {
          item.status = 'matched';
          item.basis = `已手动指认为「${food.name}」`;
        } else if (state.textImport.mode === 'dish_list') {
          item.grams = food.unitGrams || 100;
          item.status = 'matched';
          item.basis = `按常见份量（${food.unitName || `${item.grams}g`}）`;
        } else {
          item.status = 'needs_weight';
          item.basis = `已指认「${food.name}」，请填写克数`;
        }
        closeModal();
        renderTextImportReview();
      });
    }
  }

  function commitParsedRecipe(name, alsoAddToPlate) {
    const activeIngs = state.textImport.items.filter(
      (it) => it.checked && !it.ignoredZeroCal && it.status === 'matched' && it.food && it.grams > 0
    );
    if (activeIngs.length === 0) {
      showToast('请至少保留一项有效原料');
      return;
    }

    const t = calcTextImportTotals();
    const unitName = dom.tiUnitName.value.trim() || '1盘';
    const category = dom.tiCategory.value || 'dish';
    const emoji = dom.tiEmoji.value || '🍳';
    const ingSummary = activeIngs
      .map((x) => `${x.food.name.replace(/[（(][^）)]*[）)]/g, '')} ${Math.round(x.grams)}g`)
      .join(' + ');

    const newRecipe = {
      id: `custom_recipe_${Date.now()}`,
      name,
      alias: `菜谱 组合菜 文本导入 自定义 ${name} ${activeIngs.map((x) => x.food.name).join(' ')}`,
      category,
      emoji,
      kcal: t.kcalPer100g,
      carbs: t.carbsPer100g,
      protein: t.proteinPer100g,
      fat: t.fatPer100g,
      unitName,
      unitGrams: Math.max(1, t.totalGrams),
      tip: `📖 文本导入菜谱（整份 ${t.totalGrams}g ≈ ${t.totalKcal} kcal）：${ingSummary}。支持按 0.5 份折算！`,
      recipeIngredients: activeIngs.map((x) => ({
        foodId: x.food.id,
        name: x.food.name,
        grams: Math.round(x.grams)
      })),
      isCustom: true,
      isRecipe: true
    };

    state.customFoods.unshift(newRecipe);
    saveCustomFoods();
    if (alsoAddToPlate) {
      addToPlate(newRecipe.id, newRecipe.unitGrams, newRecipe.unitName, getSmartDefaultMeal(), newRecipe);
    }
    closeTextImportSheet();
    renderLookupList(true);
    showToast(`📖 已保存菜谱「${name}」（整份 ${t.totalKcal} kcal）`);
  }

  function saveParsedRecipe(alsoAddToPlate = false) {
    if (getTextImportPendingItems().length > 0) {
      showToast('请先处理所有未匹配或待确认用量项');
      return;
    }
    const name = dom.tiRecipeName.value.trim();
    if (!name) {
      showToast('请填写菜谱名称');
      dom.tiRecipeName.focus();
      return;
    }

    // Q5：重名禁止覆盖，弹窗提供跳过或改名另存（自动建议追加「（自制）」）
    const dup = findDuplicateFoodByName(name);
    if (dup) {
      const suggested = suggestUniqueRecipeName(name);
      openModal({
        title: `库内已存在「${name}」`,
        html: `<p style="margin:0;text-align:center;">为保护现有食物数据，不允许覆盖同名条目。你可以跳过保存，或自动改名为「${escapeHTML(suggested)}」另存。</p>`,
        actions: [
          { text: '跳过（不覆盖）', cls: 'cancel' },
          {
            text: `改名另存`,
            onClick: () => {
              dom.tiRecipeName.value = suggested;
              commitParsedRecipe(suggested, alsoAddToPlate);
            }
          }
        ]
      });
      return;
    }

    commitParsedRecipe(name, alsoAddToPlate);
  }

  function batchAddDishListToPlate() {
    if (getTextImportPendingItems().length > 0) {
      showToast('请先处理所有未匹配或待确认项');
      return;
    }
    const active = state.textImport.items.filter(
      (it) => it.checked && !it.ignoredZeroCal && it.status === 'matched' && it.food && it.grams > 0
    );
    if (active.length === 0) {
      showToast('请至少勾选一道菜品');
      return;
    }
    const meal = getSmartDefaultMeal();
    active.forEach((it) => {
      addToPlate(it.food.id, it.grams, it.unitLabel || `${Math.round(it.grams)}g`, meal, it.food);
    });
    closeTextImportSheet();
    showToast(`✓ 已批量加入 ${active.length} 项到今日餐盘`);
  }

  // ==================== JSON 导出 / 导入备份（含自定义食物与历史记录） ====================
  function buildBackupPayload() {
    return {
      app: 'QingKaLookup',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      data: {
        customFoods: state.customFoods,
        favorites: state.favorites,
        plateHistory: state.plateHistory,
        hiddenFoodIds: state.hiddenFoodIds,
        categoryOverrides: state.categoryOverrides,
        dailyGoal: state.dailyGoal,
        proteinGoal: state.proteinGoal
      }
    };
  }

  function applyBackupPayload(raw) {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const payload = parsed && parsed.data ? parsed.data : parsed;
    if (!payload || typeof payload !== 'object') {
      throw new Error('JSON 结构无效');
    }

    if (Array.isArray(payload.customFoods)) {
      state.customFoods = payload.customFoods.map((item) => ({
        ...item,
        id: item.id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        isCustom: true
      }));
      saveCustomFoods();
    }
    if (Array.isArray(payload.favorites)) {
      state.favorites = payload.favorites;
      saveFavorites();
    }
    if (payload.plateHistory && typeof payload.plateHistory === 'object' && !Array.isArray(payload.plateHistory)) {
      state.plateHistory = payload.plateHistory;
      savePlate();
    }
    if (Array.isArray(payload.hiddenFoodIds)) {
      state.hiddenFoodIds = payload.hiddenFoodIds;
      saveHiddenFoods();
    }
    if (payload.categoryOverrides && typeof payload.categoryOverrides === 'object') {
      state.categoryOverrides = payload.categoryOverrides;
      saveCategoryOverrides();
    }
    if (Number(payload.dailyGoal) >= 500) {
      state.dailyGoal = Math.round(Number(payload.dailyGoal));
    }
    if (Number(payload.proteinGoal) >= 20) {
      state.proteinGoal = Math.round(Number(payload.proteinGoal));
    }
    saveGoal();

    renderLookupList(true);
    renderFavoritesList();
    renderPlate();
    return {
      customCount: state.customFoods.length,
      daysCount: Object.keys(state.plateHistory).length
    };
  }

  function showBackupModal() {
    const jsonStr = JSON.stringify(buildBackupPayload(), null, 2);
    openModal({
      title: '💾 数据导出 / 导入 (JSON)',
      html: `
        <p style="margin:0 0 8px;font-size:12px;">包含全部 <strong>${state.customFoods.length}</strong> 条自定义食物/菜谱、收藏、餐盘历史与目标设置。</p>
        <div class="backup-actions-row">
          <button type="button" id="btn-export-download" class="ios-btn-secondary" style="padding:8px;font-size:12px;">📤 下载 JSON</button>
          <button type="button" id="btn-export-copy" class="ios-btn-secondary" style="padding:8px;font-size:12px;">📋 复制 JSON</button>
        </div>
        <div class="goal-section-label">导入恢复（选择 .json 文件或粘贴内容）</div>
        <input id="backup-file-input" type="file" accept=".json,application/json" class="hidden" />
        <button type="button" id="btn-import-file" class="ios-btn-secondary" style="width:100%;padding:8px;font-size:12px;margin-bottom:8px;">📂 选择本地 JSON 文件导入</button>
        <textarea id="backup-json-textarea" class="backup-textarea" placeholder="或直接在此粘贴之前导出的 JSON 备份内容...">${escapeHTML(jsonStr)}</textarea>
      `,
      actions: [
        { text: '关闭', cls: 'cancel' },
        {
          text: '导入恢复',
          onClick: () => {
            const txt = ($('#backup-json-textarea')?.value || '').trim();
            if (!txt) {
              showToast('请先粘贴或选择 JSON 备份');
              return false;
            }
            try {
              const res = applyBackupPayload(txt);
              showToast(`✓ 已恢复 ${res.customCount} 条自定义食物 · ${res.daysCount} 天餐盘`);
            } catch (err) {
              showToast(`导入失败：${err.message || 'JSON 格式错误'}`);
              return false;
            }
          }
        }
      ]
    });

    $('#btn-export-download')?.addEventListener('click', () => {
      if (window.AndroidBridge?.exportJsonFile) {
        const reqId = `exp_${Date.now()}`;
        window.__onNativeExportResult = (res) => {
          if (res && res.success) {
            showToast(`📤 已保存 ${res.displayName || 'JSON 备份'}`);
          } else if (res && res.error && res.error !== 'cancelled') {
            showToast(`导出失败：${res.error}`);
          }
        };
        window.AndroidBridge.exportJsonFile(reqId, `qingka-backup-${getTodayStr()}.json`, jsonStr, 'save');
        return;
      }
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qingka-backup-${getTodayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('📤 已导出 JSON 备份文件');
    });

    $('#btn-export-copy')?.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(jsonStr);
        } else {
          const ta = $('#backup-json-textarea');
          ta.select();
          document.execCommand('copy');
        }
        showToast('📋 已复制全部 JSON 备份到剪贴板');
      } catch {
        showToast('请长按下方文本框手动全选复制');
      }
    });

    $('#btn-import-file')?.addEventListener('click', () => {
      $('#backup-file-input')?.click();
    });

    $('#backup-file-input')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const res = applyBackupPayload(ev.target.result);
          closeModal();
          showToast(`✓ 导入成功：${res.customCount} 条自定义食物 · ${res.daysCount} 天餐盘`);
        } catch (err) {
          showToast(`导入失败：${err.message || 'JSON 格式错误'}`);
        }
      };
      reader.readAsText(file, 'utf-8');
    });
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
        <div class="legend-item">
          <span>🔴</span>
          <div><strong>红灯高卡（>250 kcal / 100g）</strong><br/>如坚果、油炸零食、五花肉、蛋糕等能量密度高，建议严格控量浅尝。</div>
        </div>
        <div style="text-align:center;font-size:11px;color:var(--tertiary-label);margin-top:8px;">
          轻卡速查 ${APP_VERSION} · 左滑删除 · 右滑收藏
        </div>
      `,
      actions: [{ text: '知道了' }]
    });
  }

  function showGoalModal() {
    const kcalPresets = [
      { label: '减脂 1400', val: 1400 },
      { label: '标准 1800', val: 1800 },
      { label: '增肌 2300', val: 2300 }
    ];
    const proteinPresets = [
      { label: '日常 75g', val: 75 },
      { label: '减脂 100g', val: 100 },
      { label: '增肌 140g', val: 140 }
    ];

    openModal({
      title: '🎯 设置每日营养目标',
      html: `
        <div class="goal-section-label">🔥 每日热量目标（kcal）</div>
        <div class="goal-presets">
          ${kcalPresets.map((p) => `
            <button type="button" class="goal-preset-btn ${state.dailyGoal === p.val ? 'active' : ''}" data-goal-preset="${p.val}">
              ${p.label}
            </button>
          `).join('')}
        </div>
        <input id="goal-custom-input" class="goal-input" type="number" inputmode="numeric" min="500" max="8000" step="50" value="${state.dailyGoal}" />

        <div class="goal-section-label">🥩 每日蛋白质目标（g）</div>
        <div class="goal-presets">
          ${proteinPresets.map((p) => `
            <button type="button" class="goal-preset-btn ${state.proteinGoal === p.val ? 'active' : ''}" data-protein-preset="${p.val}">
              ${p.label}
            </button>
          `).join('')}
        </div>
        <input id="protein-goal-input" class="goal-input" type="number" inputmode="numeric" min="20" max="400" step="5" value="${state.proteinGoal}" />
      `,
      actions: [
        { text: '取消', cls: 'cancel' },
        {
          text: '保存',
          onClick: () => {
            const kcalVal = Math.round(Number($('#goal-custom-input').value));
            const protVal = Math.round(Number($('#protein-goal-input').value));
            if (!kcalVal || kcalVal < 500 || kcalVal > 8000) {
              showToast('请输入 500 ~ 8000 之间的热量目标');
              return false;
            }
            if (!protVal || protVal < 20 || protVal > 400) {
              showToast('请输入 20 ~ 400g 之间的蛋白质目标');
              return false;
            }
            state.dailyGoal = kcalVal;
            state.proteinGoal = protVal;
            saveGoal();
            renderPlate();
            showToast(`🎯 目标已更新：${kcalVal} kcal · 蛋白 ${protVal}g`);
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

    dom.modalContent.querySelectorAll('[data-protein-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = Number(btn.dataset.proteinPreset);
        $('#protein-goal-input').value = val;
        dom.modalContent.querySelectorAll('[data-protein-preset]').forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
      });
    });
  }

  function showHistoryModal() {
    const today = getTodayStr();
    const dates = Object.keys(state.plateHistory)
      .filter((d) => Array.isArray(state.plateHistory[d]) && state.plateHistory[d].length > 0)
      .sort((a, b) => b.localeCompare(a));

    if (!dates.includes(today)) dates.unshift(today);

    const listHTML = dates.map((d) => {
      const items = getPlateItemsForDate(d);
      let kcal = 0;
      let prot = 0;
      items.forEach((it) => {
        const food = it.snapshot || getFoodById(it.foodId);
        if (!food) return;
        const nut = calcNutrition(food, it.grams);
        kcal += nut.kcal;
        prot += nut.protein;
      });
      return `
        <button type="button" class="history-date-row ${d === state.plateDate ? 'active' : ''}" data-pick-date="${d}">
          <span>${formatDateDisplay(d)}</span>
          <span class="history-date-meta">${items.length > 0 ? `${kcal} kcal · 蛋 ${prot.toFixed(0)}g` : '暂无记录'}</span>
        </button>
      `;
    }).join('');

    openModal({
      title: '📅 餐盘历史记录',
      html: `
        <div class="history-date-list">${listHTML}</div>
        <div class="goal-section-label">或跳转到任意日期</div>
        <input id="history-date-picker" class="ios-input" type="date" max="${today}" value="${state.plateDate}" />
      `,
      actions: [{ text: '关闭' }]
    });

    dom.modalContent.querySelectorAll('[data-pick-date]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.plateDate = btn.dataset.pickDate;
        renderPlate();
        closeModal();
      });
    });

    const picker = $('#history-date-picker');
    if (picker) {
      picker.addEventListener('change', (e) => {
        if (e.target.value && e.target.value <= today) {
          state.plateDate = e.target.value;
          renderPlate();
          closeModal();
        }
      });
    }
  }

  function showClearPlateConfirm() {
    const items = getCurrentPlateItems();
    const label = formatDateDisplay(state.plateDate);
    if (items.length === 0) {
      showToast(`${label} 餐盘已经是空的啦`);
      return;
    }
    openModal({
      title: `清空 ${label} 记录？`,
      html: `<p style="margin:0;text-align:center;">将移除 ${label} 已记录的全部食物（其他日期的历史记录不受影响）。</p>`,
      actions: [
        { text: '取消', cls: 'cancel' },
        {
          text: '确认清空',
          cls: 'danger',
          onClick: () => {
            setPlateItemsForDate(state.plateDate, []);
            renderPlate();
            showToast(`已清空 ${label} 餐盘`);
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

    dom.btnBackup.addEventListener('click', showBackupModal);
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

    // 列表点击（含左滑删除/编辑、右滑收藏、批量勾选、加载更多与 AI 本地相似列表）
    [dom.foodList, dom.favoritesList, dom.aiLocalMatchesList].forEach((listEl) => {
      listEl.addEventListener('click', (e) => {
        if (Date.now() < swipeSuppressClickUntil) return;

        const moreBtn = e.target.closest('[data-load-more]');
        if (moreBtn) {
          lookupDisplayLimit += 80;
          renderLookupList(false);
          return;
        }

        const favBtn = e.target.closest('[data-swipe-fav]');
        if (favBtn) {
          e.stopPropagation();
          closeAllSwipes();
          toggleFavorite(favBtn.dataset.swipeFav);
          return;
        }

        const unfavBtn = e.target.closest('[data-swipe-unfav]');
        if (unfavBtn) {
          e.stopPropagation();
          closeAllSwipes();
          toggleFavorite(unfavBtn.dataset.swipeUnfav);
          return;
        }
        const editFoodBtn = e.target.closest('[data-swipe-edit-food]');
        if (editFoodBtn) {
          e.stopPropagation();
          closeAllSwipes();
          const food = getFoodById(editFoodBtn.dataset.swipeEditFood);
          if (food) openCustomFoodSheet(food);
          return;
        }
        const delFoodBtn = e.target.closest('[data-swipe-delete-food]');
        if (delFoodBtn) {
          e.stopPropagation();
          closeAllSwipes();
          removeFoodFromLibrary(delFoodBtn.dataset.swipeDeleteFood);
          return;
        }
        const quickBtn = e.target.closest('[data-quick-add]');
        if (quickBtn) {
          e.stopPropagation();
          quickAddFood(quickBtn.dataset.quickAdd);
          return;
        }
        const row = e.target.closest('.food-row');
        if (row) {
          if (listEl === dom.foodList && state.batchMode) {
            const fid = row.dataset.foodId;
            if (state.selectedFoodIds.has(fid)) {
              state.selectedFoodIds.delete(fid);
            } else {
              state.selectedFoodIds.add(fid);
            }
            row.classList.toggle('selected', state.selectedFoodIds.has(fid));
            const chk = row.querySelector('.batch-check');
            if (chk) {
              const checked = state.selectedFoodIds.has(fid);
              chk.classList.toggle('checked', checked);
              chk.textContent = checked ? '✓' : '';
            }
            updateBatchBarUI();
            return;
          }
          if (openSwipeItem) {
            closeAllSwipes();
            return;
          }
          if (listEl === dom.aiLocalMatchesList) closeCameraSheet();
          openFoodSheet(row.dataset.foodId);
        }
      });
    });

    // 批量编辑工具栏事件
    dom.btnBatchMode.addEventListener('click', () => toggleBatchMode());
    dom.btnBatchDone.addEventListener('click', () => toggleBatchMode(false));
    dom.btnRestoreHidden.addEventListener('click', restoreHiddenFoods);
    dom.btnBatchSelectAll.addEventListener('click', () => {
      const visibleIds = lastFilteredFoods.slice(0, lookupDisplayLimit).map((f) => f.id);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => state.selectedFoodIds.has(id));
      if (allSelected) {
        visibleIds.forEach((id) => state.selectedFoodIds.delete(id));
      } else {
        visibleIds.forEach((id) => state.selectedFoodIds.add(id));
      }
      renderLookupList(false);
    });
    dom.btnBatchFav.addEventListener('click', batchFavoriteSelected);
    dom.btnBatchCat.addEventListener('click', batchChangeCategorySelected);
    dom.btnBatchDelete.addEventListener('click', batchDeleteSelected);

    dom.btnGoLookup.addEventListener('click', () => switchTab('lookup'));
    dom.btnPlateGoLookup.addEventListener('click', () => switchTab('lookup'));

    dom.tabItems.forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // 餐盘页（日期切换 / 目标 / 蛋白质进度 / 改份量 / 删除）
    dom.btnPrevDay.addEventListener('click', () => {
      state.plateDate = shiftDateStr(state.plateDate, -1);
      renderPlate();
    });

    dom.btnNextDay.addEventListener('click', () => {
      const next = shiftDateStr(state.plateDate, 1);
      if (next <= getTodayStr()) {
        state.plateDate = next;
        renderPlate();
      }
    });

    dom.btnPickHistory.addEventListener('click', showHistoryModal);

    dom.btnBackToday.addEventListener('click', () => {
      state.plateDate = getTodayStr();
      renderPlate();
    });

    dom.btnSaveRecipe.addEventListener('click', () => openRecipeSheet(null));
    dom.btnEditGoal.addEventListener('click', showGoalModal);
    dom.summaryGoalBtn.addEventListener('click', showGoalModal);
    if (dom.proteinGoalBox) {
      dom.proteinGoalBox.addEventListener('click', showGoalModal);
    }
    dom.btnClearPlate.addEventListener('click', showClearPlateConfirm);

    dom.plateMealsContainer.addEventListener('click', (e) => {
      if (Date.now() < swipeSuppressClickUntil) return;

      const mealRecipeBtn = e.target.closest('[data-save-meal-recipe]');
      if (mealRecipeBtn) {
        e.stopPropagation();
        openRecipeSheet(mealRecipeBtn.dataset.saveMealRecipe);
        return;
      }

      const delBtn = e.target.closest('[data-delete-plate]');
      if (delBtn) {
        e.stopPropagation();
        closeAllSwipes();
        removeFromPlate(delBtn.dataset.deletePlate);
        return;
      }
      const editBtn = e.target.closest('[data-edit-plate]');
      if (editBtn) {
        if (openSwipeItem && !editBtn.classList.contains('swipe-btn')) {
          closeAllSwipes();
          return;
        }
        closeAllSwipes();
        openEditPlateSheet(editBtn.dataset.editPlate);
      }
    });

    // Sheet 1：详情页
    dom.detailBackdrop.addEventListener('click', closeFoodSheet);
    dom.sheetCloseBtn.addEventListener('click', closeFoodSheet);
    dom.sheetGrabber.addEventListener('click', closeFoodSheet);

    dom.sheetFavBtn.addEventListener('click', () => {
      if (state.sheet.food) toggleFavorite(state.sheet.food.id);
    });

    dom.sheetForkBtn.addEventListener('click', () => {
      if (!state.sheet.food) return;
      const src = state.sheet.food;
      closeFoodSheet();
      setTimeout(() => {
        const baseName = src.name.replace(/[（(][^）)]*[）)]/g, '').trim() || src.name;
        openCustomFoodSheet({
          name: `${baseName}（我的）`,
          emoji: src.emoji || '🍱',
          category: src.category || 'dish',
          kcal: src.kcal,
          carbs: src.carbs,
          protein: src.protein,
          fat: src.fat,
          unitName: src.unitName || '1份',
          unitGrams: src.unitGrams || 100,
          tip: `基于「${src.name}」自建，按实际包装标签与份量调整。`
        });
      }, 220);
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

    dom.sheetDeletePlateBtn.addEventListener('click', () => {
      if (state.sheet.editingPlateUid) {
        removeFromPlate(state.sheet.editingPlateUid);
        closeFoodSheet();
      }
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

      if (state.sheet.editingPlateUid) {
        updatePlateItem(state.sheet.editingPlateUid, grams, label, state.sheet.meal);
      } else {
        addToPlate(food.id, grams, label, state.sheet.meal);
      }
      closeFoodSheet();
    });

    // Sheet 2：自定义食物表单
    dom.customBackdrop.addEventListener('click', closeCustomFoodSheet);
    dom.customCloseBtn.addEventListener('click', closeCustomFoodSheet);
    dom.customGrabber.addEventListener('click', closeCustomFoodSheet);

    dom.cfDeleteBtn.addEventListener('click', () => {
      const editId = dom.cfId.value;
      if (editId) {
        closeCustomFoodSheet();
        setTimeout(() => deleteCustomFood(editId), 200);
      }
    });

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
      dom.aiGeminiFields.classList.toggle('hidden', e.target.value === 'openai');
      dom.aiOpenAIFields.classList.toggle('hidden', e.target.value !== 'openai');
    });

    dom.btnSaveAIConfig.addEventListener('click', () => {
      state.aiConfig = {
        provider: dom.aiProvider.value,
        geminiModel: dom.aiGeminiModel.value.trim() || DEFAULT_GEMINI_MODEL,
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

    dom.btnAIRetry.addEventListener('click', () => {
      if (!state.lastImagePayload) return;
      runRecognitionPipeline(state.lastImagePayload.base64, state.lastImagePayload.mimeType, false);
    });

    dom.btnForceCloudAI.addEventListener('click', () => {
      if (!state.lastImagePayload) return;
      runRecognitionPipeline(state.lastImagePayload.base64, state.lastImagePayload.mimeType, true);
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

    // Sheet 4：组合菜谱
    dom.recipeBackdrop.addEventListener('click', closeRecipeSheet);
    dom.recipeCloseBtn.addEventListener('click', closeRecipeSheet);
    dom.recipeGrabber.addEventListener('click', closeRecipeSheet);

    dom.recipeEmojiSelect.addEventListener('change', (e) => {
      dom.recipeEmojiPreview.textContent = e.target.value;
    });

    dom.recipeSeasoningChips.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-season]');
      if (btn) addSeasoningToDraft(btn.dataset.season);
    });

    dom.recipeIngredientsList.addEventListener('change', (e) => {
      const chk = e.target.closest('[data-ing-check]');
      if (chk) {
        const idx = Number(chk.dataset.ingCheck);
        if (state.recipeDraft[idx]) {
          state.recipeDraft[idx].checked = chk.checked;
          updateRecipeSummaryOnly();
        }
      }
    });

    dom.recipeIngredientsList.addEventListener('input', (e) => {
      const inp = e.target.closest('[data-ing-grams]');
      if (inp) {
        const idx = Number(inp.dataset.ingGrams);
        if (state.recipeDraft[idx]) {
          state.recipeDraft[idx].grams = Math.max(0, parseFloat(inp.value) || 0);
          const row = inp.closest('.recipe-ing-row');
          const nut = calcNutrition(state.recipeDraft[idx], state.recipeDraft[idx].grams);
          const kcalEl = row && row.querySelector('.recipe-ing-kcal');
          if (kcalEl) kcalEl.textContent = `${nut.kcal} kcal · 蛋 ${nut.protein}g`;
          updateRecipeSummaryOnly();
        }
      }
    });

    dom.btnConfirmSaveRecipe.addEventListener('click', saveRecipeToLibrary);
    dom.btnRecipeToTextImport.addEventListener('click', () => {
      closeRecipeSheet();
      setTimeout(openTextImportSheet, 220);
    });

    // Sheet 5：文本离线导入
    dom.btnTextImport.addEventListener('click', openTextImportSheet);
    dom.textImportBackdrop.addEventListener('click', closeTextImportSheet);
    dom.textImportCloseBtn.addEventListener('click', closeTextImportSheet);
    dom.textImportGrabber.addEventListener('click', closeTextImportSheet);

    dom.tiBtnPaste.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          dom.tiInputText.value = text;
          showToast('✓ 已粘贴剪贴板文本');
        } else {
          showToast('剪贴板为空');
        }
      } catch {
        showToast('请长按输入框直接粘贴');
      }
    });

    dom.tiBtnSample.addEventListener('click', () => {
      dom.tiInputText.value = '黑椒鸡胸炒西兰花\n原料：鸡胸肉 200g、西兰花 150克、橄榄油 1勺、生抽 1勺\n做法：鸡胸肉切丁腌制，热锅放油炒熟，加入焯水西兰花翻炒出锅。';
    });

    dom.tiBtnClear.addEventListener('click', () => {
      dom.tiInputText.value = '';
      dom.tiInputText.focus();
    });

    dom.tiBtnParse.addEventListener('click', runTextImportParse);

    dom.tiBtnBackInput.addEventListener('click', () => {
      dom.tiStepReview.classList.add('hidden');
      dom.tiReviewFooter.classList.add('hidden');
      dom.tiStepInput.classList.remove('hidden');
      dom.tiInputFooter.classList.remove('hidden');
    });

    dom.tiSectionsContainer.addEventListener('change', (e) => {
      const chk = e.target.closest('[data-ti-check]');
      if (chk) {
        const item = state.textImport.items.find((x) => x.uid === chk.dataset.tiCheck);
        if (item) {
          item.checked = chk.checked;
          updateTextImportSummary();
        }
      }
    });

    dom.tiSectionsContainer.addEventListener('input', (e) => {
      const inp = e.target.closest('[data-ti-grams]');
      if (inp) {
        const item = state.textImport.items.find((x) => x.uid === inp.dataset.tiGrams);
        if (item && item.food) {
          item.grams = Math.max(0, parseFloat(inp.value) || 0);
          item.unitLabel = `${item.grams}g`;
          const nut = calcNutrition(item.food, item.grams);
          const nutEl = dom.tiSectionsContainer.querySelector(`[data-ti-nut="${item.uid}"]`);
          if (nutEl) nutEl.textContent = `${nut.kcal} kcal / 蛋 ${nut.protein}g`;
          updateTextImportSummary();
        }
      }
    });

    dom.tiSectionsContainer.addEventListener('click', (e) => {
      const candBtn = e.target.closest('[data-ti-cand]');
      if (candBtn) {
        const item = state.textImport.items.find((x) => x.uid === candBtn.dataset.tiCand);
        const food = getFoodById(candBtn.dataset.foodId);
        if (item && food) {
          item.food = food;
          renderTextImportReview();
        }
        return;
      }

      const pickBtn = e.target.closest('[data-ti-pick]');
      if (pickBtn) {
        openManualPickModal(pickBtn.dataset.tiPick);
        return;
      }

      const createBtn = e.target.closest('[data-ti-create]');
      if (createBtn) {
        const item = state.textImport.items.find((x) => x.uid === createBtn.dataset.tiCreate);
        if (!item) return;
        state.customFoodCallback = (newFood) => {
          item.food = newFood;
          item.ignoredZeroCal = false;
          if (item.grams && item.grams > 0) {
            item.status = 'matched';
            item.basis = `已新建食物「${newFood.name}」`;
          } else {
            item.status = 'needs_weight';
            item.basis = `已新建「${newFood.name}」，请填写克数`;
          }
          renderTextImportReview();
        };
        openCustomFoodSheet({ name: item.rawName });
        return;
      }

      const quickBtn = e.target.closest('[data-ti-quickg]');
      if (quickBtn) {
        const item = state.textImport.items.find((x) => x.uid === quickBtn.dataset.tiQuickg);
        const g = Number(quickBtn.dataset.g);
        if (item && g > 0) {
          item.grams = g;
          item.unitLabel = `${g}g`;
          item.status = 'matched';
          item.basis = `已手动确认 ${g}g`;
          renderTextImportReview();
        }
        return;
      }

      const applyBtn = e.target.closest('[data-ti-applyg]');
      if (applyBtn) {
        const uid = applyBtn.dataset.tiApplyg;
        const inp = dom.tiSectionsContainer.querySelector(`[data-ti-manualg="${uid}"]`);
        const g = inp ? parseFloat(inp.value) : 0;
        if (!g || g <= 0) {
          showToast('请输入有效克数');
          return;
        }
        const item = state.textImport.items.find((x) => x.uid === uid);
        if (item) {
          item.grams = g;
          item.unitLabel = `${g}g`;
          item.status = 'matched';
          item.basis = `已手动确认 ${g}g`;
          renderTextImportReview();
        }
        return;
      }

      const ignoreBtn = e.target.closest('[data-ti-ignore]');
      if (ignoreBtn) {
        const item = state.textImport.items.find((x) => x.uid === ignoreBtn.dataset.tiIgnore);
        if (item) {
          item.ignoredZeroCal = true;
          renderTextImportReview();
        }
        return;
      }

      const unignoreBtn = e.target.closest('[data-ti-unignore]');
      if (unignoreBtn) {
        const item = state.textImport.items.find((x) => x.uid === unignoreBtn.dataset.tiUnignore);
        if (item) {
          item.ignoredZeroCal = false;
          renderTextImportReview();
        }
        return;
      }

      const removeBtn = e.target.closest('[data-ti-remove]');
      if (removeBtn) {
        state.textImport.items = state.textImport.items.filter((x) => x.uid !== removeBtn.dataset.tiRemove);
        renderTextImportReview();
      }
    });

    dom.tiBtnSaveRecipe.addEventListener('click', () => saveParsedRecipe(false));
    dom.tiBtnSaveAndPlate.addEventListener('click', () => saveParsedRecipe(true));
    dom.tiBtnBatchPlate.addEventListener('click', batchAddDishListToPlate);
    dom.tiBtnMergeRecipe.addEventListener('click', () => {
      state.textImport.mode = 'recipe';
      dom.tiRecipeName.value = dom.tiRecipeName.value || '我的组合菜谱';
      renderTextImportReview();
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
    const isNativeWrapper = Boolean(window.__IOS_NATIVE_APP__ || window.__ANDROID_NATIVE_APP__) || location.protocol === 'file:';
    if (!isNativeWrapper && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    const dismissed = localStorage.getItem(STORAGE_KEYS.INSTALL_DISMISSED) === '1';

    if (isIOS && !isStandalone && !isNativeWrapper && !dismissed) {
      dom.installBanner.classList.remove('hidden');
    }
  }

  // ==================== 原生感双向滑动手势引擎 (左滑删除 + 右滑收藏) ====================
  let openSwipeItem = null;
  let openSwipeSide = null; // 'left' (滑开右侧动作) | 'right' (滑开左侧动作)
  let swipeSuppressClickUntil = 0;

  function closeAllSwipes(exceptItem = null) {
    if (openSwipeItem && openSwipeItem !== exceptItem) {
      const content = openSwipeItem.querySelector('.swipe-content');
      if (content) content.style.transform = 'translateX(0)';
      openSwipeItem = null;
      openSwipeSide = null;
    }
  }

  function initSwipeGestures() {
    const shell = $('.app-shell');
    if (!shell) return;

    let activeItem = null;
    let activeContent = null;
    let rightWidth = 0;
    let leftWidth = 0;
    let startX = 0;
    let startY = 0;
    let baseOffset = 0;
    let currentOffset = 0;
    let isHorizontal = null;

    const getPoint = (e) => (e.touches ? e.touches[0] : e);

    const onStart = (e) => {
      const item = e.target.closest('.swipe-item');
      if (!item || e.target.closest('.swipe-actions') || e.target.closest('.swipe-actions-left')) return;

      closeAllSwipes(item);
      const pt = getPoint(e);
      activeItem = item;
      activeContent = item.querySelector('.swipe-content');
      const rightEl = item.querySelector('.swipe-actions');
      const leftEl = item.querySelector('.swipe-actions-left');
      rightWidth = rightEl ? rightEl.offsetWidth : 0;
      leftWidth = leftEl ? leftEl.offsetWidth : 0;
      startX = pt.clientX;
      startY = pt.clientY;
      if (openSwipeItem === item) {
        baseOffset = openSwipeSide === 'left' ? -rightWidth : leftWidth;
      } else {
        baseOffset = 0;
      }
      currentOffset = baseOffset;
      isHorizontal = null;
    };

    const onMove = (e) => {
      if (!activeItem || !activeContent) return;
      const pt = getPoint(e);
      const dx = pt.clientX - startX;
      const dy = pt.clientY - startY;

      if (isHorizontal === null) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        isHorizontal = Math.abs(dx) > Math.abs(dy) * 1.15;
        if (!isHorizontal) {
          activeItem = null;
          activeContent = null;
          return;
        }
        activeContent.classList.add('dragging');
      }

      if (isHorizontal) {
        if (e.cancelable) e.preventDefault();
        let next = baseOffset + dx;
        const maxPos = leftWidth > 0 ? leftWidth + 16 : 0;
        const minNeg = rightWidth > 0 ? -(rightWidth + 16) : 0;
        if (next > maxPos) next = maxPos;
        if (next < minNeg) next = minNeg;
        currentOffset = next;
        activeContent.style.transform = `translateX(${currentOffset}px)`;
      }
    };

    const onEnd = () => {
      if (!activeItem || !activeContent) return;
      activeContent.classList.remove('dragging');
      if (isHorizontal) {
        swipeSuppressClickUntil = Date.now() + 180;
        if (rightWidth > 0 && currentOffset < -Math.min(44, rightWidth * 0.45)) {
          activeContent.style.transform = `translateX(-${rightWidth}px)`;
          openSwipeItem = activeItem;
          openSwipeSide = 'left';
        } else if (leftWidth > 0 && currentOffset > Math.min(44, leftWidth * 0.45)) {
          activeContent.style.transform = `translateX(${leftWidth}px)`;
          openSwipeItem = activeItem;
          openSwipeSide = 'right';
        } else {
          activeContent.style.transform = 'translateX(0)';
          if (openSwipeItem === activeItem) {
            openSwipeItem = null;
            openSwipeSide = null;
          }
        }
      }
      activeItem = null;
      activeContent = null;
      isHorizontal = null;
    };

    shell.addEventListener('touchstart', onStart, { passive: true });
    shell.addEventListener('touchmove', onMove, { passive: false });
    shell.addEventListener('touchend', onEnd, { passive: true });
    shell.addEventListener('touchcancel', onEnd, { passive: true });

    // 桌面鼠标预览兼容
    let mouseDown = false;
    shell.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      mouseDown = true;
      onStart(e);
    });
    window.addEventListener('mousemove', (e) => {
      if (mouseDown) onMove(e);
    });
    window.addEventListener('mouseup', () => {
      if (mouseDown) {
        mouseDown = false;
        onEnd();
      }
    });
  }

  function migrateLegacyAIConfig() {
    if (!state.aiConfig || typeof state.aiConfig !== 'object') return;
    const savedModel = String(state.aiConfig.geminiModel || '').trim();
    if (savedModel && DEPRECATED_GEMINI_MODELS.has(savedModel)) {
      state.aiConfig = {
        ...state.aiConfig,
        geminiModel: DEFAULT_GEMINI_MODEL
      };
      saveAIConfig();
      showToast(`已自动将旧版 Gemini 模型升级为 ${DEFAULT_GEMINI_MODEL}`);
    }
  }

  // ==================== 启动初始化 ====================
  function init() {
    initTheme();
    initPWA();
    migrateLegacyAIConfig();
    initCustomFoodFormOptions();
    renderCategories();
    syncUnitToggleUI();
    renderLookupList();
    renderFavoritesList();
    renderPlate();
    bindEvents();
    initSwipeGestures();
  }

  init();
})();
