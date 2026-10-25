const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const money = (n) =>
    new Intl.NumberFormat("ru", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(n / 100),
  clock = (t) =>
    `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Tallinn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const dayPlus = (day, n) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dateLabel = (d) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("ru", {
    day: "numeric",
    month: "long",
  });
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let session = {},
  noticeTimer;
async function api(path, options = {}) {
  const r = await fetch("/api" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": session.csrf || "",
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (r.status === 204) return;
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error("Сервер недоступен. Попробуйте ещё раз.");
  }
  if (!r.ok)
    throw Error(
      data.error ||
        (r.status === 401
          ? "Сначала войдите в аккаунт."
          : r.status === 403
            ? "Нет доступа или сессия устарела. Обновите страницу."
            : "Не удалось выполнить запрос."),
    );
  return data;
}
function notice(text) {
  clearTimeout(noticeTimer);
  $("#notice").textContent = text;
  $("#notice").hidden = false;
  noticeTimer = setTimeout(() => ($("#notice").hidden = true), 5000);
}
function enter(el) {
  if (!el || reduced.matches) return;
  el.getAnimations().forEach((a) => a.cancel());
  el.animate(
    [
      { opacity: 0.3, transform: "translateY(6px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration: 200, easing: "cubic-bezier(.23,1,.32,1)" },
  );
}
function intro() {
  if (reduced.matches) return;
  document
    .querySelectorAll(
      ".hero .eyebrow,.hero h1,.hero p,.hero .actions,.hero-art",
    )
    .forEach((el, i) =>
      el.animate(
        [
          { opacity: 0, transform: "translateY(12px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        {
          duration: 600,
          delay: i * 60,
          easing: "cubic-bezier(.23,1,.32,1)",
          fill: "backwards",
        },
      ),
    );
}
function setTitle(t) {
  document.title = t + " · FORMA";
}
const categories = {
  Красота: "✂",
  "Здоровье и отдых": "◌",
  Авто: "↗",
  Обучение: "Aa",
  Другое: "◇",
};
function card(c, i) {
  return `<a class="company-card" href="/studio/${esc(c.slug)}"><div class="card-art art-${i % 3}"><span class="category-tag">${esc(c.category)}</span><div class="card-sculpture"></div><span class="art-symbol">${esc(categories[c.category] || "◇")}</span>${c.demo ? '<span class="demo-tag">Демо-компания</span>' : ""}</div><div class="card-body"><div class="card-meta">${esc(c.city)}</div><h3>${esc(c.name)} <span>↗</span></h3><p>${esc(c.description)}</p><div class="card-bottom"><span>${c.min_price == null ? "Скоро откроется" : `Услуги от <b>${money(c.min_price)}</b>`}</span><span>Выбрать время →</span></div></div></a>`;
}
async function home() {
  setTitle("Онлайн-запись для вашего дела");
  $("#app").innerHTML =
    `<section class="hero"><div><div class="eyebrow"><i></i> МЕНЬШЕ ЗВОНКОВ. БОЛЬШЕ ДЕЛА.</div><h1>У каждого дела<br>своя <em>форма.</em></h1><p>Любимый мастер, новая студия или забота об автомобиле.<br>Находите своё место и записывайтесь в пару кликов.</p><div class="actions"><a class="button" href="#catalog">Найти своё время <span>↘</span></a><a class="text-link" href="/demo">У меня свой бизнес ↗</a></div><div class="hero-note"><span class="mini-stack"><b>А</b><b>М</b><b>Е</b></span>Простая запись. С обеих сторон.</div></div><div class="hero-art"><span class="art-label">МЕСТО ДЛЯ ВАШИХ ПЛАНОВ</span><div class="orbit"></div><div class="sculpture a"></div><div class="sculpture b"></div><div class="floating-card"><span class="check">✓</span><div><b>Всё на своих местах.</b><small>Клиент записался. Вы занимаетесь делом.</small></div></div><span class="art-caption">MAKE TIME FOR<br>WHAT MATTERS.</span><span class="art-no">F / 02</span></div></section><section class="value-strip"><span>Для тех, кто ценит время</span><b>Без звонков</b><b>Удобное расписание</b><b>Своя страница бизнеса</b><span class="strip-star">✳</span></section><section id="catalog" class="section"><div class="section-heading"><div><div class="eyebrow">НАЙДИТЕ СВОЁ МЕСТО</div><h2>Что в ваших <em>планах?</em></h2></div><span class="muted">Начните с небольшого шага.</span></div><div class="searchbar"><label class="search-field"><span class="search-icon" aria-hidden="true"></span><input id="search" type="search" aria-label="Поиск услуги или компании" placeholder="Услуга или название компании"></label><label class="city-field"><span>Город</span><select id="city" aria-label="Город"><option value="">Все города</option></select></label></div><div class="catalog-toolbar"><div class="filters" id="filters"></div><span id="result-count" class="result-count" role="status"></span></div><p class="demo-disclaimer">Концепт для портфолио. Компании с отметкой «Демо» вымышлены; реальные услуги не оказываются.</p><div id="company-list" class="company-grid" aria-live="polite"></div></section><section class="business-banner"><div><div class="eyebrow">МАЛЕНЬКОМУ БИЗНЕСУ — БОЛЬШЕ ВОЗМОЖНОСТЕЙ</div><h2>Ваш бизнес. <br><em>Ваша страница записи.</em></h2><p>Без разработки собственного сайта. Добавьте услуги и специалистов, <br>настройте часы работы и поделитесь ссылкой с клиентами.</p><div class="actions"><a class="button" href="/dashboard">Создать страницу ↗</a><a class="text-link" href="/demo">Посмотреть кабинет →</a></div></div><div class="banner-mark">f<span>↗</span></div></section>`;
  intro();
  const companies = await api("/companies");
  let category = "Все";
  const cats = ["Все", ...new Set(companies.map((c) => c.category))];
  $("#filters").innerHTML = cats
    .map(
      (c) =>
        `<button type="button" class="pill ${c === "Все" ? "active" : ""}" data-category="${esc(c)}" aria-pressed="${c === "Все"}">${esc(c)}</button>`,
    )
    .join("");
  $("#city").innerHTML += [...new Set(companies.map((c) => c.city))]
    .map((c) => `<option>${esc(c)}</option>`)
    .join("");
  function filter() {
    const q = $("#search").value.toLocaleLowerCase().trim(),
      city = $("#city").value;
    const result = companies.filter(
      (c) =>
        (category === "Все" || c.category === category) &&
        (!city || c.city === city) &&
        `${c.name} ${c.category} ${c.description}`
          .toLocaleLowerCase()
          .includes(q),
    );
    $("#result-count").textContent = "Найдено мест: " + result.length;
    $("#company-list").innerHTML = result.length
      ? result.map(card).join("")
      : '<div class="empty">Пока ничего не нашли.<br><small>Попробуйте другой запрос или город.</small></div>';
  }
  $("#search").oninput = filter;
  $("#city").onchange = filter;
  $("#filters").onclick = (e) => {
    const b = e.target.closest("[data-category]");
    if (!b) return;
    category = b.dataset.category;
    document.querySelectorAll(".pill").forEach((p) => {
      p.classList.toggle("active", p === b);
      p.setAttribute("aria-pressed", p === b);
    });
    filter();
    enter($("#company-list"));
  };
  filter();
  if (location.hash === "#catalog") $("#catalog").scrollIntoView();
}
async function studio(slug) {
  const c = await api("/companies/" + encodeURIComponent(slug));
  setTitle(c.name);
  $("#app").innerHTML =
    `<section class="studio-intro"><a class="back" href="/#catalog">← Все компании</a><div class="studio-title"><div><div class="eyebrow">${esc(c.category)} · ${esc(c.city)}</div><h1>${esc(c.name)}</h1><p>${esc(c.description)}</p><div class="location">⌖ ${esc(c.address)}</div></div><div class="studio-badge">${esc(categories[c.category] || "◇")}</div></div>${c.demo ? '<div class="demo-alert">Демонстрационная компания. Можно попробовать запись, реальные услуги не оказываются.</div>' : ""}</section><section class="section booking-section"><div class="section-heading"><div><div class="eyebrow">ПРОСТО И БЕЗ ЗВОНКОВ</div><h2>Ваша следующая <em>запись.</em></h2></div><span class="muted">Время указано по Эстонии</span></div><div class="booking-grid"><div><h3 class="step"><span>01</span> Что сделаем?</h3><div id="services" class="services"></div><h3 class="step"><span>02</span> К кому запишемся?</h3><div id="masters" class="masters"></div><h3 class="step"><span>03</span> Когда вам удобно?</h3><div class="date-head"><span id="month"></span><div><button id="prev" class="arrow-button" aria-label="Предыдущая неделя">←</button><button id="next" class="arrow-button" aria-label="Следующая неделя">→</button></div></div><div id="dates" class="dates"></div><div id="slots" class="slots" aria-live="polite"></div><p id="booking-error" class="error" role="alert"></p></div><aside><div class="eyebrow">ВАША ЗАПИСЬ <span>↗</span></div><h2>Время <br>для <em>вас.</em></h2><div id="summary"></div><form id="booking-form"><label>Как к вам обращаться?<input name="name" placeholder="Ваше имя" minlength="2" maxlength="80" required autocomplete="given-name" value="${session.loggedIn ? esc(session.name) : ""}"></label><label>Номер телефона<input name="phone" type="tel" placeholder="+372 5555 1234" pattern="[+0-9 \\(\\)\\-]{7,25}" required autocomplete="tel"></label><label class="consent"><input name="consent" type="checkbox" required><span>Согласен передать имя и телефон компании для обработки записи. <a href="/privacy">Подробнее</a></span></label><button class="button full" type="submit">Подтвердить запись <span>↗</span></button><p class="fine">${session.loggedIn ? "Запись появится в вашем аккаунте." : "Запись без регистрации. Сохраните номер подтверждения."}</p></form></aside></div></section>`;
  if (!c.services.length || !c.staff.length) {
    $(".booking-grid").innerHTML =
      '<div class="empty">Компания готовит расписание.<br><small>Загляните чуть позже.</small></div>';
    return;
  }
  let service = c.services[0],
    master = c.staff[0],
    day = today(),
    offset = 0,
    time = null,
    request = 0,
    busy = false;
  $("#services").innerHTML = c.services
    .map(
      (s) =>
        `<button class="service" data-service="${esc(s.id)}" aria-pressed="false"><span class="radio"></span><span class="service-info"><strong>${esc(s.name)}</strong><small>${s.duration} мин · ${esc(s.description)}</small></span><b>${money(s.price)}</b></button>`,
    )
    .join("");
  $("#masters").innerHTML = c.staff
    .map(
      (m) =>
        `<button class="master" data-staff="${esc(m.id)}" aria-pressed="false"><span class="avatar">${esc(m.name[0])}</span><strong>${esc(m.name)}</strong><small>${esc(m.role)}</small></button>`,
    )
    .join("");
  function select() {
    document.querySelectorAll("[data-service],[data-staff]").forEach((el) => {
      const yes =
        el.dataset.service === service.id || el.dataset.staff === master.id;
      el.classList.toggle("active", yes);
      el.setAttribute("aria-pressed", yes);
    });
  }
  function summary() {
    $("#summary").innerHTML =
      `<div><span>Услуга</span><b>${esc(service.name)}</b></div><div><span>Специалист</span><b>${esc(master.name)}</b></div><div><span>Когда</span><b>${dateLabel(day)}${time === null ? "" : ", " + clock(time)}</b></div><div><span>Длительность</span><b>${service.duration} минут</b></div><div class="total"><span>Итого</span><b>${money(service.price)}</b></div>`;
  }
  function dates() {
    const start = dayPlus(today(), offset);
    $("#month").textContent = new Date(start + "T12:00:00Z").toLocaleDateString(
      "ru",
      { month: "long", year: "numeric" },
    );
    $("#dates").innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = dayPlus(start, i);
      return `<button class="date ${d === day ? "active" : ""}" data-date="${d}" aria-label="${dateLabel(d)}" aria-pressed="${d === day}"><small>${new Date(d + "T12:00:00Z").toLocaleDateString("ru", { weekday: "short" })}</small><b>${Number(d.slice(-2))}</b></button>`;
    }).join("");
    $("#prev").disabled = offset === 0;
    $("#next").disabled = offset >= 49;
  }
  async function slots() {
    const id = ++request;
    time = null;
    summary();
    $("#booking-error").textContent = "";
    $("#slots").setAttribute("aria-busy", "true");
    $("#slots").textContent = "Ищем свободное время…";
    try {
      const times = await api(
        "/companies/" +
          encodeURIComponent(slug) +
          "/slots?" +
          new URLSearchParams({
            service: service.id,
            staff: master.id,
            date: day,
          }),
      );
      if (id !== request) return;
      $("#slots").innerHTML = times.length
        ? times
            .map(
              (t) =>
                `<button class="slot" data-time="${t}" aria-pressed="false">${clock(t)}</button>`,
            )
            .join("")
        : "Свободного времени нет. Выберите другую дату или специалиста.";
      enter($("#slots"));
    } catch (e) {
      if (id === request) $("#slots").textContent = e.message;
    } finally {
      if (id === request) $("#slots").setAttribute("aria-busy", "false");
    }
  }
  $("#services").onclick = (e) => {
    const el = e.target.closest("[data-service]");
    if (!el || busy) return;
    service = c.services.find((s) => s.id === el.dataset.service);
    select();
    slots();
  };
  $("#masters").onclick = (e) => {
    const el = e.target.closest("[data-staff]");
    if (!el || busy) return;
    master = c.staff.find((m) => m.id === el.dataset.staff);
    select();
    slots();
  };
  $("#dates").onclick = (e) => {
    const el = e.target.closest("[data-date]");
    if (!el || busy) return;
    day = el.dataset.date;
    dates();
    slots();
  };
  $("#prev").onclick = () => {
    offset = Math.max(0, offset - 7);
    dates();
  };
  $("#next").onclick = () => {
    offset = Math.min(49, offset + 7);
    dates();
  };
  $("#slots").onclick = (e) => {
    const el = e.target.closest("[data-time]");
    if (!el || busy) return;
    time = Number(el.dataset.time);
    document.querySelectorAll(".slot").forEach((b) => {
      b.classList.toggle("active", b === el);
      b.setAttribute("aria-pressed", b === el);
    });
    summary();
    $("#booking-error").textContent = "";
  };
  $("#booking-form").onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (time === null) {
      $("#booking-error").textContent = "Выберите свободное время.";
      $("#slots").scrollIntoView({
        block: "center",
        behavior: reduced.matches ? "instant" : "smooth",
      });
      return;
    }
    const f = new FormData(e.target),
      btn = e.target.querySelector("button");
    busy = true;
    btn.disabled = true;
    btn.textContent = "Сохраняем…";
    try {
      const r = await api(
        "/companies/" + encodeURIComponent(slug) + "/bookings",
        {
          method: "POST",
          body: {
            service: service.id,
            staff: master.id,
            date: day,
            time,
            name: f.get("name"),
            phone: f.get("phone"),
          },
        },
      );
      $("#receipt").textContent =
        `${c.name} · ${service.name} · ${master.name}. ${dateLabel(day)}, ${clock(time)}. Номер: ${r.id}.`;
      $("#receipt-note").textContent = c.demo
        ? "Это демозапись. SMS и звонков не будет."
        : "Сохраните номер записи. Для изменений свяжитесь с компанией. SMS-уведомления пока не подключены.";
      $("#confirmation").showModal();
      e.target.reset();
      await slots();
    } catch (error) {
      $("#booking-error").textContent = error.message;
    } finally {
      busy = false;
      btn.disabled = false;
      btn.innerHTML = "Подтвердить запись <span>↗</span>";
    }
  };
  select();
  dates();
  slots();
}
function login() {
  setTitle("Вход");
  $("#app").innerHTML =
    `<section class="auth-page"><a class="back" href="/">← На главную</a><div class="auth-card"><div class="auth-mark">f.</div><div class="eyebrow">РАДЫ ВАС ВИДЕТЬ</div><h1>Ваше дело.<br><em>Ваш аккаунт.</em></h1><p>Войдите, чтобы создать страницу компании,<br>управлять расписанием и видеть свои записи.</p>${session.googleEnabled ? '<a class="button google full" href="/oauth2/authorization/google"><b>G</b> Продолжить с Google ↗</a>' : '<div class="setup-note">Вход через Google пока не подключён владельцем концепта. Кабинет можно посмотреть в деморежиме.</div>'}${new URLSearchParams(location.search).has("error") ? '<p class="error">Вход не завершён. Попробуйте ещё раз.</p>' : ""}<a class="text-link demo-login" href="/demo">Сначала посмотреть демо →</a><p class="fine">Используем только данные профиля для входа.<br>Доступ к почте, контактам и календарю не запрашивается.</p></div></section>`;
}
function companyForm(c = {}) {
  const o = c.opens ?? 600,
    z = c.closes ?? 1080;
  return `<form id="company-form" class="panel form-grid"><h3 class="wide">${c.slug ? "Настройки компании" : "Расскажите о своём деле"}</h3><label>Название<input name="name" value="${esc(c.name)}" required maxlength="100" placeholder="Например, Studio 21"></label><label>Адрес страницы<input name="slug" value="${esc(c.slug)}" ${c.slug ? "readonly" : ""} pattern="[a-z0-9]+(-[a-z0-9]+)*" minlength="3" maxlength="60" required placeholder="studio-21"><small>Латинские буквы, цифры и дефисы</small></label><label>Категория<select name="category">${Object.keys(
    categories,
  )
    .map((k) => `<option ${c.category === k ? "selected" : ""}>${k}</option>`)
    .join(
      "",
    )}</select></label><label>Город<input name="city" value="${esc(c.city)}" required maxlength="80" placeholder="Нарва"></label><label class="wide">Адрес<input name="address" value="${esc(c.address)}" required maxlength="200" placeholder="Улица, дом"></label><label class="wide">Описание<textarea name="description" required maxlength="1000" rows="3" placeholder="Чем вы занимаетесь и что делает вас особенными">${esc(c.description)}</textarea></label><label>Открытие<input name="opens" type="time" step="1800" value="${clock(o)}" required></label><label>Закрытие<input name="closes" type="time" step="1800" value="${clock(z === 1440 ? 1410 : z)}" required></label><fieldset class="wide weekdays"><legend>Рабочие дни · время Эстонии</legend>${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d, i) => `<label><input type="checkbox" name="weekday" value="${i + 1}" ${(c.weekdays || "1,2,3,4,5,6").split(",").includes("" + (i + 1)) ? "checked" : ""}>${d}</label>`).join("")}</fieldset><p class="wide error" id="company-error" role="alert"></p><button class="button wide" type="submit">${c.slug ? "Сохранить настройки" : "Создать компанию"} ↗</button></form>`;
}
function bindCompany(c) {
  $("#company-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target),
      t = (s) => {
        const [h, m] = s.split(":").map(Number);
        return h * 60 + m;
      },
      body = Object.fromEntries(
        ["name", "slug", "category", "city", "description", "address"].map(
          (k) => [k, f.get(k)],
        ),
      );
    body.opens = t(f.get("opens"));
    body.closes = t(f.get("closes"));
    body.weekdays = f.getAll("weekday").join(",");
    if (!body.weekdays) {
      $("#company-error").textContent = "Выберите хотя бы один рабочий день.";
      return;
    }
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const r = await api(c ? "/manage/" + c.slug : "/manage/companies", {
        method: c ? "PUT" : "POST",
        body,
      });
      location.href = "/dashboard?company=" + encodeURIComponent(r.slug);
    } catch (error) {
      $("#company-error").textContent = error.message;
      btn.disabled = false;
    }
  };
}
async function dashboard(demo = false) {
  setTitle(demo ? "Демокабинет" : "Кабинет компании");
  if (!demo && !session.loggedIn) {
    login();
    return;
  }
  let companies = demo
    ? [{ slug: "forma", name: "FORMA Studio" }]
    : await api("/manage/companies");
  let slug = new URLSearchParams(location.search).get("company");
  if (!companies.some((c) => c.slug === slug)) slug = companies[0]?.slug;
  const create = new URLSearchParams(location.search).has("new");
  if (!companies.length || create) {
    $("#app").innerHTML =
      `<section class="section narrow"><div class="eyebrow">НАЧНЁМ С ГЛАВНОГО</div><h1>Дайте своему делу<br><em>новую форму.</em></h1><p class="muted">Создайте страницу, затем добавьте услуги и специалистов.</p>${companyForm()}</section>`;
    bindCompany();
    return;
  }
  const c = await api(
    demo ? "/demo-dashboard" : "/manage/" + encodeURIComponent(slug),
  );
  $("#app").innerHTML =
    `<section class="dashboard-shell"><div class="dashboard-sidebar"><div class="eyebrow">КАБИНЕТ КОМПАНИИ</div><h3>${esc(c.name)}</h3>${!demo ? `<select id="company-picker" aria-label="Выбрать компанию">${companies.map((x) => `<option value="${esc(x.slug)}" ${x.slug === slug ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : ""}<div class="dashboard-tabs"><button class="tab active" data-tab="bookings">▦ Записи</button><button class="tab" data-tab="services">◇ Услуги</button><button class="tab" data-tab="staff">◉ Команда</button><button class="tab" data-tab="settings">⚙ Настройки</button></div><a class="text-link" href="/studio/${esc(c.slug)}">Страница компании ↗</a>${!demo ? '<a class="text-link" href="/dashboard?new=1">+ Ещё компания</a>' : ""}</div><div class="dashboard-content">${demo ? '<div class="demo-alert">Демокабинет · только вымышленные данные · изменения отключены <a href="/dashboard">Создать свой →</a></div>' : ""}<div class="dashboard-heading"><div><div class="eyebrow">ВСЁ ПОД КОНТРОЛЕМ</div><h2 id="dash-title">Хороший день<br>начинается с <em>порядка.</em></h2></div><button class="button outline small" id="copy-link">Скопировать ссылку ↗</button></div><div id="dashboard-view"></div></div></section>`;
  if (!demo)
    $("#company-picker").onchange = (e) =>
      (location.href =
        "/dashboard?company=" + encodeURIComponent(e.target.value));
  $("#copy-link").onclick = async () => {
    const url = location.origin + "/studio/" + c.slug;
    try {
      await navigator.clipboard.writeText(url);
      notice("Ссылка скопирована");
    } catch {
      notice(url);
    }
  };
  function view(tab) {
    document
      .querySelectorAll(".tab")
      .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    const target = $("#dashboard-view");
    if (tab === "bookings") {
      const confirmed = c.bookings.filter((b) => b.status === "confirmed"),
        upcoming = confirmed.filter((b) => String(b.booking_date) >= today());
      target.innerHTML = `<div class="stats"><div><span>Предстоящие записи</span><b>${upcoming.length}</b></div><div><span>Услуги</span><b>${c.services.length}</b></div><div><span>Сумма предстоящих записей</span><b>${money(upcoming.reduce((s, b) => s + b.price, 0))}</b></div></div><div class="panel"><div class="panel-heading"><h3>Расписание</h3><label><span class="sr-only">Фильтр по дате</span><input type="date" id="booking-filter"></label></div><div id="appointments"></div></div>`;
      function appointments() {
        const date = $("#booking-filter").value,
          rows = c.bookings.filter(
            (b) => !date || String(b.booking_date) === date,
          );
        $("#appointments").innerHTML = rows.length
          ? `<div class="table-scroll"><table><thead><tr><th>Когда</th><th>Клиент</th><th>Услуга</th><th>Стоимость</th><th>Статус</th><th></th></tr></thead><tbody>${rows.map((b) => `<tr><td><b>${clock(b.start_minute)}</b><small>${dateLabel(String(b.booking_date))}</small></td><td>${esc(b.customer_name)}<small>${esc(b.phone)}</small></td><td>${esc(b.service_name)}<small>${esc(b.staff_name)}</small></td><td>${money(b.price)}</td><td><span class="status ${b.status === "cancelled" ? "cancelled" : ""}">${b.status === "confirmed" ? "Подтверждена" : "Отменена"}</span></td><td>${!demo && b.status === "confirmed" ? `<button class="text-button" data-cancel="${esc(b.id)}">Отменить</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
          : '<div class="empty">Записей пока нет.<br><small>Поделитесь страницей компании с клиентами.</small></div>';
      }
      appointments();
      $("#booking-filter").onchange = appointments;
      $("#appointments").onclick = async (e) => {
        const btn = e.target.closest("[data-cancel]");
        if (!btn || demo) return;
        btn.disabled = true;
        try {
          await api(`/manage/${c.slug}/bookings/${btn.dataset.cancel}/cancel`, {
            method: "POST",
            body: {},
          });
          c.bookings.find((b) => b.id === btn.dataset.cancel).status =
            "cancelled";
          view("bookings");
          notice("Запись отменена. Время снова доступно.");
        } catch (error) {
          notice(error.message);
          btn.disabled = false;
        }
      };
    } else if (tab === "services" || tab === "staff") {
      const isService = tab === "services",
        items = c[tab];
      target.innerHTML = `<div class="panel"><h3>${isService ? "Ваши услуги" : "Ваша команда"}</h3><div class="manage-list">${items.length ? items.map((item) => `<div><span class="avatar">${esc(item.name[0])}</span><div><b>${esc(item.name)}</b><small>${isService ? `${item.duration} мин · ${money(item.price)}` : esc(item.role)}</small></div>${!demo ? `<button class="text-button" data-archive="${esc(item.id)}">Убрать</button>` : ""}</div>`).join("") : '<p class="muted">Добавьте первую запись.</p>'}</div></div>${!demo ? `<form id="add-item" class="panel form-grid"><h3 class="wide">${isService ? "Добавить услугу" : "Добавить специалиста"}</h3><label class="wide">${isService ? "Название" : "Имя"}<input name="name" required maxlength="${isService ? 100 : 80}"></label>${isService ? '<label class="wide">Описание<input name="description" maxlength="300"></label><label>Длительность, мин<input name="duration" type="number" value="60" min="30" max="240" step="30" required></label><label>Цена, €<input name="price" type="number" value="30" min="0" max="100000" step="0.01" required></label>' : '<label class="wide">Специализация<input name="role" required maxlength="80" placeholder="Например, стилист"></label>'}<p id="item-error" class="error wide" role="alert"></p><button class="button wide">Добавить ↗</button></form>` : ""}`;
      if (!demo) {
        $("#add-item").onsubmit = async (e) => {
          e.preventDefault();
          const f = new FormData(e.target),
            body = { name: f.get("name") };
          if (isService) {
            body.description = f.get("description");
            body.duration = Number(f.get("duration"));
            body.price = Math.round(Number(f.get("price")) * 100);
          } else body.role = f.get("role");
          const btn = e.target.querySelector("button");
          btn.disabled = true;
          try {
            const r = await api(`/manage/${c.slug}/${tab}`, {
              method: "POST",
              body,
            });
            items.push({ id: r.id, ...body });
            view(tab);
            notice("Добавлено");
          } catch (error) {
            $("#item-error").textContent = error.message;
            btn.disabled = false;
          }
        };
        target.onclick = async (e) => {
          const btn = e.target.closest("[data-archive]");
          if (!btn) return;
          btn.disabled = true;
          try {
            await api(`/manage/${c.slug}/${tab}/${btn.dataset.archive}`, {
              method: "DELETE",
            });
            c[tab] = c[tab].filter((x) => x.id !== btn.dataset.archive);
            view(tab);
            notice("Убрано из доступных для записи. История сохранена.");
          } catch (error) {
            notice(error.message);
            btn.disabled = false;
          }
        };
      }
    } else {
      target.innerHTML = demo
        ? '<div class="panel"><h3>Часы работы</h3><p>Ежедневно, 10:00–18:00 · время Эстонии</p><p class="muted">В своём кабинете можно менять название, адрес, описание и часы работы компании.</p><a class="button" href="/dashboard">Создать свою компанию ↗</a></div>'
        : companyForm(c);
      if (!demo) bindCompany(c);
    }
    enter(target);
  }
  $(".dashboard-tabs").onclick = (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    $("#dashboard-view").onclick = null;
    view(btn.dataset.tab);
  };
  view("bookings");
}
async function myBookings() {
  if (!session.loggedIn) {
    login();
    return;
  }
  setTitle("Мои записи");
  const rows = await api("/my-bookings");
  $("#app").innerHTML =
    `<section class="section"><div class="eyebrow">ВАШ АККАУНТ</div><h1>Ближайшие <em>планы.</em></h1><div class="personal-grid">${rows.length ? rows.map((b) => `<article class="panel"><span class="status ${b.status === "cancelled" ? "cancelled" : ""}">${b.status === "confirmed" ? "Подтверждена" : "Отменена"}</span><h3>${esc(b.company_name)}</h3><p>${esc(b.service_name)} · ${esc(b.staff_name)}</p><h2>${dateLabel(String(b.booking_date))}, ${clock(b.start_minute)}</h2><p>${money(b.price)}</p><a class="text-link" href="/studio/${esc(b.slug)}">Страница компании ↗</a></article>`).join("") : '<div class="empty">У вас пока нет записей.<br><a class="text-link" href="/#catalog">Найти услугу →</a></div>'}</div></section>`;
}
function privacy() {
  setTitle("О концепте и данных");
  $("#app").innerHTML =
    `<section class="section narrow prose"><div class="eyebrow">ПРОЗРАЧНО И ПРОСТО</div><h1>О концепте<br>и <em>ваших данных.</em></h1><h3>Это портфолио-проект</h3><p>FORMA показывает, как небольшая компания может принимать онлайн-записи без собственного сайта. Компании с отметкой «Демо» вымышлены. В них нельзя получить реальную услугу. Для проверки используйте вымышленные имя и телефон.</p><h3>Что сохраняется</h3><p>При записи сохраняются имя, телефон, компания, выбранная услуга, специалист, дата и время. Владелец соответствующей компании видит эти данные в своём кабинете. Публичный каталог не показывает сведения клиентов.</p><h3>Вход через Google</h3><p>Для входа используется идентификатор Google; имя профиля отображается в интерфейсе. Мы не запрашиваем доступ к письмам, контактам или календарю. Сеансовая cookie нужна для входа и защиты форм. Выход завершает текущую сессию.</p><h3>Хранение и удаление</h3><p>В этой версии нет автоматического удаления данных и самостоятельного удаления аккаунта. До приёма настоящих клиентских данных владелец размещения должен указать свои контакты, срок хранения и порядок удаления. Концепт пока не предназначен для записи реальных клиентов.</p><a class="button" href="/">Вернуться на главную ↗</a></section>`;
}
async function start() {
  const path = location.pathname;
  const ready = api("/session").then((s) => (session = s));
  // The home page and privacy text need no session, so they render without waiting for it.
  if (path === "/" || path === "/privacy") {
    path === "/" ? home().catch(fail) : privacy();
    // Without a session the header simply keeps its «Войти» button.
    await ready.then(account, () => {});
    return;
  }
  await ready;
  account();
  if (path.startsWith("/studio/"))
    await studio(decodeURIComponent(path.split("/")[2]));
  else if (path === "/demo") await dashboard(true);
  else if (path === "/dashboard") await dashboard();
  else if (path === "/login")
    session.loggedIn ? location.replace("/dashboard") : login();
  else if (path === "/my-bookings") await myBookings();
  else await home();
}
function account() {
  if (session.loggedIn) {
    $("#account").outerHTML =
      `<div class="account-menu"><a href="/my-bookings">Мои записи</a><a class="button small outline" href="/dashboard">Кабинет ↗</a><button class="text-button" id="logout">Выйти</button></div>`;
    $("#logout").onclick = async () => {
      await api("/logout", { method: "POST" });
      location.href = "/";
    };
  }
}
function fail(error) {
  $("#app").innerHTML =
    `<section class="section"><h1>Небольшая <em>пауза.</em></h1><p class="error">${esc(error.message)}</p><a class="button" href="/">На главную ↗</a></section>`;
}
$("#close-dialog").onclick = () => $("#confirmation").close();
start().catch(fail);
