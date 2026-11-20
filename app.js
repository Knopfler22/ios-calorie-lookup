(() => {
  'use strict';

  // ==================== 持久化 Key ====================
  const STORAGE_KEYS = {
    FAVORITES: 'ios_cal_favorites_v1',
    PLATE: 'ios_cal_plate_v1',
    PLATE_DATE: 'ios_cal_plate_date_v1',
    GOAL: 'ios_cal_goal_v1',
    THEME: 'ios_cal_theme_v1',
    INSTALL_DISMISSED: 'ios_cal_install_dismissed_v1'
  };

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

  // ==================== 应用状态 ====================
  const state = {
    activeTab: 'lookup',
    category: 'all',
    levelFilter: 'all',
    searchQuery: '',
    listUnitMode: '100g', // '100g' | 'unit'
    favorites: loadJSON(STORAGE_KEYS.FAVORITES, ['egg', 'chicken-breast', 'rice', 'milk-tea']),
    plateItems: loadTodayPlate(),
    dailyGoal: Number(localStorage.getItem(STORAGE_KEYS.GOAL)) || 1800,
    sheet: {
      food: null,
      mode: 'unit', // 'unit' | 'gram'
      amount: 1,
      meal: getSmartDefaultMeal()
    }
  };

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
    categoryTabs: $('#category-tabs'),
    levelFilters: $('#level-filters'),
    unitToggle: $('#unit-toggle'),
    favUnitToggle: $('#fav-unit-toggle'),
    resultCount: $('#result-count'),
    foodList: $('#food-list'),
    lookupEmpty: $('#lookup-empty'),
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
    sheetFavBtn: $('#sheet-fav-btn'),
    sheetEmoji: $('#sheet-emoji'),
    sheetFoodName: $('#sheet-food-name'),
    sheetLevelBadge: $('#sheet-level-badge'),
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
    }, 1800);
  }

  // ==================== 主题切换 ====================
  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    applyTheme(theme);
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

  function getFoodById(id) {
    return FOOD_DATABASE.find((f) => f.id === id);
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
            <span class="food-name">${food.name}</span>
            ${isFav ? '<span class="fav-heart-mini" title="已收藏">❤️</span>' : ''}
          </div>
          <div class="food-sub">${subText}</div>
        </div>
        <div class="food-right">
          <div class="food-kcal-col">
            <div class="food-kcal-val ${level.key}">${displayKcal}</div>
            <div class="food-kcal-unit">${displayUnit}</div>
          </div>
          <button class="quick-add-btn" data-quick-add="${food.id}" aria-label="快捷加入餐盘" title="快捷加入今日餐盘">+</button>
        </div>
      </div>
    `;
  }

  function getFilteredFoods() {
    const q = state.searchQuery.trim().toLowerCase();
    return FOOD_DATABASE.filter((food) => {
      if (state.category !== 'all' && food.category !== state.category) return false;
      if (state.levelFilter !== 'all' && getCalorieLevel(food.kcal).key !== state.levelFilter) return false;
      if (q) {
        const catObj = FOOD_CATEGORIES.find((c) => c.id === food.category);
        const haystack = `${food.name} ${food.alias} ${catObj ? catObj.name : ''}`.toLowerCase();
        return haystack.includes(q);
      }
      return true;
    });
  }

  function renderLookupList() {
    const foods = getFilteredFoods();
    dom.resultCount.textContent = `共 ${foods.length} 种食物`;

    if (foods.length === 0) {
      dom.foodList.classList.add('hidden');
      dom.lookupEmpty.classList.remove('hidden');
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
      const food = getFoodById(item.foodId);
      if (!food) return null;
      const nut = calcNutrition(food, item.grams);
      totalKcal += nut.kcal;
      totalCarbs += nut.carbs;
      totalProtein += nut.protein;
      totalFat += nut.fat;
      return { ...item, food, nut };
    }).filter(Boolean);

    // 环形进度条
    const circumference = 2 * Math.PI * 50; // ~314.16
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

    // 三大营养素汇总
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

    // 按餐次分组
    const sectionsHTML = MEAL_TYPES.map((meal) => {
      const items = enriched.filter((it) => it.meal === meal.id);
      if (items.length === 0) return '';
      const mealKcal = items.reduce((sum, it) => sum + it.nut.kcal, 0);

      const rowsHTML = items.map((it) => `
        <div class="plate-row">
          <div class="food-emoji-box">${it.food.emoji}</div>
          <div class="food-info" data-open-food="${it.food.id}" style="cursor:pointer;">
            <div class="food-name">${it.food.name}</div>
            <div class="food-sub">${it.label}（${Math.round(it.grams)}g）· 蛋${it.nut.protein}g</div>
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
    if (state.favorites.length > 0) {
      dom.badgeFavorites.textContent = state.favorites.length;
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

  // ==================== 单位切换同步 ====================
  function syncUnitToggleUI() {
    [dom.unitToggle, dom.favUnitToggle].forEach((container) => {
      container.querySelectorAll('.seg-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.mode === state.listUnitMode);
      });
    });
  }

  // ==================== 切换 Tab ====================
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

  // ==================== 食物详情 Bottom Sheet ====================
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
    dom.sheetBaseInfo.textContent = `${food.kcal} kcal / 100g`;
    dom.sheetModeUnitBtn.textContent = `${food.unitName} (${food.unitGrams}g)`;
    dom.sheetTip.textContent = food.tip;

    updateSheetFavUI();
    updateSheetModeUI();
    updateSheetMealUI();
    updateSheetCalculations();

    dom.detailBackdrop.classList.remove('hidden');
    dom.detailSheet.classList.remove('hidden');
    requestAnimationFrame(() => {
      dom.detailBackdrop.classList.add('open');
      dom.detailSheet.classList.add('open');
    });
  }

  function closeFoodSheet() {
    dom.detailBackdrop.classList.remove('open');
    dom.detailSheet.classList.remove('open');
    setTimeout(() => {
      dom.detailBackdrop.classList.add('hidden');
      dom.detailSheet.classList.add('hidden');
    }, 300);
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

    // 高亮匹配的快捷按钮
    dom.sheetQuickPicks.querySelectorAll('.quick-pick-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.pick) === Number(state.sheet.amount));
    });
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

  function addToPlate(foodId, grams, label, meal) {
    const food = getFoodById(foodId);
    if (!food || grams <= 0) return;

    const nut = calcNutrition(food, grams);
    state.plateItems.push({
      uid: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      foodId,
      meal: meal || getSmartDefaultMeal(),
      grams,
      label,
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
    // 主题切换
    dom.btnTheme.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    // 红绿灯说明
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

    // 列表单位切换（速查页 & 收藏页同步）
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

    // 列表点击（打开详情 / 快捷加餐）
    [dom.foodList, dom.favoritesList].forEach((listEl) => {
      listEl.addEventListener('click', (e) => {
        const quickBtn = e.target.closest('[data-quick-add]');
        if (quickBtn) {
          e.stopPropagation();
          quickAddFood(quickBtn.dataset.quickAdd);
          return;
        }
        const row = e.target.closest('.food-row');
        if (row) {
          openFoodSheet(row.dataset.foodId);
        }
      });
    });

    // 空状态跳转
    dom.btnGoLookup.addEventListener('click', () => switchTab('lookup'));
    dom.btnPlateGoLookup.addEventListener('click', () => switchTab('lookup'));

    // Tab 切换
    dom.tabItems.forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // 餐盘页操作
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

    // Detail Sheet 事件
    dom.detailBackdrop.addEventListener('click', closeFoodSheet);
    dom.sheetCloseBtn.addEventListener('click', closeFoodSheet);
    dom.sheetGrabber.addEventListener('click', closeFoodSheet);

    dom.sheetFavBtn.addEventListener('click', () => {
      if (state.sheet.food) toggleFavorite(state.sheet.food.id);
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

    // Modal 点击遮罩关闭
    dom.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === dom.modalBackdrop) closeModal();
    });

    // 关闭安装引导
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
    renderCategories();
    syncUnitToggleUI();
    renderLookupList();
    renderFavoritesList();
    renderPlate();
    bindEvents();
  }

  init();
})();
