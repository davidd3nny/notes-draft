/*
  Notes — концепт одностраничного сайта. Поведение страницы.

  Откуда что берётся:
    window.DATA    — data.json: меню, цены, часы, тексты на трёх языках
    window.PHOTOS  — photos.js: фотографии (вшиты в страницу)
    window.Core    — shared/core.js: язык, время в Баку, цены

  Главная мысль: страница читается как партитура одного дня.
  «Ноты дня» — пять служб на пяти линиях стана, коралловая черта — текущее время.
  Меню разбито на части дня, как музыкальное произведение на части: у каждой своя темповая пометка.
*/
(function () {
  "use strict";

  var D = window.DATA, PH = window.PHOTOS || {}, C = window.Core, U = D.ui, t = C.t;
  var SVGNS = "http://www.w3.org/2000/svg";

  /* ---------- 1. Тексты на трёх языках ----------
     Каждый узел помнит, откуда берёт свой текст. При смене языка все узлы обновляются на месте,
     поэтому раскрытые списки и место прокрутки не сбрасываются.
     Узлы с пометкой live вдобавок обновляются по часам (статус «открыто», «сейчас подаём»). */
  var binds = [], lives = [];

  function bind(node, val, opt) {
    opt = opt || {};
    var b = { n: node, f: typeof val === "function" ? val : function () { return t(val); }, a: opt.attr, h: opt.hide };
    (opt.live ? lives : binds).push(b);
    put(b);
    return node;
  }
  function put(b) {
    var s = b.f();
    if (b.a) b.n.setAttribute(b.a, s);
    else if (b.n.textContent !== s) b.n.textContent = s;
    if (b.h) b.n.hidden = !s;
  }
  function refresh(liveOnly) {
    if (!liveOnly) binds.forEach(put);
    lives.forEach(put);
  }

  /* E("p", "класс", текст) — создать элемент; текст может быть {az, ru, en}, строкой или функцией */
  function E(tag, cls, val, opt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (val != null) bind(n, val, opt);
    return n;
  }
  function add(parent) {
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
    return parent;
  }
  function $(id) { return document.getElementById(id); }
  /* Невидимый разделитель для экранного диктора: «Завтраки, сейчас, до 13:00», а не «Завтракисейчас» */
  function sep(text) { var n = E("span", "vh"); n.textContent = text; return n; }

  /* Рисунок из art/defs.svg: логотип, линейные рисунки, значок-нота */
  function art(id, viewBox, cls) {
    var s = document.createElementNS(SVGNS, "svg");
    s.setAttribute("viewBox", viewBox);
    s.setAttribute("class", cls);
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    var u = document.createElementNS(SVGNS, "use");
    u.setAttribute("href", "#" + id);
    s.appendChild(u);
    return s;
  }
  /* Нота у фирменных блюд и напитков. Для экранного диктора рядом скрытое слово «фирменное» */
  function sigMark() {
    var w = E("span", "sig-w");
    bind(w, U.sig, { attr: "title" });
    return add(w, art("sig", "0 0 12 20", "sig"), E("span", "vh", U.sig));
  }
  /* Фотография с подписью (подпись необязательна) */
  function photo(key, caption, cls) {
    var p = PH[key];
    if (!p) return null;
    var f = E("figure", "ph" + (cls ? " " + cls : ""));
    var img = document.createElement("img");
    img.src = p.src;
    img.width = p.w;
    img.height = p.h;
    img.alt = "";
    img.decoding = "async";
    f.appendChild(img);
    if (caption) f.appendChild(E("figcaption", null, caption));
    return f;
  }
  function list(items, render, cls) {
    var ul = E("ul", cls || "items");
    items.forEach(function (it) { ul.appendChild(render(it)); });
    return ul;
  }
  /* «12 позиций», «1 item» */
  function count(n) {
    return n + " " + C.plural(n, t(U.countForms).split("|"));
  }

  /* ---------- 2. Время: что открыто прямо сейчас ---------- */
  var NOW = C.now();
  var SVC = {};
  D.services.forEach(function (s) { SVC[s.id] = s; });

  function weekend(n) { return n.dow === 0 || n.dow === 6; }
  function endMin(s) { var m = C.toMin(s); return m === 0 ? 1440 : m; }     /* «00:00» в конце дня = 24:00 */
  function venueHours(n) { return weekend(n) ? D.hours.weekend : D.hours.weekday; }
  function svcHours(svc, n) { return weekend(n) ? svc.weekend : svc.weekday; }
  function svcState(svc, n) {
    var h = svcHours(svc, n), a = C.toMin(h[0]), b = endMin(h[1]);
    if (n.min >= a && n.min < b) return "on";
    return n.min < a ? "later" : "past";
  }
  function statusText() {
    var st = C.status(venueHours(NOW), NOW);
    if (!st.open) return C.fill(t(U.closedOpens), { t: st.opens });
    if (st.minutesLeft <= 60) return C.fill(t(U.closingSoon), { n: st.minutesLeft });
    return C.fill(t(U.openUntil), { t: st.until });
  }

  /* ---------- 3. Ноты дня ---------- */
  var AX0 = 10 * 60, AX1 = 24 * 60;          /* стан от 10:00 до 24:00 */
  var PLAY = [];
  function pct(min) { return (min - AX0) / (AX1 - AX0) * 100; }

  function voiceState(svc) {
    var st = svcState(svc, NOW), h = svcHours(svc, NOW);
    if (st === "on") return C.fill(t(U.svcNow), { b: h[1] });
    if (st === "later") return C.fill(t(U.svcLater), { a: h[0], b: h[1] });
    return t(U.svcDone);
  }
  function playingText() {
    if (!PLAY.length) return C.fill(t(U.quiet), { t: C.status(venueHours(NOW), NOW).opens || D.hours.weekday.open });
    var names = PLAY.map(function (s) { return t(s.name).toLocaleLowerCase(C.lang); });
    var last = names.pop();
    var listTxt = names.length ? names.join(", ") + " " + t(U.and) + " " + last : last;
    return C.fill(t(names.length ? U.nowPlaying : U.nowPlaying1), { list: listTxt }) + ".";
  }

  function buildScore() {
    var axis = $("axis");
    for (var h = 10; h <= 24; h += 2) {
      var s = document.createElement("span");
      s.textContent = String(h);
      s.style.left = pct(h * 60) + "%";
      if ((h - 10) % 4) s.className = "minor";          /* на телефоне видны только 10, 14, 18, 22 */
      axis.appendChild(s);
    }
    var voices = $("voices");
    D.services.forEach(function (svc) {
      var b = E("button", "voice");
      b.type = "button";
      var lab = add(E("span", "v-lab"),
        E("span", "v-name", svc.name),
        sep(", "),
        E("span", "v-state", function () { return voiceState(svc); }, { live: true }));
      var bar = add(E("span", "v-bar"), E("i", "head"));
      add(b, lab, add(E("span", "v-track"), bar));
      b.addEventListener("click", function () { go(svc.to); });
      svc._btn = b;
      svc._bar = bar;
      voices.appendChild(b);
    });
    bind($("playing"), playingText, { live: true });
  }
  function paintScore() {
    PLAY = [];
    D.services.forEach(function (svc) {
      var h = svcHours(svc, NOW), a = C.toMin(h[0]), b = endMin(h[1]);
      svc._bar.style.left = pct(a) + "%";
      svc._bar.style.width = (pct(b) - pct(a)) + "%";
      var st = svcState(svc, NOW);
      svc._btn.className = "voice " + st;
      if (st === "on") PLAY.push(svc);
    });
    var inside = NOW.min >= AX0 && NOW.min < AX1, at = (NOW.min - AX0) / (AX1 - AX0);
    $("playhead").hidden = !inside;
    /* у краёв стана ярлык времени прижимается внутрь, чтобы не вылезать за экран */
    $("playhead").className = "playhead" + (at > 0.88 ? " at-end" : at < 0.08 ? " at-start" : "");
    $("score").style.setProperty("--now", ((NOW.min - AX0) / (AX1 - AX0)).toFixed(4));
    $("playhead-t").textContent = C.hhmm(NOW.min);
  }

  /* Плавно доехать до раздела и передать ему фокус (для клавиатуры и диктора) */
  function go(id) {
    var target = $(id);
    if (!target) return;
    target.scrollIntoView({ behavior: C.reducedMotion ? "auto" : "smooth", block: "start" });
    var h = target.querySelector("h2, h3");
    if (h) {
      if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
      try { h.focus({ preventScroll: true }); } catch (e) { /* старые браузеры */ }
    }
  }

  /* ---------- 4. Оглавление меню ---------- */
  function partNum(p) {
    var n = E("span", p.num ? "num" : "num num-note");
    if (p.num) n.textContent = p.num;
    else n.appendChild(art("sig", "0 0 12 20", "sig"));
    return n;
  }
  function buildIndex() {
    var ol = $("index");
    D.parts.forEach(function (p) {
      var a = E("a", "ix");
      a.href = "#" + p.id;
      add(a, partNum(p), sep(". "), E("span", "ix-name", p.name), sep(": "), E("span", "ix-lead", p.lead));
      ol.appendChild(add(document.createElement("li"), a));
    });
  }

  /* ---------- 5. Части меню ---------- */
  var timed = [];          /* разделы, которые подают не весь день */

  function partHead(p, box) {
    var mark = add(E("p", "mv-mark"), partNum(p));
    var tempo = E("span", "mv-tempo");
    tempo.textContent = p.tempo;
    tempo.lang = "it";
    add(mark, tempo, E("span", "mv-gloss", p.gloss));
    var h = E("h2", "mv-name", p.name);
    h.id = p.id + "-t";
    h.tabIndex = -1;
    box.appendChild(add(E("div", "mv-title"), mark, h, E("p", "mv-lead", p.lead)));
    return box;
  }
  function shell(p, extra) {
    var mv = E("section", "mv" + (extra ? " " + extra : ""));
    mv.id = p.id;
    mv.setAttribute("aria-labelledby", p.id + "-t");
    var grid = E("div", "wrap mv-grid");
    var aside = partHead(p, E("div", "mv-aside"));
    var body = E("div", "mv-body");
    add(mv, add(grid, aside, body));
    return { mv: mv, aside: aside, body: body };
  }

  /* «Пиде / баранина / моцарелла» → название «Пиде» и состав «баранина, моцарелла» */
  function split(s) {
    var a = String(s).split(/\s+\/\s+/);
    return { head: a[0], tail: a.slice(1).join(", ") };
  }
  function whenText(svc) {
    var wd = svc.weekday, we = svc.weekend, txt;
    if (wd[0] === we[0] && wd[1] === we[1]) txt = C.fill(t(U.whenDaily), { a: wd[0], b: wd[1] });
    else if (wd[1] === we[1]) txt = C.fill(t(U.whenUntil), { b: wd[1] });
    else txt = C.fill(t(U.whenWeek), { a: wd[0], b: wd[1], c: we[0], d: we[1] });
    var st = svcState(svc, NOW), h = svcHours(svc, NOW);
    var state = st === "on" ? t(U.stNow) : st === "later" ? C.fill(t(U.stLater), { t: h[0] }) : t(U.stDone);
    return txt + ". " + state + ".";
  }

  function dish(it) {
    var li = E("li", "it" + (it.variants ? " has-var" : ""));
    var n = add(E("p", "it-n"), E("span", "nm", function () { return split(t(it.name)).head; }));
    if (it.note) add(n, E("span", it.note.en.length > 16 ? "wt wt-b" : "wt", it.note));
    if (it.sig) add(n, sigMark());
    add(li, n, E("p", "it-d", function () { return it.desc ? t(it.desc) : split(t(it.name)).tail; }, { hide: true }));
    if (it.variants) {
      li.appendChild(list(it.variants, function (v) {
        return add(document.createElement("li"),
          E("span", "var-n", function () { return t(v.name) + (v.note ? ", " + t(v.note) : ""); }),
          E("span", "var-p", function () { return C.price(v.price); }));
      }, "var"));
    } else {
      li.appendChild(E("p", "it-p", function () { return C.price(it.price); }));
    }
    return li;
  }

  function kitchenSection(s) {
    var sec = E("section", "sec" + (s.boxed ? " boxed" : "") + (s.compact ? " compact" : ""));
    sec.id = s.id;
    sec.setAttribute("aria-labelledby", s.id + "-h");
    var h3 = E("h3", null, s.name);
    h3.id = s.id + "-h";
    var head = add(E("div", "sec-h"), h3, s.note ? E("span", "sec-note", s.note) : null);
    head.appendChild(E("span", "stave"));
    sec.appendChild(head);
    var svc = s.service ? SVC[s.service] : null;
    if (svc) {
      sec._svc = svc;
      timed.push(sec);
      if (svc.to === s.id) sec.appendChild(E("p", "sec-when", function () { return whenText(svc); }, { live: true }));
    }
    sec.appendChild(list(s.items, dish));
    if (s.photo) sec.appendChild(photo(s.photo, s.photoAlt));
    return sec;
  }

  function kitchenPart(p) {
    var x = shell(p, "kitchen");
    if (p.photo) x.aside.appendChild(photo(p.photo, p.photoAlt, "ph-main"));
    D.kitchen.forEach(function (s) { if (s.part === p.id) x.body.appendChild(kitchenSection(s)); });
    return x.mv;
  }

  /* Десерты: витрина кондитерской. Цен на десерты в их меню нет, поэтому здесь фото и приглашение */
  function dolcePart(p) {
    var x = shell(p, "mv-dolce");
    x.aside.querySelector(".mv-title").appendChild(E("p", "dolce-text", U.pastryLead));
    add(x.body, add(E("div", "collage"),
      photo("vitrine", null, "ph-tall"),
      photo("piano", null),
      photo("peach", null)));
    return x.mv;
  }

  /* ---------- 6. Бар ---------- */
  function geo(org) {
    return org.split(", ").map(function (x) { return D.geo[x] ? t(D.geo[x]) : x; }).join(", ");
  }
  function drink(it) {
    var li = E("li", "it");
    var n = add(E("p", "it-n"), E("span", "nm", it.name));
    if (it.sig) add(n, sigMark());
    add(li, n);
    if (it.desc) li.appendChild(E("p", "it-d", it.desc));
    li.appendChild(E("p", "it-p", function () { return C.price(it.price); }));
    return li;
  }
  function mini(it) {
    return add(E("li", "mi"), E("span", "mi-n", it.name), E("span", "mi-p", function () { return C.price(it.price); }));
  }
  /* Список напитков: с составом — подробно, без состава — в две колонки. «Sirab» с двумя объёмами — две строки */
  function drinks(items) {
    var rich = items.some(function (i) { return i.desc; });
    var flat = [];
    items.forEach(function (it) {
      if (it.prices) Object.keys(it.prices).forEach(function (k) { flat.push({ name: it.name + ", " + k, price: it.prices[k] }); });
      else flat.push(it);
    });
    return list(flat, rich ? drink : mini, rich ? "items" : "minis");
  }
  function block(id, title) {
    var b = E("section", "blk blk-" + id);
    b.id = id;
    b.setAttribute("aria-labelledby", id + "-h");
    var h = E("h3", "blk-h", title);
    h.id = id + "-h";
    b.appendChild(h);
    return b;
  }
  /* Длинные списки (все вина, крепкие) свёрнуты, чтобы страница не превращалась в бесконечную ленту.
     Открываются на месте одним нажатием. Чтобы показывать их раскрытыми сразу: в data.json "openLists": true */
  function more(title, n) {
    var d = E("details", "more");
    if (D.openLists) d.open = true;
    var s = add(document.createElement("summary"), E("span", "more-t", title), E("span", "cnt", function () { return count(n); }));
    d.appendChild(s);
    return d;
  }
  function wineRow(w) {
    var li = E("li", "wn");
    var tt = add(E("div", "wn-t"), E("p", "wn-n", w.name));
    if (w.org) tt.appendChild(E("p", "wn-o", function () { return geo(w.org); }));
    var g = E("span", "wn-g"), b = E("span", "wn-b");
    if (w.glass != null) add(g, E("span", "vh", function () { return t(U.glassLabel) + " "; }), E("span", null, function () { return C.price(w.glass); }));
    if (w.bottle != null) add(b, E("span", "vh", function () { return t(U.bottleLabel) + " "; }), E("span", null, function () { return C.price(w.bottle); }));
    return add(li, tt, g, b);
  }
  function wineHead() {
    var h = add(E("div", "wn wn-head"), E("span", "wn-t"), E("span", "wn-g", U.glassLabel), E("span", "wn-b", U.bottleLabel));
    h.setAttribute("aria-hidden", "true");
    return h;
  }

  function barPart(p) {
    var x = shell(p, "night");
    var title = x.aside.querySelector(".mv-title");
    title.insertBefore(art("i-glass", "0 0 593 393.2", "draw draw-glass"), title.firstChild);
    add(x.aside, add(E("div", "ph-pair"),
      photo("bar", p.photoAlt, "ph-barroom"),
      photo("miso", null, "ph-miso")));

    var B = D.bar, body = x.body;
    body.appendChild(E("p", "bar-lead", U.barLead));

    /* Коктейли */
    var ck = block("cocktails", U.cocktails);
    var grid = E("div", "ck-grid");
    B.cocktails.forEach(function (g) {
      var h4 = E("h4", null, g.name);
      h4.lang = "en";
      grid.appendChild(add(E("div", "grp" + (g.boxed ? " framed" : "")), h4, drinks(g.items)));
    });
    body.appendChild(add(ck, grid));

    /* Вино: бокалом — всегда на виду, полная карта — по нажатию */
    var wn = block("wine", U.wine);
    var byGlass = [], total = 0;
    B.wine.forEach(function (g) {
      total += g.items.length;
      g.items.forEach(function (w) { if (w.glass != null) byGlass.push(w); });
    });
    add(wn, add(E("div", "wine-glass"), E("h4", null, U.byGlass), wineHead(), list(byGlass, wineRow, "wn-list")));
    var all = more(U.wineAll, total);
    var allIn = E("div", "more-in wine-all");
    B.wine.forEach(function (g) {
      allIn.appendChild(add(E("div", "wg"), E("h4", null, g.name), wineHead(), list(g.items, wineRow, "wn-list")));
    });
    body.appendChild(add(wn, add(all, allIn)));

    /* Крепкие */
    var n = 0;
    B.spirits.forEach(function (g) { n += g.items.length; });
    var sp = more(U.spirits, n);
    sp.classList.add("more-spirits");
    sp.id = "spirits";
    var spIn = E("div", "more-in sp-grid");
    B.spirits.forEach(function (g) {
      var h4 = add(E("h4"), E("span", null, g.name), E("span", "vol", g.vol));
      spIn.appendChild(add(E("div", "sp"), h4, drinks(g.items)));
    });
    body.appendChild(add(sp, spIn));

    /* Кофе, чай, лимонады, соки, вода, пиво */
    var dr = block("drinks", U.drinksTitle);
    var dg = E("div", "dr-grid");
    B.drinks.forEach(function (d) {
      var h4 = add(E("h4"), E("span", null, d.name), d.note ? E("span", "vol", d.note) : null);
      var box = add(E("div", "dr dr-" + d.id), h4);
      if (d.items) box.appendChild(drinks(d.items));
      if (d.groups) d.groups.forEach(function (sg) { add(box, E("h5", null, sg.name), drinks(sg.items)); });
      dg.appendChild(box);
    });
    body.appendChild(add(dr, dg));
    body.appendChild(E("p", "fee fee-bar", U.fee));
    return x.mv;
  }

  /* ---------- 7. Сборка страницы ---------- */
  function buildParts() {
    var root = $("movements");
    D.parts.forEach(function (p) {
      if (p.id === "dolce") root.appendChild(dolcePart(p));
      else if (p.id === "bar") root.appendChild(barPart(p));
      else root.appendChild(kitchenPart(p));
    });
  }
  function buildCover() {
    var a = $("cover-a"), b = $("cover-b");
    if (PH.lamp) { a.src = PH.lamp.src; a.width = PH.lamp.w; a.height = PH.lamp.h; }
    if (PH.bar) { b.src = PH.bar.src; b.width = PH.bar.w; b.height = PH.bar.h; }
    $("draft").hidden = !D.draft;
    bind($("status-t"), statusText, { live: true });
  }
  function buildAbout() {
    add($("about-ph"),
      photo("terrace2", U.terrace, "ph-wide"),
      photo("terrace", null, "ph-sq"),
      photo("emboss", null, "ph-sq"));
    var crew = $("crew");
    D.team.forEach(function (m) {
      crew.appendChild(add(E("li", "mate"),
        E("p", "mate-role", m.role),
        E("p", "mate-name", m.name),
        m.note ? E("p", "mate-note", m.note) : null));
    });
  }
  function buildContacts() {
    function waHref() { return C.wa(D.phone, t(U.waText)); }
    ["book", "ct-wa", "pill-book"].forEach(function (id) { bind($(id), waHref, { attr: "href" }); });
    bind($("ct-addr"), D.address);
    $("ct-map").href = D.mapUrl;
    $("h-wd").textContent = D.hours.weekday.open + "–" + D.hours.weekday.close;
    $("h-we").textContent = D.hours.weekend.open + "–" + D.hours.weekend.close;
    bind($("ct-status"), statusText, { live: true });
    var tel = $("ct-tel");
    tel.href = C.tel(D.phone);
    tel.textContent = D.phoneDisplay;
    $("ct-call").href = C.tel(D.phone);
    var mail = $("ct-mail");
    mail.href = "mailto:" + D.email;
    mail.textContent = D.email;
    $("ct-ig").href = D.instagram.url;
    $("ct-fb").href = D.facebook;
    $("ct-yt").href = D.youtube;
    $("ct-dl").href = D.delivery;
    bind($("credit"), function () { return C.fill(t(U.credit), { who: D.credit }); });
  }

  /* Плавающие кнопки «Оглавление» и «Стол»: видны, когда обложка ушла вверх, и прячутся у контактов */
  function watchPill() {
    var pill = $("pill");
    if (!("IntersectionObserver" in window)) { pill.classList.add("show"); return; }
    var seen = { top: true, contacts: false }, up = true, lastY = window.pageYOffset;
    function update() { pill.classList.toggle("show", !seen.top && !seen.contacts && up); }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { seen[e.target.id] = e.isIntersecting; });
      update();
    });
    io.observe($("top"));
    io.observe($("contacts"));
    window.addEventListener("scroll", function () {
      var y = window.pageYOffset;
      if (Math.abs(y - lastY) < 24) return;
      up = y < lastY;
      lastY = y;
      update();
    }, { passive: true });
  }

  function setPressed() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-lang]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === C.lang));
    });
  }

  function tick() {
    NOW = C.now();
    paintScore();
    timed.forEach(function (sec) { sec.classList.toggle("off", svcState(sec._svc, NOW) !== "on"); });
    $("status").classList.toggle("closed", !C.status(venueHours(NOW), NOW).open);
    refresh(true);
  }

  /* Тексты, записанные прямо в index.html через data-t="ключ" */
  Array.prototype.forEach.call(document.querySelectorAll("[data-t]"), function (n) {
    var k = n.getAttribute("data-t");
    if (U[k]) bind(n, U[k]);
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-t-aria]"), function (n) {
    var k = n.getAttribute("data-t-aria");
    if (U[k]) bind(n, U[k], { attr: "aria-label" });
  });

  buildCover();
  buildScore();
  buildIndex();
  buildParts();
  buildAbout();
  buildContacts();
  tick();
  setPressed();
  document.title = t(D.docTitle);

  Array.prototype.forEach.call(document.querySelectorAll("[data-lang]"), function (b) {
    b.addEventListener("click", function () { C.setLang(b.getAttribute("data-lang")); });
  });
  C.onLang(function () {
    refresh();
    setPressed();
    document.title = t(D.docTitle);
  });

  watchPill();
  setInterval(tick, 30000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); });

  /* Адрес с якорем (…#menu из QR-кода, …#bar, …#contacts): разделы созданы скриптом, поэтому доезжаем сами */
  if (location.hash.length > 1) {
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView();
  }
})();
