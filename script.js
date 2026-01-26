document.addEventListener("DOMContentLoaded", function () {
  const startDate = new Date(2026, 0, 26);
  const themeCheckbox = document.getElementById("checkbox");
  const findMeBtn = document.getElementById("findMeBtn");

  // --- ЛОГІКА ТЕМИ (DARK MODE) ---

  // Перевірка збереженої теми
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

  // --- ОСНОВНА ЛОГІКА РОЗКЛАДУ ---

  if (window.scheduleData) {
    renderSchedule(window.scheduleData);
    initTabs();
    updateSchedule(true);
    setInterval(() => updateSchedule(false), 60000);
  } else {
    console.error("Дані розкладу не знайдені! Перевірте файл data.js");
    document.getElementById("weekStatus").innerText =
      "Помилка завантаження даних";
  }

  // --- КНОПКА "ДЕ Я ЗАРАЗ" ---
  findMeBtn.addEventListener("click", () => {
    updateSchedule(true);

    const activeRow =
      document.querySelector(".current") || document.querySelector(".next");

    if (activeRow) {
      activeRow.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      const dayMap = [
        "Неділя",
        "Понеділок",
        "Вівторок",
        "Середа",
        "Четвер",
        "П'ятниця",
        "Субота",
      ];
      const now = new Date();
      const todayName = dayMap[now.getDay()];

      const headers = document.querySelectorAll("h2");
      let todayHeader = null;

      for (let h of headers) {
        if (h.innerText.includes(todayName)) {
          todayHeader = h;
          break;
        }
      }

      if (todayHeader) {
        todayHeader.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  });

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
      table.innerHTML = `
                <thead>
                    <tr>
                        <th>Час</th>
                        <th>Предмет</th>
                        <th>Тип</th>
                        <th>Викладач</th>
                        <th>Лінк</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
      const tbody = table.querySelector("tbody");

      lessons.forEach((lesson) => {
        const tr = document.createElement("tr");
        tr.className = lesson.type;

        tr.innerHTML = `
                    <td class="time-cell" data-label="Час">${lesson.time}</td>
                    <td class="subject-cell" data-label="Предмет">${lesson.subject}</td>
                    <td data-label="Тип"><span class="badge">${lesson.typeLabel}</span></td>
                    <td class="teacher-cell" data-label="Викладач">${lesson.teacher}</td>
                    <td data-label="Лінк">
                        <a href="${lesson.link}" target="_blank" class="btn-link">
                            ${lesson.linkText}
                        </a>
                    </td>
                `;
        tbody.appendChild(tr);
      });

      dayDiv.appendChild(table);
      container.appendChild(dayDiv);
    }
  }

  function initTabs() {
    const tabBtns = document.getElementsByClassName("tab-btn");
    Array.from(tabBtns).forEach((btn) => {
      btn.addEventListener("click", function () {
        openTab(this.dataset.tab);
      });
    });
  }

  function updateSchedule(forceSwitchTab = false) {
    const now = new Date();
    const diffTime = now - startDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const adjustedDays = diffDays < 0 ? 0 : diffDays;
    const weeksPassed = Math.floor(adjustedDays / 7);

    const statusEl = document.getElementById("weekStatus");
    if (!statusEl) return;

    let targetTabId = "lower";

    if (weeksPassed % 2 === 0) {
      targetTabId = "upper";
      statusEl.innerHTML = "Зараз активний: <span>Верхній тиждень</span>";
    } else {
      targetTabId = "lower";
      statusEl.innerHTML = "Зараз активний: <span>Нижній тиждень</span>";
    }

    if (forceSwitchTab) {
      openTab(targetTabId);
    }

    highlightLessons(targetTabId, now);
  }

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
    const container = document.getElementById(tabId);
    if (!container) return;

    const days = container.getElementsByClassName("day");

    let nextFound = false;

    for (let day of days) {
      const title = day.querySelector("h2").innerText.trim();
      const dayIndex = dayMap[title];

      day.classList.remove("day-passed");

      if (dayIndex < currentDayIndex && dayIndex !== 0) {
        day.classList.add("day-passed");
        const rows = day.querySelectorAll("tbody tr");
        rows.forEach((row) => {
          row.classList.add("passed");
          row.classList.remove("current", "next");
        });
        continue;
      }

      if (dayIndex > currentDayIndex) {
        const rows = day.querySelectorAll("tbody tr");
        rows.forEach((row) => {
          row.classList.remove("passed", "current", "next");
          if (!nextFound) {
            row.classList.add("next");
            nextFound = true;
          }
        });
        continue;
      }

      if (dayIndex === currentDayIndex) {
        const rows = day.querySelectorAll("tbody tr");

        rows.forEach((row) => {
          row.classList.remove("passed", "current", "next");

          const timeCell = row.querySelector(".time-cell");
          if (!timeCell) return;

          const timeText = timeCell.innerText.trim();
          const [startStr, endStr] = timeText.split("-");

          const startTime = parseTime(startStr, now);
          const endTime = parseTime(endStr, now);

          if (now > endTime) {
            row.classList.add("passed");
          } else if (now >= startTime && now <= endTime) {
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

  function parseTime(timeStr, dateRef) {
    const [hours, minutes] = timeStr.trim().split(".").map(Number);
    const newDate = new Date(dateRef);
    newDate.setHours(hours, minutes, 0, 0);
    return newDate;
  }

  function openTab(tabName) {
    const tabContent = document.getElementsByClassName("tab-content");
    for (let i = 0; i < tabContent.length; i++) {
      tabContent[i].classList.remove("active");
    }

    const tabBtns = document.getElementsByClassName("tab-btn");
    for (let i = 0; i < tabBtns.length; i++) {
      tabBtns[i].classList.remove("active");
    }

    const content = document.getElementById(tabName);
    if (content) content.classList.add("active");

    const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (btn) btn.classList.add("active");
  }
});
