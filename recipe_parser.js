(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RecipeParser = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MASS_FACTORS = {
    mg: 0.001,
    g: 1,
    克: 1,
    kg: 1000,
    千克: 1000,
    公斤: 1000,
    斤: 500,
    两: 50
  };

  const VOLUME_UNITS = new Set(['ml', 'mL', 'ML', '毫升', 'l', 'L', '升']);

  const COUNT_UNITS = [
    '小碗', '大碗', '小勺', '大勺', '汤匙', '瓷勺', '茶匙',
    '个', '颗', '只', '根', '片', '块', '碗', '盘', '份',
    '盒', '瓶', '袋', '瓣', '朵', '棵', '段', '勺', '把'
  ];

  const SPOON_UNITS = new Set(['勺', '大勺', '汤匙', '瓷勺', '小勺', '茶匙']);

  const FUZZY_WORDS = new Set([
    '适量', '少许', '一点', '一点点', '些许', '若干', '一把', '几片', '几根', '几颗', '半把', '少许即可'
  ]);

  const ZERO_CAL_SEASONINGS = new Set([
    '盐', '食盐', '精盐', '海盐', '岩盐', '水', '清水', '白开水', '温水', '冰水', '开水',
    '葱', '葱花', '小葱', '香葱', '姜', '生姜', '姜片', '姜丝', '蒜', '大蒜', '蒜末', '蒜瓣',
    '黑胡椒', '白胡椒', '胡椒粉', '花椒', '八角', '桂皮', '香叶', '干辣椒', '小米辣', '辣椒粉',
    '孜然', '孜然粉', '五香粉', '十三香', '醋', '陈醋', '米醋', '白醋', '料酒'
  ]);

  // 高频基础食材同义词直达映射（对应 data.js / china_food_db.js ID）
  const SYNONYM_ID_MAP = {
    鸡蛋: 'egg',
    鲜鸡蛋: 'egg',
    柴鸡蛋: 'egg',
    土鸡蛋: 'egg',
    水煮蛋: 'egg',
    水煮鸡蛋: 'egg',
    鸡胸: 'chicken-breast',
    鸡胸肉: 'chicken-breast',
    鸡脯肉: 'chicken-breast',
    西红柿: 'tomato',
    番茄: 'tomato',
    食用油: 'cooking-oil',
    植物油: 'cooking-oil',
    炒菜油: 'cooking-oil',
    菜籽油: 'cooking-oil',
    花生油: 'cooking-oil',
    色拉油: 'cooking-oil',
    玉米油: 'cooking-oil',
    葵花籽油: 'cooking-oil',
    烹调油: 'cooking-oil',
    橄榄油: 'olive-oil',
    特级初榨橄榄油: 'olive-oil',
    生抽: 'soy-sauce',
    酱油: 'soy-sauce',
    鲜酱油: 'soy-sauce',
    老抽: 'soy-sauce',
    蚝油: 'oyster-sauce',
    白糖: 'white-sugar',
    糖: 'white-sugar',
    白砂糖: 'white-sugar',
    冰糖: 'white-sugar',
    纯牛奶: 'whole-milk',
    牛奶: 'whole-milk',
    鲜奶: 'whole-milk',
    全脂牛奶: 'whole-milk',
    米饭: 'rice',
    白米饭: 'rice',
    大米饭: 'rice',
    猪瘦肉: 'pork-tenderloin',
    瘦猪肉: 'pork-tenderloin',
    猪里脊: 'pork-tenderloin',
    瘦牛肉: 'lean-beef',
    牛里脊: 'lean-beef',
    牛腱子: 'lean-beef',
    全麦面包: 'whole-wheat-bread',
    全麦吐司: 'whole-wheat-bread',
    西兰花: 'broccoli',
    牛油果: 'avocado',
    生菜: 'lettuce',
    罗马生菜: 'lettuce',
    球生菜: 'lettuce',
    荞麦面: 'buckwheat-noodle',
    番茄炒蛋: 'tomato-egg',
    西红柿炒鸡蛋: 'tomato-egg',
    宫保鸡丁: 'kung-pao-chicken',
    蒜蓉清炒西兰花: 'stirfry-broccoli',
    清炒西兰花: 'stirfry-broccoli',
    芝麻酱: 'sesame-paste',
    麻酱: 'sesame-paste',
    花生酱: 'sesame-paste',
    沙拉酱: 'mayo',
    蛋黄酱: 'mayo',
    油醋汁: 'vinaigrette'
  };

  // 国标项兜底常见单件克重（仅在匹配项 unitName='100g' 且无明确单件定义时启用）
  const COMMON_UNIT_WEIGHTS = {
    鸡蛋: { 个: 50, 颗: 50 },
    水煮鸡蛋: { 个: 50, 颗: 50 },
    番茄: { 个: 150, 颗: 150 },
    西红柿: { 个: 150, 颗: 150 },
    牛油果: { 个: 150, 颗: 150 },
    苹果: { 个: 200, 颗: 200 },
    香蕉: { 根: 120, 个: 120 },
    黄瓜: { 根: 200 },
    胡萝卜: { 根: 150 },
    大蒜: { 瓣: 5, 颗: 5 },
    葱: { 根: 15, 棵: 15 },
    小葱: { 根: 10, 棵: 10 },
    全麦吐司: { 片: 40 },
    吐司: { 片: 40 }
  };

  const PROCESSING_WORDS_RE = /(切块|切片|切丝|切丁|切段|切碎|切末|洗净|去核|去蒂|去籽|焯水|新鲜|嫩|老)/g;

  function toHalfWidth(str) {
    return String(str || '').replace(/[\uFF01-\uFF5E]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
    ).replace(/\u3000/g, ' ');
  }

  function chineseNumToNumber(token) {
    if (!token) return NaN;
    if (token === '半') return 0.5;
    const digitMap = { 零: 0, 一: 1, 壹: 1, 二: 2, 贰: 2, 两: 2, 俩: 2, 三: 3, 叁: 3, 四: 4, 肆: 4, 五: 5, 伍: 5, 六: 6, 陆: 6, 七: 7, 柒: 7, 八: 8, 捌: 8, 九: 9, 玖: 9 };
    if (token in digitMap) return digitMap[token];
    if (token === '十' || token === '拾') return 10;
    const tenMatch = token.match(/^([一壹二贰两三叁四肆五伍六陆七柒八捌九玖])?[十拾]([一壹二贰三叁四肆五伍六陆七柒八捌九玖])?$/);
    if (tenMatch) {
      const tens = tenMatch[1] ? digitMap[tenMatch[1]] : 1;
      const ones = tenMatch[2] ? digitMap[tenMatch[2]] : 0;
      return tens * 10 + ones;
    }
    const hundredMatch = token.match(/^([一壹二贰两三叁四肆五伍六陆七柒八捌九玖])[百佰]([一壹二贰两三叁四肆五伍六陆七柒八捌九玖])?[十拾]?$/);
    if (hundredMatch) {
      return digitMap[hundredMatch[1]] * 100;
    }
    return NaN;
  }

  function normalizeChineseQuantities(text) {
    let s = toHalfWidth(text);
    // 分数：二分之一、四分之一、1/2
    s = s.replace(/([一二三四五六七八九十\d]+)分之([一二三四五六七八九十\d]+)/g, (_, den, num) => {
      const d = /^\d+$/.test(den) ? Number(den) : chineseNumToNumber(den);
      const n = /^\d+$/.test(num) ? Number(num) : chineseNumToNumber(num);
      return Number.isFinite(d) && d > 0 && Number.isFinite(n) ? String(+(n / d).toFixed(3)) : _;
    });
    s = s.replace(/(\d+)\s*\/\s*(\d+)/g, (_, num, den) => {
      const n = Number(num);
      const d = Number(den);
      return d > 0 ? String(+(n / d).toFixed(3)) : _;
    });

    const unitAlt = [...Object.keys(MASS_FACTORS), ...VOLUME_UNITS, ...COUNT_UNITS]
      .sort((a, b) => b.length - a.length)
      .join('|');

    // 复合“X个半”/“一个半”
    const halfUnitRe = new RegExp(`(\\d+(?:\\.\\d+)?|[一壹二贰两俩三叁四肆五伍六陆七柒八捌九玖十拾]+)(${unitAlt})半`, 'g');
    s = s.replace(halfUnitRe, (_, numStr, unit) => {
      const n = /^\d/.test(numStr) ? Number(numStr) : chineseNumToNumber(numStr);
      return Number.isFinite(n) ? `${n + 0.5}${unit}` : _;
    });

    // 中文数词 + 单位（含“半个”“两个”“一勺”“两百克”）
    const cnQtyRe = new RegExp(`(半|[一壹二贰两俩三叁四肆五伍六陆七柒八捌九玖十拾百佰]{1,3})\\s*(${unitAlt})(?![\\u4e00-\\u9fa5]*[分之])`, 'g');
    s = s.replace(cnQtyRe, (_, cn, unit) => {
      const n = chineseNumToNumber(cn);
      return Number.isFinite(n) ? `${n}${unit}` : _;
    });

    return s;
  }

  // 保护括号内逗号/顿号，按行与常见分隔符拆分
  function splitItemsOutsideParens(line) {
    const items = [];
    let current = '';
    let depth = 0;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '(' || ch === '（' || ch === '[' || ch === '【') depth++;
      else if ((ch === ')' || ch === '）' || ch === ']' || ch === '】') && depth > 0) depth--;

      if (depth === 0 && (ch === '、' || ch === ',' || ch === '，' || ch === ';' || ch === '；' || ch === '+')) {
        if (current.trim()) items.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) items.push(current.trim());
    return items;
  }

  function cleanSegmentPrefix(seg) {
    return seg
      .replace(/^\s*(?:[①②③④⑤⑥⑦⑧⑨⑩]|\d{1,2}[.、)）]|[-•*·])\s*/g, '')
      .replace(/^\s*(?:准备|食材|原料|配料|主料|辅料|调料|菜谱原料)[:：]?\s*/g, '')
      .trim();
  }

  function isStepLine(line) {
    return /^\s*(?:做法|步骤|制作方法|烹饪步骤|烹调方法|小贴士|Tips)[:：]/i.test(line);
  }

  function hasAnyQuantityCue(line) {
    const norm = normalizeChineseQuantities(line);
    const unitAlt = [...Object.keys(MASS_FACTORS), ...VOLUME_UNITS, ...COUNT_UNITS]
      .sort((a, b) => b.length - a.length)
      .join('|');
    const qtyRe = new RegExp(`\\d+(?:\\.\\d+)?\\s*(?:${unitAlt})`, 'i');
    if (qtyRe.test(norm)) return true;
    for (const fw of FUZZY_WORDS) {
      if (norm.includes(fw)) return true;
    }
    return false;
  }

  // 提取单个原料片段中的名称与用量
  function parseIngredientSegment(rawSeg) {
    const original = rawSeg.trim();
    const norm = normalizeChineseQuantities(original);

    // 检查括号内是否直接给出精确克数，如：番茄2个（约300g）
    let parenExactGrams = null;
    const parenGramMatch = norm.match(/[（(][^）)]*?(\d+(?:\.\d+)?)\s*(?:g|克)[）)]/i);
    if (parenGramMatch) {
      parenExactGrams = parseFloat(parenGramMatch[1]);
    }

    // 去除括号说明用于提取名称和主用量（保留原始名称中的关键括号如 荞麦面（熟））
    const unitAlt = [...Object.keys(MASS_FACTORS), ...VOLUME_UNITS, ...COUNT_UNITS]
      .sort((a, b) => b.length - a.length)
      .join('|');

    // 检查区间表达：150-200g / 2~3个
    const rangeRe = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*[-~～至到]\\s*(\\d+(?:\\.\\d+)?)\\s*(${unitAlt})`, 'i');
    const rangeMatch = norm.match(rangeRe);
    let qty = null;
    let unit = null;
    let isRangeEstimate = false;
    let isFuzzy = false;
    let fuzzyWord = '';
    let rawName = norm;

    if (rangeMatch) {
      const a = parseFloat(rangeMatch[1]);
      const b = parseFloat(rangeMatch[2]);
      qty = +((a + b) / 2).toFixed(2);
      unit = rangeMatch[3];
      isRangeEstimate = true;
      rawName = (norm.slice(0, rangeMatch.index) + ' ' + norm.slice(rangeMatch.index + rangeMatch[0].length)).trim();
    } else {
      // 前置用量：[数量][单位][原料名] 或 后置用量：[原料名][数量][单位]
      const qtyUnitRe = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${unitAlt})`, 'i');
      const m = norm.match(qtyUnitRe);
      if (m) {
        qty = parseFloat(m[1]);
        unit = m[2];
        rawName = (norm.slice(0, m.index) + ' ' + norm.slice(m.index + m[0].length)).trim();
      } else {
        // 检查纯模糊量词
        const fuzzyList = Array.from(FUZZY_WORDS).sort((a, b) => b.length - a.length);
        for (const fw of fuzzyList) {
          if (norm.includes(fw)) {
            isFuzzy = true;
            fuzzyWord = fw;
            rawName = norm.replace(fw, '').trim();
            break;
          }
        }
      }
    }

    // 如果有括号精确克数且不是保留语义的括号（如（熟））
    if (parenExactGrams !== null) {
      rawName = rawName.replace(/[（(][^）)]*?(?:\d+(?:\.\d+)?)\s*(?:g|克)[）)]/gi, '').trim();
      qty = parenExactGrams;
      unit = 'g';
    }

    rawName = rawName.replace(/^[:：的\s]+|[:：\s]+$/g, '').trim();

    return {
      raw: original,
      rawName: rawName || original,
      qty,
      unit,
      isRangeEstimate,
      isFuzzy,
      fuzzyWord,
      hasExplicitQty: qty !== null && unit !== null
    };
  }

  function cleanStem(name) {
    return String(name || '')
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(PROCESSING_WORDS_RE, '')
      .replace(/\s+/g, '')
      .trim();
  }

  function scoreCandidate(query, stem, food, isIngredientContext) {
    const q = String(query || '').trim();
    const s = String(stem || '').trim();
    if (!q) return 0;

    const splitNames = food.name
      .split(/[/／[\]［］]/)
      .map((x) => x.trim())
      .filter(Boolean);
    const noParenNames = splitNames
      .map((x) => x.replace(/[（(][^）)]*[）)]/g, '').trim())
      .filter(Boolean);

    let score = 0;

    // L1: 精确命中全名、主名或高频基础食材同义词直达映射
    if (
      q === food.name.trim()
      || splitNames.includes(q)
      || (s && splitNames.includes(s))
      || SYNONYM_ID_MAP[q] === food.id
      || (s && SYNONYM_ID_MAP[s] === food.id)
    ) {
      score = 100;
    }
    // L2: 去括号后精确命中
    else if (noParenNames.includes(q) || (s && noParenNames.includes(s))) {
      score = 85;
    }
    // L4: 模糊回退（带长度占比与复合菜品惩罚）
    else {
      const targetNames = [...new Set([...noParenNames, ...splitNames])];
      let bestFuzzy = 0;
      for (const cand of targetNames) {
        if (!cand) continue;
        let base = 0;
        if (cand.startsWith(q) || (s && cand.startsWith(s))) {
          base = 68;
        } else if (cand.includes(q) || (s && cand.includes(s))) {
          base = 60;
        } else if (q.length >= 3 && q.includes(cand) && cand.length >= 2) {
          base = 56;
        }
        if (base > 0) {
          const refLen = Math.max(q.length, s ? s.length : 0);
          const ratio = refLen / Math.max(cand.length, 1);
          if (ratio < 0.5) {
            base -= 30;
          }
          if (isIngredientContext && (food.category === 'fastfood' || food.category === 'dish')) {
            base -= 20;
          }
          if (base > bestFuzzy) bestFuzzy = base;
        }
      }
      score = bestFuzzy;
    }

    if (score < 55) return 0;

    // 同分优先级：自定义 > 手写精选 > 国标代表值 > 国标其他
    let tieBonus = 0;
    if (food.isCustom) tieBonus = 3;
    else if (!food.isStandard) tieBonus = 2;
    else if (food.name.includes('代表值')) tieBonus = 1;

    return score + tieBonus * 0.1;
  }

  function matchFoodInDatabase(rawName, database, isIngredientContext) {
    const q = String(rawName || '').trim();
    if (!q) return { matched: null, candidates: [] };
    const stem = cleanStem(q);

    // 零卡调料若不在库内精确/同义命中，绝不走模糊子串匹配（防止“食盐”误匹配“盐水鸭”）
    const isZeroCal = ZERO_CAL_SEASONINGS.has(q) || ZERO_CAL_SEASONINGS.has(stem);

    const scored = [];
    for (let i = 0; i < database.length; i++) {
      const food = database[i];
      const sc = scoreCandidate(q, stem, food, isIngredientContext);
      if (sc >= 55) {
        if (isZeroCal && sc < 75) continue;
        scored.push({ food, score: sc });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const candidates = scored.slice(0, 3).map((x) => x.food);
    return {
      matched: candidates[0] || null,
      candidates
    };
  }

  // 解析食物 unitName 中的倍率，如“半个（去核）”=> { count: 0.5, unit: '个' }，“10只”=> { count: 10, unit: '只' }
  function parseFoodUnitDefinition(food) {
    if (!food || !food.unitName || !food.unitGrams) return null;
    const norm = normalizeChineseQuantities(food.unitName);
    const unitAlt = COUNT_UNITS.slice().sort((a, b) => b.length - a.length).join('|');
    const re = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${unitAlt})`);
    const m = norm.match(re);
    if (!m) return null;
    const count = parseFloat(m[1]);
    if (!Number.isFinite(count) || count <= 0) return null;
    return {
      count,
      unit: m[2],
      perSingleUnitGrams: food.unitGrams / count
    };
  }

  function getLiquidDensity(food, rawName) {
    const text = `${rawName || ''} ${food ? food.name : ''}`;
    if (/橄榄油|植物油|食用油|菜籽油|花生油|玉米油|葵花籽油|炒菜油/.test(text)) return 0.92;
    if (/蚝油/.test(text)) return 1.25;
    if (/生抽|酱油|老抽/.test(text)) return 1.15;
    if (/蜂蜜/.test(text)) return 1.40;
    return 1.0;
  }

  function convertToGrams(parsed, matchedFood) {
    if (!parsed.hasExplicitQty) {
      return { grams: null, basis: '', needsWeight: true };
    }

    const { qty, unit, isRangeEstimate } = parsed;
    const rangeTag = isRangeEstimate ? '（区间取中值）' : '';

    // 1. 质量单位
    if (Object.prototype.hasOwnProperty.call(MASS_FACTORS, unit)) {
      const grams = +(qty * MASS_FACTORS[unit]).toFixed(1);
      const basis = unit === 'g' || unit === '克'
        ? `精确克重 ${grams}g${rangeTag}`
        : `${qty}${unit} × ${MASS_FACTORS[unit]}g = ${grams}g${rangeTag}`;
      return { grams, basis, needsWeight: false };
    }

    // 2. 容量单位
    if (VOLUME_UNITS.has(unit)) {
      const ml = (unit === 'l' || unit === 'L' || unit === '升') ? qty * 1000 : qty;
      const density = getLiquidDensity(matchedFood, parsed.rawName);
      const grams = +(ml * density).toFixed(1);
      const basis = density === 1.0
        ? `液体按 1ml≈1g 折算 = ${grams}g${rangeTag}`
        : `${ml}ml × ${density}g/ml = ${grams}g${rangeTag}`;
      return { grams, basis, needsWeight: false };
    }

    // 3. 计数单位 & 勺类单位
    if (matchedFood) {
      const def = parseFoodUnitDefinition(matchedFood);
      if (def) {
        const unitMatch = def.unit === unit
          || (SPOON_UNITS.has(def.unit) && SPOON_UNITS.has(unit) && def.unit === unit)
          || ((def.unit === '小碗' || def.unit === '大碗') && unit === '碗')
          || (def.unit === '勺' && (unit === '勺' || unit === '大勺' || unit === '汤匙'));
        if (unitMatch) {
          const grams = +(qty * def.perSingleUnitGrams).toFixed(1);
          const singleRounded = +def.perSingleUnitGrams.toFixed(1);
          const basis = qty === 0.5
            ? `按 0.5×1${def.unit}(${singleRounded}g) 折算 = ${grams}g${rangeTag}`
            : `${qty}${unit} × ${singleRounded}g = ${grams}g${rangeTag}`;
          return { grams, basis, needsWeight: false };
        }
      }

      // 若命中食物为国标项或单位不匹配，查内置高频单件词典
      const stem = cleanStem(parsed.rawName);
      const dict = COMMON_UNIT_WEIGHTS[parsed.rawName] || COMMON_UNIT_WEIGHTS[stem] || COMMON_UNIT_WEIGHTS[cleanStem(matchedFood.name)];
      if (dict && dict[unit]) {
        const grams = +(qty * dict[unit]).toFixed(1);
        const basis = qty === 0.5
          ? `按 0.5×1${unit}(${dict[unit]}g) 折算 = ${grams}g${rangeTag}`
          : `${qty}${unit} × ${dict[unit]}g = ${grams}g${rangeTag}`;
        return { grams, basis, needsWeight: false };
      }

      // 通用勺类兜底（仅限液体/油/糖/调料/粉类）
      if (SPOON_UNITS.has(unit)) {
        const text = `${parsed.rawName} ${matchedFood.name}`;
        const isOil = /油/.test(text);
        const isSmall = unit === '小勺' || unit === '茶匙';
        const isSauceOrLiquid = /酱|油|醋|蜜|糖|粉|汁|奶|水|酒|盐/.test(text);
        if (isSauceOrLiquid) {
          const perSpoon = isOil ? (isSmall ? 4.5 : 10) : (isSmall ? 5 : 15);
          const grams = +(qty * perSpoon).toFixed(1);
          return {
            grams,
            basis: `通用量勺 ${qty}${unit} × ${perSpoon}g = ${grams}g${rangeTag}`,
            needsWeight: false
          };
        }
      }
    }

    return { grams: null, basis: '单件克重未知，请手动填写', needsWeight: true };
  }

  function extractTitleAndLines(rawText) {
    const rawLines = String(rawText || '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    let recipeName = '';
    let cutIndex = rawLines.length;
    const keptLines = [];

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (keptLines.length > 0 && isStepLine(line)) {
        cutIndex = i;
        break;
      }
      keptLines.push(line);
    }

    const linesForItems = [];
    for (let i = 0; i < keptLines.length; i++) {
      const line = keptLines[i];

      // 1. 显式键值行
      const kvMatch = line.match(/^(?:菜名|菜谱|菜谱名称|名称)[:：]\s*(.+)$/);
      if (kvMatch && !recipeName) {
        recipeName = kvMatch[1].trim();
        continue;
      }

      // 2. 【xxx】或 《xxx》 标题
      const bracketMatch = line.match(/^[【《]([^】》]{2,30})[】》]$/);
      if (bracketMatch && !recipeName) {
        recipeName = bracketMatch[1].trim();
        continue;
      }

      // 3. 首行标题启发式
      if (i === 0 && keptLines.length >= 2 && !recipeName && !hasAnyQuantityCue(line) && !/[、,，;；+]/.test(line)) {
        const cleanTitle = line.replace(/^[【《]|[】》]$/g, '').trim();
        if (cleanTitle.length >= 2 && cleanTitle.length <= 24) {
          recipeName = cleanTitle;
          continue;
        }
      }

      // 4. 内联引导句式：xxx：原料有...
      const inlineMatch = line.match(/^([^:：]{2,20})[:：]\s*(?:原料|食材|配料)[有是]?\s*(.+)$/);
      if (inlineMatch && !recipeName) {
        recipeName = inlineMatch[1].trim();
        linesForItems.push(inlineMatch[2].trim());
        continue;
      }

      linesForItems.push(line);
    }

    return { recipeName, linesForItems, truncatedAtStep: cutIndex < rawLines.length };
  }

  function parseText(rawText, database = []) {
    const { recipeName, linesForItems } = extractTitleAndLines(rawText);

    const segments = [];
    for (const line of linesForItems) {
      const cleanedLine = cleanSegmentPrefix(line);
      if (!cleanedLine) continue;
      const parts = splitItemsOutsideParens(cleanedLine);
      for (const p of parts) {
        const seg = cleanSegmentPrefix(p);
        if (seg) segments.push(seg);
      }
    }

    const parsedSegments = segments.map(parseIngredientSegment);

    // 判定是否进入「纯菜名清单模式」（Q4=A）
    // 条件：无显式标题（或仅有多行菜名）、>=2 项、所有项均无明确用量且无模糊用量，且至少 2 项命中食物库
    const allNoQty = parsedSegments.length >= 2 && parsedSegments.every((p) => !p.hasExplicitQty && !p.isFuzzy);
    let mode = 'recipe';
    if (allNoQty && !recipeName) {
      const hitCount = parsedSegments.filter((p) => matchFoodInDatabase(p.rawName, database, false).matched).length;
      if (hitCount >= 2) {
        mode = 'dish_list';
      }
    }

    const isIngredientContext = mode === 'recipe';
    const items = parsedSegments.map((p, idx) => {
      const { matched, candidates } = matchFoodInDatabase(p.rawName, database, isIngredientContext);
      const stem = cleanStem(p.rawName);
      const isZeroCalSeasoning = ZERO_CAL_SEASONINGS.has(p.rawName) || ZERO_CAL_SEASONINGS.has(stem);

      if (mode === 'dish_list') {
        if (matched) {
          const grams = matched.unitGrams || 100;
          return {
            uid: `ing_${idx}_${Math.random().toString(36).slice(2, 6)}`,
            raw: p.raw,
            rawName: p.rawName,
            status: 'matched',
            checked: true,
            ignoredZeroCal: false,
            food: matched,
            candidates,
            grams,
            unitLabel: matched.unitName || `${grams}g`,
            basis: `按库内常见份量预览（${matched.unitName || `${grams}g`}），可逐项改克数`,
            isZeroCalSeasoning
          };
        }
        return {
          uid: `ing_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          raw: p.raw,
          rawName: p.rawName,
          status: 'unmatched',
          checked: true,
          ignoredZeroCal: false,
          food: null,
          candidates: [],
          grams: null,
          unitLabel: '',
          basis: '本地库未收录该菜品，请手动指认、新建或忽略',
          isZeroCalSeasoning
        };
      }

      // 配方菜谱模式
      if (!matched) {
        const conv = p.hasExplicitQty ? convertToGrams(p, null) : { grams: null, basis: '' };
        return {
          uid: `ing_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          raw: p.raw,
          rawName: p.rawName,
          status: 'unmatched',
          checked: true,
          ignoredZeroCal: false,
          food: null,
          candidates: [],
          grams: conv.grams,
          unitLabel: p.hasExplicitQty && conv.grams ? `${conv.grams}g` : '',
          basis: isZeroCalSeasoning
            ? '零卡/微量调料，需点击「0 卡忽略」或指认后放行'
            : (conv.grams ? `已解析用量 ${conv.grams}g · 本地库无匹配` : '本地库无匹配且用量待确认'),
          isZeroCalSeasoning
        };
      }

      if (!p.hasExplicitQty || p.isFuzzy) {
        return {
          uid: `ing_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          raw: p.raw,
          rawName: p.rawName,
          status: 'needs_weight',
          checked: true,
          ignoredZeroCal: false,
          food: matched,
          candidates,
          grams: null,
          unitLabel: '',
          basis: p.isFuzzy ? `「${p.fuzzyWord}」为模糊用量，请确认克数` : '缺少用量，请填写克数',
          isZeroCalSeasoning
        };
      }

      const conv = convertToGrams(p, matched);
      if (conv.needsWeight || conv.grams === null || conv.grams <= 0) {
        return {
          uid: `ing_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          raw: p.raw,
          rawName: p.rawName,
          status: 'needs_weight',
          checked: true,
          ignoredZeroCal: false,
          food: matched,
          candidates,
          grams: null,
          unitLabel: '',
          basis: conv.basis || '单件克重未知，请填写克数',
          isZeroCalSeasoning
        };
      }

      return {
        uid: `ing_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        raw: p.raw,
        rawName: p.rawName,
        status: 'matched',
        checked: true,
        ignoredZeroCal: false,
        food: matched,
        candidates,
        grams: conv.grams,
        unitLabel: `${conv.grams}g`,
        basis: conv.basis,
        isZeroCalSeasoning
      };
    });

    return {
      mode,
      recipeName: recipeName || '',
      items
    };
  }

  return {
    parseText,
    matchFoodInDatabase,
    cleanStem,
    parseFoodUnitDefinition,
    normalizeChineseQuantities
  };
}));
