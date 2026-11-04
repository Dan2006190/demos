/* =====================================================================
   ЦЕНЫ СТРОЙДЕМО — ПРИМЕРНЫЕ (ДЕМО). Общие для калькулятора (index.html)
   и для «Ремонта в 3D» (viz.html).
   Компания заменяет их на свои: меняйте только числа в этом объекте.

   Калькулятор:
   work      — стоимость работ за единицу (м² или м³) по уровням
   materials — стоимость материалов за единицу по уровням
   options   — доп. опции: цена за единицу для каждого вида работ
               (нет ключа вида работ — опция для него недоступна),
               min — минимальная стоимость опции
   spread    — ширина вилки цены: 0.12 = ±12% (и в калькуляторе, и в 3D)

   Ремонт в 3D (finish):
   floor / walls / ceiling — покрытия, цена за м²: work — работы, mat — материалы
   skirting — плинтус, цена за погонный метр

   Дом снаружи в 3D (exterior) — ВСЕ ЦЕНЫ ПРИМЕР:
   roof / facade / plinth — кровля, фасад, цоколь, цена за м²: work — работы, mat — материалы
   gutter   — водосточная система, цена за погонный метр (желоба и трубы)
   demoRoof — демонтаж старой кровли за м²
   porch    — крыльцо за штуку (у каждой двери)
   ===================================================================== */
const PRICES = {
  currency: '₽',
  spread: 0.12,
  levels: {
    econ: { name: 'Эконом',   desc: 'Бюджетные материалы российских производителей' },
    std:  { name: 'Стандарт', desc: 'Оптимум цены и качества, популярные бренды' },
    prem: { name: 'Премиум',  desc: 'Материалы премиум-класса, сложная отделка' }
  },
  works: {
    turnkey: {
      name: 'Ремонт квартиры под ключ', unit: 'м²', qtyLabel: 'Площадь квартиры',
      min: 10, max: 500, step: 1, def: 50,
      work:      { econ: 7000, std: 9500,  prem: 13500 },
      materials: { econ: 6000, std: 10000, prem: 18000 }
    },
    cosmetic: {
      name: 'Косметический ремонт', unit: 'м²', qtyLabel: 'Площадь помещений (по полу)',
      min: 5, max: 500, step: 1, def: 40,
      work:      { econ: 2500, std: 3500, prem: 5000 },
      materials: { econ: 1200, std: 2200, prem: 4000 }
    },
    foundation: {
      name: 'Фундамент', unit: 'м³', qtyLabel: 'Объём бетона',
      min: 1, max: 300, step: 0.5, def: 20,
      work:      { econ: 3500, std: 4500, prem: 6000 },
      materials: { econ: 7000, std: 8500, prem: 11000 }
    },
    roof: {
      name: 'Кровля', unit: 'м²', qtyLabel: 'Площадь кровли',
      min: 10, max: 1000, step: 1, def: 120,
      work:      { econ: 900, std: 1300, prem: 1900 },
      materials: { econ: 800, std: 1600, prem: 3200 }
    },
    facade: {
      name: 'Фасад', unit: 'м²', qtyLabel: 'Площадь фасада',
      min: 10, max: 2000, step: 1, def: 150,
      work:      { econ: 1200, std: 1700, prem: 2500 },
      materials: { econ: 900,  std: 1800, prem: 3500 }
    }
  },
  options: {
    demolition: {
      name: 'Демонтаж', desc: 'Снятие старых покрытий и конструкций',
      prices: { turnkey: 500, cosmetic: 250, roof: 300, facade: 250 }
    },
    garbage: {
      name: 'Вывоз мусора', desc: 'Погрузка и вывоз строительного мусора',
      prices: { turnkey: 150, cosmetic: 80, foundation: 250, roof: 120, facade: 100 },
      min: 3500
    },
    design: {
      name: 'Дизайн-проект', desc: 'Планировка, визуализация, рабочие чертежи',
      prices: { turnkey: 1200, cosmetic: 600, facade: 300 },
      min: 20000
    }
  },
  finish: {
    floor: {
      lam_light: { name: 'Ламинат светлый', desc: '33 класс, с подложкой', work: 450,  mat: 1100 },
      lam_dark:  { name: 'Ламинат тёмный',  desc: '33 класс, с подложкой', work: 450,  mat: 1300 },
      tile:      { name: 'Плитка',          desc: 'Керамогранит 60×60',    work: 1400, mat: 1500 },
      spc:       { name: 'Кварцвинил',      desc: 'Замковый, влагостойкий', work: 550, mat: 2100 }
    },
    walls: {
      paint:     { name: 'Покраска', desc: 'Шпаклёвка, грунт, 2 слоя', work: 650,  mat: 250 },
      wallpaper: { name: 'Обои',     desc: 'Флизелиновые, с подготовкой', work: 500, mat: 550 },
      tile:      { name: 'Плитка',   desc: 'Настенная 30×60, для ванной', work: 1700, mat: 1300 }
    },
    ceiling: {
      paint:   { name: 'Покраска',        desc: 'Шпаклёвка, 2 слоя',    work: 750, mat: 200 },
      stretch: { name: 'Натяжной глянец', desc: 'ПВХ-полотно, монтаж',  work: 450, mat: 550 }
    },
    skirting: { name: 'Плинтус', unit: 'пог. м', work: 200, mat: 280 }
  },
  exterior: {
    note: 'пример',
    roof: {
      tile_red:      { name: 'Металлочерепица красная', work: 1300, mat: 1100 },
      tile_graphite: { name: 'Металлочерепица графит',  work: 1300, mat: 1100 },
      tile_brown:    { name: 'Металлочерепица коричневая', work: 1300, mat: 1100 },
      prof:          { name: 'Профнастил',     work: 1100, mat: 800 },
      soft:          { name: 'Мягкая кровля',  work: 1300, mat: 1400 },
      seam:          { name: 'Фальцевая',      work: 1900, mat: 2200 }
    },
    facade: {
      siding_light:  { name: 'Сайдинг светлый',    work: 1200, mat: 900 },
      siding_dark:   { name: 'Сайдинг тёмный',     work: 1200, mat: 1100 },
      brick:         { name: 'Панели под кирпич',  work: 1500, mat: 1800 },
      stone:         { name: 'Панели под камень',  work: 1700, mat: 2300 },
      plaster_white: { name: 'Штукатурка белая',   work: 1400, mat: 700 },
      plaster_grey:  { name: 'Штукатурка серая',   work: 1400, mat: 750 }
    },
    plinth: {
      plaster: { name: 'Штукатурка серая', work: 1200, mat: 500 },
      stone:   { name: 'Под камень',       work: 1700, mat: 2300 },
      clinker: { name: 'Клинкер тёмный',   work: 1800, mat: 2400 }
    },
    gutter:   { name: 'Водостоки', unit: 'пог. м', work: 450, mat: 850 },
    demoRoof: { name: 'Демонтаж старой кровли', unit: 'м²', work: 300, mat: 0 },
    porch: {
      plain:  { name: 'Со ступенями', unit: 'шт.', work: 25000, mat: 20000 },
      canopy: { name: 'С навесом',    unit: 'шт.', work: 38000, mat: 37000 }
    }
  }
};
