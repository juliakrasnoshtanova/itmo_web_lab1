const canvas = document.getElementById('canvas'); //для графика
const ctx = canvas.getContext('2d'); // для рисования на графике
const PADDING = 20;
const R_VALUES = [1, 1.5, 2, 2.5, 3];
const R_MAX = Math.max(...R_VALUES);
const ALLOWED_X_VALUES = new Set([-4, -3, -2, -1, 0, 1, 2, 3, 4]);
const R_COLORS = [
    { value: 1, color: 'rgba(52, 152, 219, 0.45)' },
    { value: 1.5, color: 'rgba(46, 204, 113, 0.45)' },
    { value: 2, color: 'rgba(241, 196, 15, 0.45)' },
    { value: 2.5, color: 'rgba(231, 76, 60, 0.45)' },
    { value: 3, color: 'rgba(155, 89, 182, 0.45)' }
];

//четкость графика
const dpr = window.devicePixelRatio || 1; //плотность пикселей
const cssW = canvas.clientWidth; //ширина графика
const cssH = canvas.clientHeight; //высота графика
canvas.width  = Math.round(cssW * dpr); //реальная ширина канвас
canvas.height = Math.round(cssH * dpr); //реальная высота канвас
ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // масштабируем четкий график

const isAllowedRValue = (num) => R_VALUES.some(v => Math.abs(v - num) < 1e-9); // проверка что число входит в список допустимых R

const X_CHECKBOXES = Array.from(document.querySelectorAll('#paramX input[type="checkbox"]')); // берем чекбоксы Х
const R_CHECKBOXES = Array.from(document.querySelectorAll('#paramR input[type="checkbox"]')); // берем чекбоксы R
const X_CANON_VALUES = new Map(); //map для кода элемента X (проверка того что в чекбоксе лежит нужное значение)
const R_CANON_VALUES = new Map(); //map для кода элемента R (проверка того что в чекбоксе лежит нужное значение)

X_CHECKBOXES.forEach(cb => { //для каждого чекбокса X помним эталон
    const canonical = Number(cb.value); //приводим value из чб к числу
    X_CANON_VALUES.set(cb, canonical); //кладем в мапу для Х
});

R_CHECKBOXES.forEach(cb => { //для каждого чб R помним эталон
    const canonical = Number(cb.value); //приводим value из чб к числу
    R_CANON_VALUES.set(cb, canonical); //кладем в мапу для R
});

function sanitizeXSelections() { //чистка подменённых value
    const values = []; //массив найденных подходящих Х
    let invalid = false; //флаг для некорректных
    let hadSelection = false; //флаг был ли выбран хоть один чекбокс Х
    for (const cb of X_CHECKBOXES) { //проход по всем чб Х
        if (!cb.checked) { //скип неотмеченных
            continue;
        }
        hadSelection = true; // когда чб был выбран
        const canonical = X_CANON_VALUES.get(cb); //достаем эталон для этого чб
        if (!Number.isFinite(canonical) || !ALLOWED_X_VALUES.has(canonical)) { // проверка на огр и входит в разрешенный набор
            invalid = true;
            continue;
        }
        const current = Number(cb.value); //запрет подмены
        if (!Number.isFinite(current) || Math.abs(current - canonical) > 1e-9) { //проверка чтоб текущий элемент не отличался от эталона
            invalid = true; // иначе - инвалид
            continue;
        }
        values.push(canonical); // если ок - добавляем Х в список values
    }
    return { values, invalid, hadSelection }; //выводим значение иксов и значения флагов инвалид и хед селекшн
}

function sanitizeRSelections() { //допуск R
    const values = []; //массив валидных R
    let invalid = false; //флаг некорректных значений
    let hadSelection = false;
    for (const cb of R_CHECKBOXES) {
        if (!cb.checked) {
            continue;
        }
        hadSelection = true;
        const canonical = R_CANON_VALUES.get(cb);
        if (!Number.isFinite(canonical) || !isAllowedRValue(canonical)) {
            invalid = true;
            continue;
        }
        const current = Number(cb.value);
        if (!Number.isFinite(current) || Math.abs(current - canonical) > 1e-9) {
            invalid = true;
            continue;
        }
        values.push(canonical);
    }
    return { values, invalid, hadSelection }; //все как у Х в функции выше
}

let W, H, ox, oy, unit; //параметры графика (ширина, высота, центр, масштаб)
let toPx = (x, y) => [0, 0]; //ф-я перевода мат. кооринат в пиксели (заполнится при перерасчете)
let lastPoints = []; //буфер последних нарисованных точек

function recalcScale() { //пересчет масштаба, центра графика под текущие размеры и r_max
    W = canvas.clientWidth; //текущие размеры канваса
    H = canvas.clientHeight;
    ox = W / 2; //центр графика
    oy = H / 2;
    const available = Math.min(W, H) - PADDING * 2; //из доступной области вычитаем внутренние отступы
    unit = available > 0 ? available / (2 * (R_MAX + 1)) : 0; //координаты и пиксели соотносим
    toPx = (x, y) => [ox + x * unit, oy - y * unit]; //перевод (x, y) в (px, py)  (пиксели)
}

const groupX = document.getElementById("paramX"); //контейнер для значений Х
groupX.addEventListener('change', () => { //при изменении Х
    sanitizeXSelections(); //проверяем Х на подмены и вхождение в мн-во разрешенных значений
    drawScene();
    renderLastPoints(); //дорисовываем сохраненные точки поверх нового графика
});
const groupR = document.getElementById("paramR"); //контейнер для R
const rowsBody = document.getElementById('rows'); //таблца истории
const LS_KEY = 'hit_history_v2'; //записываем значение в local storage для истории

groupR.addEventListener('change', () => {  //при изменении R собираем выбранные R и перерисовываем график и точки
    const meta = sanitizeRSelections(); //фильтруем R и берем массив полученных значений
    drawScene(meta.values); //рисуем график с конкретным-и набором-и R
    renderLastPoints(); //дорисовываем последние точки
});

const y = document.getElementById("y"); //поле Y
const formError = document.getElementById('formError'); //ошибки формы

const s = (v) => (v == null ? '' : String(v)); //утилита: безопасно в строку
const fmtTime = (iso) => { //утилита форматирования времени исо в локальную строку
    try {
        return new Date(iso).toLocaleString(); //локализированный формат времени
    } catch {
        return s(iso); //если исо плохой то вернуть как строку
    }
};

const saveHistory = (list) => localStorage.setItem(LS_KEY, JSON.stringify(list)); //сохраняем историю в local storage
const loadHistory = () => { //загрузить историю из local storage
    try {
        return JSON.parse(localStorage.getItem(LS_KEY)) || []; // парсим json; если пусто []
    } catch {
        return []; //при ошибке парсинга - []
    }
};

function renderTable(history) { //отрисовка таблицы истории
    rowsBody.innerHTML = ''; //очищаем tbody
    const frag = document.createDocumentFragment(); //для быстрой вставки строк
    history.forEach((row, idx) => { //перебор записей истории
        const tr = document.createElement('tr'); //создаем строку <tr>
        const td = (text) => { // <td> с текстом
            const c = document.createElement('td');
            c.textContent = text;
            return c;
        };

        const hitCell = (() => { //ячейка "попадание": ставим зел галочку или крас крестик
            const c = td(row.hit ? '✓' : '✗');
            c.style.color = row.hit ? '#2ecc71' : '#e74c3c';
            return c;
        })();

        tr.append( //собираем ряд из колонок
            td(String(idx + 1)), //номер
            td(fmtTime(row.now)), // время
            td(s(row.x)),
            td(s(row.y)),
            td(s(row.r)),
            hitCell, // галочка / крестик
            td(s(row.elapsed_ms)) //обработка в мил. сек.
        );
        frag.appendChild(tr); //добавление строки во фраг
    });
    rowsBody.appendChild(frag); //вставляем все строки одним разом
}

function mergeHistoryFromServerOrLocal(serverData) { //история: либо из того что отдал сервер после запроса, либо из local storage
    if (serverData && Array.isArray(serverData.history)) { //серверная история круче
        const hist = serverData.history;
        saveHistory(hist); // кешируем в local storage (чтобы пережить перезагрузку)
        return hist;
    }
    return loadHistory(); //иначе - local storage
}

function checkY() { //проверка введенного пользователем Y
    const raw = y.value.trim(); //берем строку из поля
    if (!raw) { //если пусто - то сообщение
        y.setCustomValidity("Введите значение Y.");
        return false;
    }
    const normalized = raw.replace(",", "."); //поддержка запятой (замена на точку)
    const n = Number(normalized); //пробуем парсить число
    if (!Number.isFinite(n)) { // если не число - то сообщение
        y.setCustomValidity("Y должен быть числом.");
        return false;
    }
    if (n < -5 || n > 5) { //проверка диапазона
        y.setCustomValidity("Y должен быть в диапазоне [-5; 5].");
        return false;
    }
    y.setCustomValidity(""); //если ок - снимаем ошибку
    return true;
}

y.addEventListener("blur", () => { //при уходе из поля Y - валидируем и показываем сообщение под формой
    if (!y.value.trim()) {
        y.setCustomValidity(""); //если пусто - очищаем сообщения и выходим
        if (formError.dataset.source === 'y') {
            formError.textContent = '';
            delete formError.dataset.source;
        }
        return;
    }
    const valid = checkY(); //проверяем Y
    if (!valid) { //если ошибка есть - выводим ее в #formError
        formError.textContent = y.validationMessage;
        formError.dataset.source = 'y';
    } else if (formError.dataset.source === 'y') { //иначе - очищаем прошлую ошибку
        formError.textContent = '';
        delete formError.dataset.source;
    }
    y.reportValidity(); //показываем подсказку при вводе для y
})

y.addEventListener('input', () => { //во время набора - снимаем сообщение о валидности
    if (formError.dataset.source === 'y') {
        formError.textContent = '';
        delete formError.dataset.source;
    }
    y.setCustomValidity("");
});

function formatTick(value) { //формат делений осей: до 4 знаков, без лишних нулей
    return parseFloat(value.toFixed(4)).toString();
}

function getRegionColor(r, idx) { //цвет области по конкретному R
    const match = R_COLORS.find(entry => Math.abs(entry.value - r) < 1e-9); //ищем в заданной палитре по значению R
    if (match) {
        return match.color;
    }
    const fallback = [ //циклическая палитра для остальных
        'rgba(52, 152, 219, 0.45)',
        'rgba(46, 204, 113, 0.45)',
        'rgba(241, 196, 15, 0.45)',
        'rgba(231, 76, 60, 0.45)',
        'rgba(155, 89, 182, 0.45)'
    ];
    return fallback[idx % fallback.length];
}

function drawAxes() { //рисуем оси, стрелки и подписи
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#333';
    ctx.fillStyle = '#333';
    ctx.font = '12px system-ui';

    const left = PADDING; //границы рабочей области с учетом паддингов
    const right = W - PADDING;
    const top = PADDING;
    const bottom = H - PADDING;

    //оси
    ctx.beginPath();
    ctx.moveTo(left, oy); ctx.lineTo(right, oy);
    ctx.moveTo(ox, top); ctx.lineTo(ox, bottom);
    ctx.stroke();

    // стрелки
    //ось x
    ctx.beginPath();
    ctx.moveTo(right - 12, oy - 5);
    ctx.lineTo(right, oy);
    ctx.lineTo(right - 12, oy + 5);
    ctx.stroke();
    //ось y
    ctx.beginPath();
    ctx.moveTo(ox - 5, top + 12);
    ctx.lineTo(ox, top);
    ctx.lineTo(ox + 5, top + 12);
    ctx.stroke();

    //подписи осей
    ctx.fillText('x', right - 16, oy - 8);
    ctx.fillText('y', ox + 8, top + 12);

    //подписи -Rmax, -Rmax/2, Rmax/2, Rmax
    const ticks = [-R_MAX, -R_MAX / 2, R_MAX / 2, R_MAX];
    ticks.forEach(t => {
        //по x
        let [tx, ty] = toPx(t, 0);
        ctx.beginPath();
        ctx.moveTo(tx, oy - 5); ctx.lineTo(tx, oy + 5); ctx.stroke();
        ctx.fillText(formatTick(t), tx - 12, oy + 16);

        //по y
        [tx, ty] = toPx(0, t);
        ctx.beginPath();
        ctx.moveTo(ox - 5, ty); ctx.lineTo(ox + 5, ty); ctx.stroke();
        ctx.fillText(formatTick(t), ox + 8, ty + 4);
    });

    ctx.restore();
}
//рисуем одну область для конкретного R заданным цветом
function drawRegion(R, fillColor) {
    ctx.save();
    ctx.fillStyle = fillColor;

    //квадрат в 1 четверти: 0<=x<=R, 0<=y<=R
    {
        const [x0, y0] = toPx(0, R);
        const w = R * unit;
        const h = R * unit;
        ctx.fillRect(x0, y0, w, h);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = fillColor;
        ctx.strokeRect(x0, y0, w, h);
    }

    // треугольник в 3 четверти: (-R/2,0)-(0,0)-(0,-R/2)
    {
        const p1 = toPx(-R / 2, 0);
        const p2 = toPx(0, 0);
        const p3 = toPx(0, -R / 2);
        ctx.beginPath();
        ctx.moveTo(...p1);
        ctx.lineTo(...p2);
        ctx.lineTo(...p3);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = fillColor;
        ctx.stroke();
    }

    // четверть круга в 4 четверти: радиус R/2
    {
        const [cx, cy] = toPx(0, 0);
        const rad = (R / 2) * unit;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, rad, 0, Math.PI / 2, false);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = fillColor;
        ctx.stroke();
    }

    ctx.restore();
}
//начало координат и отметка 0
function drawOrigin() {
    const [x0, y0] = toPx(0, 0); // перевод (0,0) в пиксели
    ctx.save();

    //точка в начале координат
    ctx.beginPath();
    ctx.arc(x0, y0, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#111';   // тёмная заливка
    ctx.fill();

    //подпись
    ctx.font = '12px system-ui';
    ctx.fillStyle = '#111';
    ctx.fillText('0', x0 + 6, y0 - 6);

    ctx.restore();
}
//рисуем все выбранные области сразу (если их несколько) от большей к меньшей
function drawAllRegions(selectedRs) {
    if (!Array.isArray(selectedRs) || !selectedRs.length) {
        return;
    }
    const sorted = [...selectedRs].sort((a, b) => a - b);
    for (let i = sorted.length - 1; i >= 0; i--) {
        const r = sorted[i];
        if (!Number.isFinite(r) || r <= 0) {
            continue;
        }
        drawRegion(r, getRegionColor(r, sorted.length - 1 - i));
    }
}
//полный кадр: масштаб, очистка, области, оси, 0
function drawScene(selectedRs = null) {
    recalcScale();
    ctx.clearRect(0, 0, W, H);
    const rsToDraw = Array.isArray(selectedRs) ? selectedRs : sanitizeRSelections().values;
    drawAllRegions(rsToDraw);
    drawAxes();
    drawOrigin();
}
//первый рендер графика при загрузке
drawScene();
//зеленая точка

//рисовалка точки (зеленая - попала; красная - не попала)
function drawPoint(x, y, hit) {
    const [px, py] = toPx(x, y);
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = hit ? '#2ecc71' : '#e74c3c';  // зелёный / красный
    ctx.fill();
}
//перерисовываем все последние точки поверх новой сцены
function renderLastPoints() {
    for (const point of lastPoints) {
        if (Number.isFinite(point.x) && Number.isFinite(point.y)) {
            drawPoint(point.x, point.y, point.hit);
        }
    }
}
//определяем базовый origin API: текущий сайт или локальный порт
const DEFAULT_API_ORIGIN = (() => {
    const origin = window.location.origin;
    return origin && origin !== 'null' ? origin : 'http://127.0.0.1:16350';
})();
//базовый URL эндпоинта проверки (дальше добавим параметры)
const API_ENDPOINT = new URL('/api/check', DEFAULT_API_ORIGIN);
//вызываем /api/check для набора X, одного Y и набора R
async function checkPointsOnServer(xs, y, rs) {
    // собираем параметры
    const params = new URLSearchParams();
    xs.forEach(value => params.append('checkX', String(value)));
    params.append('checkY', String(y));
    rs.forEach(value => params.append('checkR', String(value)));
    //копируем базовый URL и навешиваем парамы
    const url = new URL(API_ENDPOINT);
    url.search = params.toString();
    //делаем GET без кэша
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    //читаем ответ текстом (может быть JSON или просто true/false)
    const text = (await res.text()).trim();
    //HTTP-ошибка выкидываем исключение
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    try {
        //пробуем распарсить json
        return JSON.parse(text || 'null');
    } catch {
        //если не json - возвращаем строку как есть
        return text;
    }
}

//форма: перехватываем submit -> ajax
const form = document.getElementById('form');
form.addEventListener('submit', async (e) => {
    //блокируем обычную отправку (перезагрузку страницы)
    e.preventDefault();
    //собираем и валидируем X / R
    const xMeta = sanitizeXSelections();
    const rMeta = sanitizeRSelections();
    const yEl = document.getElementById('y');
    //нет валидного X -> выводим сообщение и перерисовываем график
    if (!xMeta.values.length) {
        formError.textContent = xMeta.hadSelection
            ? 'Выбрано недопустимое значение X.'
            : 'Пожалуйста, выберите значение X.';
        formError.dataset.source = 'x';
        drawScene(rMeta.values);
        renderLastPoints();
        return;
    }
    //если в чекбоксе X были подмены / ошибки
    if (xMeta.invalid) {
        formError.textContent = 'Выбрано недопустимое значение X.';
        formError.dataset.source = 'x';
        drawScene(rMeta.values);
        renderLastPoints();
        return;
    }
    //нет валидного R
    if (!rMeta.values.length) {
        formError.textContent = rMeta.hadSelection
            ? 'Выбрано недопустимое значение R.'
            : 'Пожалуйста, выберите значение R.';
        formError.dataset.source = 'r';
        drawScene(rMeta.values);
        renderLastPoints();
        return;
    }
    //если в чекбоксе R были подмены / ошибки
    if (rMeta.invalid) {
        formError.textContent = 'Выбрано недопустимое значение R.';
        formError.dataset.source = 'r';
        drawScene(rMeta.values);
        renderLastPoints();
        return;
    }
    //проверяем корректность ввода парама Y
    if (!checkY()) {
        formError.textContent = y.validationMessage;
        formError.dataset.source = 'y';
        y.reportValidity();
        return;
    }
    //убираем прошлые сообщения об ошибках
    formError.textContent = '';
    delete formError.dataset.source;
    //обработка запятой в Y
    const yNormalized = yEl.value.trim().replace(',', '.');
    //сохраняем X / R
    const xs = xMeta.values;
    const rsNumeric = rMeta.values;
    //для запроса серверу R нужны как строки (поддержка точности 1.5 и тд)
    const rsNormalized = rsNumeric.map((r) => r.toString());

    try {
        //отправляем get запрос на сервер; вызываем сервер на набор точек (перебор всех XxR с одним Y); get запрос на сервер
        const data = await checkPointsOnServer(xs, yNormalized, rsNormalized);
        //ожидаем json с points[]; fallback - пустой список
        const points = Array.isArray(data?.points) ? data.points : [];
        //перерисовываем график под выбранные R
        drawScene(rsNumeric);
        // собираем отрисованные точки, чтобы восстановить их при смене R
        const drawnPoints = [];
        //рисуем каждую точку из ответа сервера
        for (const point of points) {
            const px = Number(point.x);
            const py = Number(point.y);
            const pr = Number(point.r);
            const hit = Boolean(point.hit);
            if (Number.isFinite(px) && Number.isFinite(py)) {
                drawPoint(px, py, hit);
                drawnPoints.push({ x: px, y: py, r: Number.isFinite(pr) ? pr : null, hit });
            }
        }
        //сохраняем последние точки для перерисовки следующих drawScence()
        lastPoints = drawnPoints;
        //история: серверная (если есть) или локальная
        const history = mergeHistoryFromServerOrLocal(data);
        //рендер таблицы
        renderTable(history);
    } catch (err) {
        //ошибки сети/бэкенда аккуратно отображаем
        console.error('Backend error:', err);
        formError.textContent = `Ошибка сервера: ${err.message || 'не удалось связаться'}`;
        formError.dataset.source = 'server';
        //перерисовываем график и восстанавливаем прошлые точки
        drawScene(rsNumeric);
        renderLastPoints();
    }
});
// при открытии страницы - показываем историю из local storage (до первого запроса к серверу)
window.addEventListener('load', () => {
    const cached = loadHistory();
    if (cached.length) {
        renderTable(cached);
    }
});

const n = document.getElementById("y")
n.value = 6

const k = document.getElementsByClassName("x")
k[0].value = 1


document