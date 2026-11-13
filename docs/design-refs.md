# Дизайн-референсы: motionsites.ai

Библиотека промптов для ИИ-конструкторов (Lovable, Cursor и т. п.) с превью сайтов. Для нас это **база идей**:
смотрим приёмы и пишем их сами под клиента. Чужой код, тексты и картинки не берём. Большинство примеров платные
(«Go Unlimited»); пометка «бесплатно» — промпт открыт.

Открыть пример: `https://motionsites.ai/?prompt=<id>`. Поиск — лупа в шапке сайта.
Цифра перед названием — лайки на сайте (популярность на 13.11.2026).

Доступ из облачных сессий Claude (окружение `demos`): `motionsites.ai`, `www.motionsites.ai`,
`mjofeydconwqhnyyylsd.supabase.co` (данные), `pub-86dc5b5484314368ac5436a674b0d919.r2.dev` (превью).

## Строители и недвижимость

| ♥ | Пример | id | Что взять |
|---|---|---|---|
| 585 | Zenith Realty | `zenith-realty-landing` | светлый редакционный стиль, сетка проектов с ценой |
| 416 | Luxury Real Estate | `luxury-real-estate` | огромный узкий шрифт, цифры-счётчики, фото по прокрутке |
| 171 | Mountain Retreat («Norvik Slowhouse») | `mountain-retreat` | крупный заголовок поверх сцены, стеклянные плашки на деталях дома |
| 304 | Sky Estate | `sky-estate` | сказочный фон-видео, мечта о доме |
| 163 | 3D Property | `3d-property` | 3D-планировка этажа в интерфейсе |
| 151 | Monolith Hero | `monolith-hero` (бесплатно) | кинематографичный тёмный первый экран |
| 261 | Build With Us | `build-with-us` (бесплатно) | форма заявки поверх пейзажа |
| 51 | BuildShield | `buildshield` | стройка: жёлтый, каска, «снимаем риски» |

Уже сделано в Ардене (`estate/`): заголовок по буквам, плашки `chips` на доме, счётчики, манифест по словам,
коллекция с широкими проектами и ценой плашкой на фото.

## Кафе и рестораны

| ♥ | Пример | id |
|---|---|---|
| 200 | Sky Cookie | `sky-cookie` |
| 70 | Menuchi | `menuchi` |
| 46 | Coffee Rewards | `coffee-rewards` (бесплатно) — программа лояльности |
| 8 | Chef Stack | `chef-stack` — интерактивное меню |

## Салоны и красота

| ♥ | Пример | id |
|---|---|---|
| 360 | Celestial Renewal | `celestial-renewal` (бесплатно) |
| 287 | Nature Ritual | `nature-ritual` |
| 247 | Wellness Balance | `wellness-balance` (бесплатно) |
| 128 | Beauty Categories | `beauty-categories` (бесплатно) — блок категорий услуг |

## Авто

| ♥ | Пример | id |
|---|---|---|
| 325 | Veyra Electric | `veyra-electric` (бесплатно) |
| 224 | Avelon Drive | `avelon-drive` |
| 112 | New Era Automotive Hero | `8` |
| 93 | Roadster 3D | поиск «Roadster» — 3D-машина на первом экране |

## Цветочные (конфигуратор букета)

| ♥ | Пример | id |
|---|---|---|
| 467 | Bloom AI | `bloom-ai-hero` (бесплатно) |
| 297 | Luxury Botanical | `luxury-botanical` |
| 214 | Flower Valley | `fernhollow` (бесплатно) — 3D-сцена |
| 100 | Dream Garden | `dream-garden` |

## Клубы и события

| ♥ | Пример | id |
|---|---|---|
| 132 | Vinyl | `vinyl` (бесплатно) |
| 114 | Yacht Club | `yacht-club-hero` |
| 23 | Verra Events Hero | `verra-events-hero` (бесплатно) — афиша сообщества |

## Фитнес и тренеры

| ♥ | Пример | id |
|---|---|---|
| 136 | Routine Coach | `routine-coach` |
| 101 | Fitness Dashboard | `fitness-dashboard` — кабинет ученика |
| 99 | Yoga Coach | `yoga-coach` |

## Приёмы, которые переносятся в любую нишу

- Заголовок по буквам или словам, из размытия — первый экран.
- Стеклянные плашки (`backdrop-filter`) поверх фото или сцены: факты о товаре там, где на него смотрят.
- Цифры-счётчики («лет на рынке», «клиентов») при появлении.
- Текст, проявляющийся по словам вместе с прокруткой.
- Сетка с чередованием: широкий проект → два узких; цена плашкой на фото.
- Всё выключать при «уменьшить движение» и проверять на телефоне.
