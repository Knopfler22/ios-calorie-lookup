import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// 1. JS syntax check across all core files
const jsFiles = ['china_food_db.js', 'data.js', 'recipe_parser.js', 'app.js', 'sw.js'];
for (const file of jsFiles) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

// 2. Database count (1,884 = 246 handwritten + 1,638 CFCD) & nutrient guard
const cfcdCode = fs.readFileSync('china_food_db.js', 'utf8');
const dataCode = fs.readFileSync('data.js', 'utf8');

const ctx1 = {};
vm.runInNewContext(`${cfcdCode}\n${dataCode}\nglobalThis.__db = FOOD_DATABASE;`, ctx1);
assert.equal(ctx1.__db.length, 1884, 'Expected 1,884 total foods');
assert.equal(ctx1.__db.filter((x) => !x.isStandard).length, 246, 'Expected 246 handwritten foods');
assert.equal(ctx1.__db.filter((x) => x.isStandard).length, 1638, 'Expected 1,638 CFCD foods');

const ctx2 = {};
vm.runInNewContext(
  `${cfcdCode}\nCHINA_FOOD_COMP_RAW.push(["bad1","缺热量","veg","🥬",null,1,1,1,"","",""],["bad2","负蛋白","veg","🥬",10,1,-1,1,"","",""],["bad3","NaN脂肪","veg","🥬",10,1,1,NaN,"","",""],["good1","正常测试菜","veg","🥬",25,4,2,0.5,"","",""]);\n${dataCode}\nglobalThis.__db = FOOD_DATABASE;`,
  ctx2
);
assert.equal(ctx2.__db.some((x) => x.id && x.id.startsWith('cfcd_bad')), false, 'Invalid nutrient rows must be dropped');
assert.equal(ctx2.__db.some((x) => x.id === 'cfcd_good1'), true, 'Valid row must be kept');
assert.equal(ctx2.__db.length, 1885);

// 3. T1-T5 offline text import assertions
const RecipeParser = require('../recipe_parser.js');
const db = ctx1.__db;

function calcNutrition(food, grams) {
  const ratio = grams / 100;
  return {
    kcal: Math.round(food.kcal * ratio),
    protein: +(food.protein * ratio).toFixed(1)
  };
}

function summarize(items) {
  let totalGrams = 0;
  let totalKcal = 0;
  let totalProtein = 0;
  for (const it of items) {
    if (it.status === 'matched' && it.grams > 0 && it.food) {
      const n = calcNutrition(it.food, it.grams);
      totalGrams += it.grams;
      totalKcal += n.kcal;
      totalProtein += n.protein;
    }
  }
  return {
    totalGrams: Math.round(totalGrams),
    totalKcal: Math.round(totalKcal),
    totalProtein: +totalProtein.toFixed(1)
  };
}

// T1
const t1 = RecipeParser.parseText(
  '黑椒鸡胸炒西兰花\n原料：鸡胸肉 200g、西兰花 150克、橄榄油 1勺、生抽 1勺\n做法：鸡胸肉切丁腌制，热锅放油炒熟，加入焯水西兰花和生抽翻炒出锅。',
  db
);
assert.equal(t1.mode, 'recipe');
assert.equal(t1.recipeName, '黑椒鸡胸炒西兰花');
assert.equal(t1.items.length, 4);
assert.deepEqual(summarize(t1.items), { totalGrams: 375, totalKcal: 414, totalProtein: 54.2 });

// T2
const t2 = RecipeParser.parseText('【番茄鸡蛋配牛奶早餐】\n2个西红柿，两个鸡蛋，纯牛奶250毫升，食用油1勺', db);
assert.equal(t2.mode, 'recipe');
assert.equal(t2.recipeName, '番茄鸡蛋配牛奶早餐');
assert.equal(t2.items.length, 4);
assert.deepEqual(summarize(t2.items), { totalGrams: 660, totalKcal: 446, totalProtein: 24.0 });

// T3
const t3 = RecipeParser.parseText('牛油果鸡胸轻食碗\n鸡胸肉150g + 半个牛油果 + 生菜100g + 奇亚籽10g + 黑松露酱15g', db);
assert.equal(t3.mode, 'recipe');
assert.equal(t3.recipeName, '牛油果鸡胸轻食碗');
assert.equal(t3.items.filter((x) => x.status === 'matched').length, 3);
assert.equal(t3.items.filter((x) => x.status === 'unmatched').length, 2);
assert.deepEqual(summarize(t3.items), { totalGrams: 325, totalKcal: 335, totalProtein: 39.8 });

// T4
const t4 = RecipeParser.parseText('减脂番茄鸡蛋面\n荞麦面（熟）150g、半个西红柿、1个鸡蛋、食用油适量、食盐少许', db);
assert.equal(t4.mode, 'recipe');
assert.equal(t4.recipeName, '减脂番茄鸡蛋面');
assert.equal(t4.items.filter((x) => x.status === 'matched').length, 3);
assert.equal(t4.items.filter((x) => x.status === 'needs_weight').length, 1);
assert.equal(t4.items.filter((x) => x.status === 'unmatched').length, 1);
assert.deepEqual(summarize(t4.items), { totalGrams: 275, totalKcal: 235, totalProtein: 15.0 });

// T5
const t5 = RecipeParser.parseText('番茄炒蛋、宫保鸡丁、蒜蓉清炒西兰花、白米饭', db);
assert.equal(t5.mode, 'dish_list');
assert.equal(t5.items.length, 4);
assert.deepEqual(summarize(t5.items), { totalGrams: 920, totalKcal: 1108, totalProtein: 64.6 });

console.log('verify_core.mjs: ALL CHECKS PASSED (5 JS syntax, 1,884 foods + guard, T1-T5)');
