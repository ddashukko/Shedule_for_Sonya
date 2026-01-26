document.addEventListener("DOMContentLoaded", function () {
  // --- НАЛАШТУВАННЯ ---
  // Дата початку семестру (для визначення Верхнього/Нижнього тижня)
  const startDate = new Date(2026, 0, 26);

  const themeCheckbox = document.getElementById("checkbox");
  const findMeBtn = document.getElementById("findMeBtn");

  // --- 1. ЛОГІКА ТЕМИ (DARK MODE) ---
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    themeCheckbox.checked = true;
  }

  themeCheckbox.addEventListener("change", function () {
    if (this.checked) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "light");
    }
  });

  // --- 2. ЗАПУСК ДОДАТКУ ---
  if (window.scheduleData) {
    renderSchedule(window.scheduleData);
    initTabs();

    // Запускаємо логіку відразу при завантаженні
    updateSchedule(true);
    updateTimeTracker();

    // Оновлюємо таймер щосекунди (для плавної смужки)
    setInterval(updateTimeTracker, 1000);

    // Оновлюємо таблицю (підсвітку рядків) раз на хвилину
    setInterval(() => updateSchedule(false), 60000);
  } else {
    console.error(
      "Помилка: window.scheduleData не знайдено. Перевірте файл data.js",
    );
    const status = document.getElementById("weekStatus");
    if (status) status.innerText = "Помилка даних";
  }

  // --- 3. ЛОГІКА ТАЙМЕРА І ПРОГРЕС-БАРУ (ГОЛОВНА ФІЧА) ---
  function updateTimeTracker() {
    const trackerContainer = document.getElementById("timeTracker");
    const trackerText = document.getElementById("tracker-text");
    const progressWrapper = document.getElementById("progress-wrapper");
    const progressFill = document.getElementById("progress-fill");

    const now = new Date();
    // Переводимо поточний час у хвилини від початку доби (0..1439)
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const weekType = getCurrentWeekType();
    const dayName = getDayName(now.getDay());

    // Якщо вихідний або даних немає - ховаємо блок
    if (
      !window.scheduleData[weekType] ||
      !window.scheduleData[weekType][dayName]
    ) {
      trackerContainer.style.display = "none";
      return;
    }
    trackerContainer.style.display = "block";

    const todaysLessons = window.scheduleData[weekType][dayName];

    let activeLesson = null;
    let nextLesson = null;

    // Змінна, щоб знати, коли закінчилась ПОПЕРЕДНЯ пара.
    // Якщо пар ще не було, це початок доби (0 хвилин).
    let prevLessonEnd = 0;

    for (let i = 0; i < todaysLessons.length; i++) {
      const lesson = todaysLessons[i];
      const { start, end, startStr } = parseTimeRange(lesson.time);

      // Чи ми зараз всередині цієї пари?
      if (currentMinutes >= start && currentMinutes < end) {
        activeLesson = { ...lesson, start, end };
        break;
      }

      // Чи ця пара ще попереду?
      if (currentMinutes < start) {
        nextLesson = { ...lesson, start, end, startStr };
        break; // Знайшли найближчу наступну, виходимо
      }

      // Якщо ми тут, значить ця пара вже минула. Запам'ятовуємо її кінець.
      prevLessonEnd = end;
    }

    // --- ВАРІАНТ А: ЗАРАЗ ЙДЕ УРОК ---
    if (activeLesson) {
      const totalDuration = activeLesson.end - activeLesson.start;
      const elapsed = currentMinutes - activeLesson.start;
      const percent = (elapsed / totalDuration) * 100;
      const remaining = activeLesson.end - currentMinutes;

      progressWrapper.style.display = "block";
      progressFill.classList.remove("break-mode"); // Зелений колір
      progressFill.style.width = `${percent}%`;

      trackerText.innerHTML = `
        <div style="font-size: 0.9em; opacity: 0.8;">Зараз урок:</div>
        <div style="font-weight: 700; font-size: 1.1em;">${activeLesson.subject}</div>
        <div style="font-size: 0.85em; margin-top: 4px;">До кінця: ${formatMinutes(remaining)}</div>
      `;

      // --- ВАРІАНТ Б: ЗАРАЗ ПЕРЕРВА (або ранок до пар) ---
    } else if (nextLesson) {
      // Перерва триває від кінця минулої пари до початку наступної
      const breakStart = prevLessonEnd;
      const breakEnd = nextLesson.start;

      const totalBreakDuration = breakEnd - breakStart;
      const elapsedBreak = currentMinutes - breakStart;

      // Захист від ділення на нуль (рідкісний випадок)
      const percent =
        totalBreakDuration > 0 ? (elapsedBreak / totalBreakDuration) * 100 : 0;
      const remainingBreak = breakEnd - currentMinutes;

      progressWrapper.style.display = "block";
      progressFill.classList.add("break-mode"); // Вмикаємо помаранчевий колір
      progressFill.style.width = `${percent}%`;

      // Якщо це ранок (prevLessonEnd === 0), пишемо "Початок", інакше "Перерва"
      const title =
        prevLessonEnd === 0 ? "🌙 До початку навчання:" : "☕ Перерва";

      trackerText.innerHTML = `
        <div style="font-size: 1.1em; font-weight: bold; color: var(--accent-orange);">${title}</div>
        <div style="font-size: 0.9em; margin-top: 5px;">
            Наступний: <b>${nextLesson.subject}</b> о ${nextLesson.startStr}
        </div>
        <div style="font-size: 0.85em; opacity: 0.8; margin-top: 2px;">
            Залишилось часу: ${formatMinutes(remainingBreak)}
        </div>
      `;

      // --- ВАРІАНТ В: ВСІ ПАРИ ЗАКІНЧИЛИСЬ ---
    } else {
      progressWrapper.style.display = "none";
      trackerText.innerHTML = "На сьогодні все! Гарного відпочинку 🌙";
    }
  }

  // --- 4. ДОПОМІЖНІ ФУНКЦІЇ ---

  // Перетворює "13.55-15.15" у зручний об'єкт
  function parseTimeRange(timeStr) {
    const [startRaw, endRaw] = timeStr.split("-");
    return {
      start: timeToMinutes(startRaw),
      end: timeToMinutes(endRaw),
      startStr: startRaw.trim(),
    };
  }

  // "13.55" -> хвилин від початку доби
  function timeToMinutes(t) {
    const parts = t.replace(".", ":").split(":").map(Number);
    return parts[0] * 60 + parts[1];
  }

  // Форматує хвилини у "X год Y хв"
  function formatMinutes(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) return `${h} год ${m} хв`;
    return `${m} хв`;
  }

  function getDayName(dayIndex) {
    const days = [
      "Неділя",
      "Понеділок",
      "Вівторок",
      "Середа",
      "Четвер",
      "П'ятниця",
      "Субота",
    ];
    return days[dayIndex];
  }

  function getCurrentWeekType() {
    const now = new Date();
    const diffTime = now - startDate;
    const daysPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    // Захист від від'ємних днів, якщо дата старту в майбутньому
    const adjustedDays = daysPassed < 0 ? 0 : daysPassed;
    const weeksPassed = Math.floor(adjustedDays / 7);
    return weeksPassed % 2 === 0 ? "upper" : "lower";
  }

  // --- 5. РЕНДЕРИНГ ТАБЛИЦІ ---
  function renderSchedule(data) {
    if (data.upper) renderWeek("upper", data.upper);
    if (data.lower) renderWeek("lower", data.lower);
  }

  function renderWeek(containerId, weekData) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    for (const [dayName, lessons] of Object.entries(weekData)) {
      const dayDiv = document.createElement("div");
      dayDiv.className = "day";
      const title = document.createElement("h2");
      title.innerText = dayName;
      dayDiv.appendChild(title);

      const table = document.createElement("table");
      table.innerHTML = `<thead><tr><th>Час</th><th>Предмет</th><th>Тип</th><th>Викладач</th><th>Лінк</th></tr></thead><tbody></tbody>`;
      const tbody = table.querySelector("tbody");

      lessons.forEach((lesson) => {
        const tr = document.createElement("tr");
        tr.className = lesson.type;
        tr.innerHTML = `
            <td class="time-cell">${lesson.time}</td>
            <td class="subject-cell">${lesson.subject}</td>
            <td data-label="Тип"><span class="badge">${lesson.typeLabel}</span></td>
            <td class="teacher-cell">${lesson.teacher}</td>
            <td data-label="Лінк"><a href="${lesson.link}" target="_blank" class="btn-link">${lesson.linkText}</a></td>
        `;
        tbody.appendChild(tr);
      });
      dayDiv.appendChild(table);
      container.appendChild(dayDiv);
    }
  }

  // --- 6. НАВІГАЦІЯ І ТАБИ ---
  function initTabs() {
    const tabBtns = document.getElementsByClassName("tab-btn");
    Array.from(tabBtns).forEach((btn) => {
      btn.addEventListener("click", function () {
        openTab(this.dataset.tab);
      });
    });
  }

  function openTab(tabName) {
    const tabContent = document.getElementsByClassName("tab-content");
    for (let el of tabContent) el.classList.remove("active");
    const tabBtns = document.getElementsByClassName("tab-btn");
    for (let el of tabBtns) el.classList.remove("active");

    const content = document.getElementById(tabName);
    if (content) content.classList.add("active");

    const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (btn) btn.classList.add("active");
  }

  // Оновлення статусів (Passed, Current, Next) у таблиці
  function updateSchedule(forceSwitchTab) {
    const weekType = getCurrentWeekType();
    const statusEl = document.getElementById("weekStatus");
    if (statusEl)
      statusEl.innerHTML = `Зараз активний: <span>${weekType === "upper" ? "Верхній" : "Нижній"} тиждень</span>`;

    if (forceSwitchTab) openTab(weekType);
    highlightLessons(weekType, new Date());
  }

  // Кнопка "Де я?"
  findMeBtn.addEventListener("click", () => {
    updateSchedule(true);
    const activeRow =
      document.querySelector(".current") || document.querySelector(".next");
    if (activeRow) {
      activeRow.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      const today = getDayName(new Date().getDay());
      const headers = document.querySelectorAll("h2");
      let found = false;
      for (let h of headers) {
        if (h.innerText.includes(today)) {
          h.scrollIntoView({ behavior: "smooth", block: "center" });
          found = true;
          break;
        }
      }
      if (!found) window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  // Логіка підсвітки рядків
  function highlightLessons(tabId, now) {
    const dayMap = {
      Понеділок: 1,
      Вівторок: 2,
      Середа: 3,
      Четвер: 4,
      "П'ятниця": 5,
      Субота: 6,
      Неділя: 0,
    };
    const currentDayIndex = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const container = document.getElementById(tabId);
    if (!container) return;

    for (let day of container.getElementsByClassName("day")) {
      const titleText = day.querySelector("h2").innerText.trim();
      const dIdx = dayMap[titleText];

      day.classList.remove("day-passed");

      // Минулі дні
      if (dIdx < currentDayIndex && dIdx !== 0) {
        day.classList.add("day-passed");
        day.querySelectorAll("tr").forEach((r) => {
          r.classList.add("passed");
          r.classList.remove("current", "next");
        });
        continue;
      }
      // Майбутні дні
      if (dIdx > currentDayIndex) {
        day
          .querySelectorAll("tr")
          .forEach((r) => r.classList.remove("passed", "current", "next"));
        continue;
      }
      // Поточний день
      if (dIdx === currentDayIndex) {
        let nextFound = false;
        day.querySelectorAll("tbody tr").forEach((row) => {
          row.classList.remove("passed", "current", "next");
          const timeText = row.querySelector(".time-cell").innerText;
          const { start, end } = parseTimeRange(timeText);

          if (currentMinutes > end) {
            row.classList.add("passed");
          } else if (currentMinutes >= start && currentMinutes <= end) {
            row.classList.add("current");
            nextFound = true;
          } else {
            if (!nextFound) {
              row.classList.add("next");
              nextFound = true;
            }
          }
        });
      }
    }
  }
});
