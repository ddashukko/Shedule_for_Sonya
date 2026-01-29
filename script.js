document.addEventListener("DOMContentLoaded", function () {
  const startDate = new Date(2026, 0, 26);
  let isEditMode = false;

  // 1. ТЕМА (Dark/Light Mode)
  const themeCheckbox = document.getElementById("checkbox");
  if (localStorage.getItem("theme") === "dark") {
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

  // 2. FIREBASE: ОТРИМАННЯ ДАНИХ (З КОРЕНЯ БАЗИ)
  const scheduleRef = db.ref("/");

  scheduleRef.on("value", (snapshot) => {
    const data = snapshot.val();
    if (data) {
      window.scheduleData = data;
      // Рендеримо все наново при будь-якій зміні в базі
      renderSchedule(data);
      initTabs();
      updateSchedule(true);
      updateTimeTracker();
    } else {
      document.getElementById("weekStatus").innerText = "База даних порожня";
    }
  });

  // Оновлення таймерів
  setInterval(updateTimeTracker, 1000);
  setInterval(() => updateSchedule(false), 60000);

  // 3. РЕНДЕРИНГ РОЗКЛАДУ
  function renderSchedule(data) {
    if (data.upper) renderWeek("upper", data.upper);
    if (data.lower) renderWeek("lower", data.lower);
  }

  function renderWeek(containerId, weekData) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    const DAY_START = 8 * 60;
    const DAY_END = 21 * 60;
    const daysOrder = [
      "Понеділок",
      "Вівторок",
      "Середа",
      "Четвер",
      "П'ятниця",
      "Субота",
      "Неділя",
    ];

    // Сортуємо дні тижня, щоб вони йшли по порядку, а не як в JSON
    const sortedDays = Object.keys(weekData).sort(
      (a, b) => daysOrder.indexOf(a) - daysOrder.indexOf(b),
    );

    sortedDays.forEach((dayName) => {
      const lessons = weekData[dayName] || [];
      const dayDiv = document.createElement("div");
      dayDiv.className = "day";
      dayDiv.innerHTML = `<h2>${dayName}</h2><table><thead><tr><th>Час</th><th>Предмет</th><th>Тип</th><th>Викладач</th><th>Лінк</th></tr></thead><tbody></tbody></table>`;
      const tbody = dayDiv.querySelector("tbody");

      let lastEnd = DAY_START;

      // Сортуємо уроки за часом перед рендерингом
      const sortedLessons = [...lessons].sort(
        (a, b) => parseTimeRange(a.time).start - parseTimeRange(b.time).start,
      );

      if (sortedLessons.length === 0) {
        appendFreeTime(tbody, DAY_END - DAY_START, true);
      } else {
        sortedLessons.forEach((lesson, index) => {
          const { start, end } = parseTimeRange(lesson.time);

          // Вільний час ДО уроку
          if (start - lastEnd >= 50) {
            appendFreeTime(tbody, start - lastEnd);
          }

          const tr = document.createElement("tr");
          tr.className = lesson.type;
          tr.innerHTML = `
                        <td class="time-cell">${lesson.time}</td>
                        <td class="subject-cell">
                            ${lesson.subject}
                            <button class="delete-btn" onclick="deleteLesson('${containerId}', '${dayName}', ${index})">🗑</button>
                        </td>
                        <td data-label="Тип"><span class="badge">${lesson.typeLabel}</span></td>
                        <td class="teacher-cell">${lesson.teacher || ""}</td>
                        <td data-label="Лінк"><a href="${lesson.link}" target="_blank" class="btn-link">${lesson.linkText || "Link"}</a></td>
                    `;
          tbody.appendChild(tr);
          lastEnd = end;
        });

        // Вільний час ПІСЛЯ останнього уроку
        if (DAY_END - lastEnd >= 50) {
          appendFreeTime(tbody, DAY_END - lastEnd);
        }
      }
      container.appendChild(dayDiv);
    });
  }

  function appendFreeTime(tbody, minutes, isFullDay = false) {
    const tr = document.createElement("tr");
    tr.className = "free-time-row";
    const text = isFullDay
      ? `☕ Вільний день`
      : `☕ Вільний час: ${formatMinutes(minutes)}`;
    tr.innerHTML = `<td colspan="5" class="free-time-cell">${text}</td>`;
    tbody.appendChild(tr);
  }

  // 4. ТАЙМЕР І ПРОГРЕС-БАР
  function updateTimeTracker() {
    const trackerContainer = document.getElementById("timeTracker");
    const trackerText = document.getElementById("tracker-text");
    const progressFill = document.getElementById("progress-fill");
    const progressWrapper = document.getElementById("progress-wrapper");

    if (!window.scheduleData) return;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const weekType = getCurrentWeekType();
    const dayName = getDayName(now.getDay());

    // Якщо даних на сьогодні немає
    if (
      !window.scheduleData[weekType] ||
      !window.scheduleData[weekType][dayName]
    ) {
      trackerContainer.style.display = "none";
      return;
    }

    trackerContainer.style.display = "block";
    const todaysLessons = window.scheduleData[weekType][dayName];

    // Сортуємо для коректного пошуку next/active
    const sortedLessons = [...todaysLessons].sort(
      (a, b) => parseTimeRange(a.time).start - parseTimeRange(b.time).start,
    );

    let active = null;
    let next = null;
    let prevEnd = 0;

    for (const lesson of sortedLessons) {
      const { start, end, startStr } = parseTimeRange(lesson.time);

      if (currentMinutes >= start && currentMinutes < end) {
        active = { ...lesson, start, end };
        break;
      }
      if (currentMinutes < start) {
        next = { ...lesson, start, startStr };
        break;
      }
      prevEnd = end;
    }

    if (active) {
      // Йде урок
      const duration = active.end - active.start;
      const passed = currentMinutes - active.start;
      const percent = (passed / duration) * 100;

      progressWrapper.style.display = "block";
      progressFill.style.width = `${percent}%`;
      progressFill.classList.remove("break-mode");

      trackerText.innerHTML = `
                <div style="opacity:0.8; font-size:0.9em">Зараз урок:</div>
                <div style="font-size:1.1em; font-weight:700">${active.subject}</div>
                <div style="font-size:0.85em; margin-top:4px">До кінця: ${formatMinutes(active.end - currentMinutes)}</div>
            `;
    } else if (next) {
      // Перерва
      const breakStart = prevEnd || 8 * 60; // Якщо перша пара, рахуємо від 8:00
      const breakDuration = next.start - breakStart;
      const breakPassed = currentMinutes - breakStart;

      let percent = 0;
      if (breakDuration > 0) {
        percent = (breakPassed / breakDuration) * 100;
      }

      progressWrapper.style.display = "block";
      progressFill.style.width = `${percent}%`;
      progressFill.classList.add("break-mode");

      const title = prevEnd === 0 ? "🌙 До початку навчання:" : "☕ Перерва";
      trackerText.innerHTML = `
                <div style="color:var(--accent-orange); font-weight:bold; font-size:1.1em">${title}</div>
                <div style="margin-top:5px">Наступний: <b>${next.subject}</b> о ${next.startStr}</div>
                <div style="font-size:0.85em; opacity:0.8">Залишилось: ${formatMinutes(next.start - currentMinutes)}</div>
            `;
    } else {
      // Кінець дня
      progressWrapper.style.display = "none";
      trackerText.innerHTML = "На сьогодні все! Гарного відпочинку 🌙";
    }
  }

  // 5. АДМІН-ПАНЕЛЬ (ДОДАВАННЯ/ВИДАЛЕННЯ)
  const modal = document.getElementById("adminModal");
  const adminBtn = document.getElementById("adminBtn");

  // Відкриття модалки
  adminBtn.onclick = () => (modal.style.display = "block");
  document.getElementById("closeModal").onclick = () =>
    (modal.style.display = "none");

  // Перемикання режиму видалення (правий клік або довгий тап)
  adminBtn.oncontextmenu = (e) => {
    e.preventDefault();
    isEditMode = !isEditMode;
    document.body.classList.toggle("edit-mode", isEditMode);

    // Вібрація для телефону
    if (navigator.vibrate) navigator.vibrate(50);

    const btn = e.currentTarget;
    btn.style.transform = "scale(1.2)";
    setTimeout(() => (btn.style.transform = "scale(1)"), 200);

    alert(
      isEditMode ? "🗑 Режим видалення УВІМКНЕНО" : "Режим видалення вимкнено",
    );
  };

  // Функція видалення (глобальна)
  window.deleteLesson = function (week, day, index) {
    if (!confirm("Точно видалити цей урок?")) return;

    // Отримуємо поточний масив
    const lessons = window.scheduleData[week][day];
    lessons.splice(index, 1); // Вирізаємо елемент

    // Оновлюємо базу
    db.ref(`${week}/${day}`)
      .set(lessons)
      .then(() => console.log("Видалено"))
      .catch((err) => alert("Помилка: " + err));
  };

  // Форма додавання
  document.getElementById("editForm").onsubmit = function (e) {
    e.preventDefault();

    const week = document.getElementById("editWeek").value;
    const day = document.getElementById("editDay").value;

    // Отримуємо текст з селекта типу (щоб дістати "Інд" або "Пара")
    const typeSelect = document.getElementById("editType");
    const selectedOption = typeSelect.options[typeSelect.selectedIndex];
    const typeLabelRaw = selectedOption.text;
    // Витягуємо текст в дужках: "Індивідуальне (Інд)" -> "Інд"
    const typeLabelMatch = typeLabelRaw.match(/\(([^)]+)\)/);
    const typeLabel = typeLabelMatch ? typeLabelMatch[1] : "Пара";

    const newLesson = {
      subject: document.getElementById("editSubject").value,
      time: document.getElementById("editTime").value,
      type: typeSelect.value,
      typeLabel: typeLabel,
      teacher: document.getElementById("editTeacher").value,
      link: document.getElementById("editLink").value,
      linkText: "Link", // Стандартний текст
    };

    // Читаємо поточні дані, щоб додати, а не перезаписати
    db.ref(`${week}/${day}`)
      .once("value")
      .then((snapshot) => {
        const currentLessons = snapshot.val() || [];
        currentLessons.push(newLesson);

        // Сортуємо одразу перед записом, щоб в базі був порядок
        currentLessons.sort(
          (a, b) => parseTimeRange(a.time).start - parseTimeRange(b.time).start,
        );

        return db.ref(`${week}/${day}`).set(currentLessons);
      })
      .then(() => {
        modal.style.display = "none";
        document.getElementById("editForm").reset();
      });
  };

  // 6. ДОПОМІЖНІ ТА ІНШІ ФУНКЦІЇ
  function parseTimeRange(timeStr) {
    if (!timeStr) return { start: 0, end: 0, startStr: "" };
    const parts = timeStr.split("-");
    const startRaw = parts[0].trim();
    const endRaw = parts[1] ? parts[1].trim() : startRaw;
    return {
      start: timeToMinutes(startRaw),
      end: timeToMinutes(endRaw),
      startStr: startRaw,
    };
  }

  function timeToMinutes(t) {
    if (!t) return 0;
    const parts = t.replace(".", ":").split(":").map(Number);
    return parts[0] * 60 + parts[1];
  }

  function formatMinutes(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) return `${h}г ${m}хв`;
    return `${m}хв`;
  }

  function getDayName(idx) {
    const d = [
      "Неділя",
      "Понеділок",
      "Вівторок",
      "Середа",
      "Четвер",
      "П'ятниця",
      "Субота",
    ];
    return d[idx];
  }

  function getCurrentWeekType() {
    const now = new Date();
    const diff = now - startDate;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const safeDays = days < 0 ? 0 : days;
    const weeks = Math.floor(safeDays / 7);
    return weeks % 2 === 0 ? "upper" : "lower";
  }

  function initTabs() {
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach((btn) => {
      btn.onclick = () => {
        document
          .querySelectorAll(".tab-btn")
          .forEach((b) => b.classList.remove("active"));
        document
          .querySelectorAll(".tab-content")
          .forEach((c) => c.classList.remove("active"));

        btn.classList.add("active");
        document.getElementById(btn.dataset.tab).classList.add("active");
      };
    });
  }

  function updateSchedule(forceSwitch) {
    const type = getCurrentWeekType();
    const statusEl = document.getElementById("weekStatus");
    if (statusEl) {
      statusEl.innerHTML = `Зараз активний: <span>${type === "upper" ? "Верхній" : "Нижній"} тиждень</span>`;
    }

    if (forceSwitch) {
      const btn = document.querySelector(`.tab-btn[data-tab="${type}"]`);
      if (btn) btn.click();
    }
    highlightLessons(type, new Date());
  }

  function highlightLessons(tabId, now) {
    const container = document.getElementById(tabId);
    if (!container) return;

    const dayMap = {
      Понеділок: 1,
      Вівторок: 2,
      Середа: 3,
      Четвер: 4,
      "П'ятниця": 5,
      Субота: 6,
      Неділя: 0,
    };
    const curDayIdx = now.getDay();
    const curMins = now.getHours() * 60 + now.getMinutes();

    const days = container.getElementsByClassName("day");
    for (let day of days) {
      const title = day.querySelector("h2").innerText;
      const dIdx = dayMap[title];

      day.classList.remove("day-passed");

      // Якщо день пройшов
      const dayOrder = dIdx === 0 ? 7 : dIdx; // Неділя - кінець тижня для логіки
      const curOrder = curDayIdx === 0 ? 7 : curDayIdx;

      if (dayOrder < curOrder) {
        day.classList.add("day-passed");
        day.querySelectorAll("tr").forEach((r) => r.classList.add("passed"));
      } else if (dayOrder === curOrder) {
        // Поточний день
        day.querySelectorAll("tbody tr").forEach((row) => {
          if (row.classList.contains("free-time-row")) return; // Пропускаємо вільний час

          const timeText = row.querySelector(".time-cell").innerText;
          const { start, end } = parseTimeRange(timeText);

          row.classList.remove("passed", "current", "next");

          if (curMins > end) {
            row.classList.add("passed");
          } else if (curMins >= start && curMins <= end) {
            row.classList.add("current");
          } else if (curMins < start) {
            // Якщо ще не було "next", то це найближчий
            if (!day.querySelector(".next") && !day.querySelector(".current")) {
              row.classList.add("next");
            }
          }
        });
      }
    }
  }

  // Кнопка "Де я"
  document.getElementById("findMeBtn").onclick = () => {
    updateSchedule(true);
    setTimeout(() => {
      const target =
        document.querySelector(".current") ||
        document.querySelector(".next") ||
        document.querySelector(".day:not(.day-passed)");
      if (target)
        target.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };
});
