document.addEventListener("DOMContentLoaded", function () {
  const startDate = new Date(2026, 0, 26);
  let isEditMode = false;
  let editingTarget = null; // Зберігає дані про урок, який редагується (null = створення нового)
  let deleteTarget = null;

  // 1. ТЕМА
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

  // 2. FIREBASE
  const scheduleRef = db.ref("/");
  scheduleRef.on("value", (snapshot) => {
    const data = snapshot.val();
    if (data) {
      window.scheduleData = data;
      renderSchedule(data);
      initTabs();
      updateSchedule(true);
      updateTimeTracker();
    } else {
      document.getElementById("weekStatus").innerText = "База даних порожня";
    }
  });

  setInterval(updateTimeTracker, 1000);
  setInterval(() => updateSchedule(false), 60000);

  // 3. РЕНДЕРИНГ
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
      const sortedLessons = [...lessons].sort(
        (a, b) => parseTimeRange(a.time).start - parseTimeRange(b.time).start,
      );

      if (sortedLessons.length === 0) {
        appendFreeTime(tbody, DAY_END - DAY_START, true);
      } else {
        sortedLessons.forEach((lesson, index) => {
          const { start, end } = parseTimeRange(lesson.time);
          if (start - lastEnd >= 50) appendFreeTime(tbody, start - lastEnd);

          const tr = document.createElement("tr");
          tr.className = lesson.type;

          // ДОДАНО КНОПКУ РЕДАГУВАННЯ (ОЛІВЕЦЬ)
          tr.innerHTML = `
                        <td class="time-cell">${lesson.time}</td>
                        <td class="subject-cell">
                            ${lesson.subject}
                            <div class="action-btns">
                                <button class="edit-lesson-btn" onclick="openEditModal('${containerId}', '${dayName}', ${index})">✎</button>
                                <button class="delete-btn" onclick="requestDelete('${containerId}', '${dayName}', ${index}, '${lesson.subject}')">🗑</button>
                            </div>
                        </td>
                        <td data-label="Тип"><span class="badge">${lesson.typeLabel}</span></td>
                        <td class="teacher-cell">${lesson.teacher || ""}</td>
                        <td data-label="Лінк"><a href="${lesson.link}" target="_blank" class="btn-link">${lesson.linkText || "Link"}</a></td>
                    `;
          tbody.appendChild(tr);
          lastEnd = end;
        });
        if (DAY_END - lastEnd >= 50) appendFreeTime(tbody, DAY_END - lastEnd);
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

  // 4. ТАЙМЕР
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

    if (
      !window.scheduleData[weekType] ||
      !window.scheduleData[weekType][dayName]
    ) {
      trackerContainer.style.display = "none";
      return;
    }

    trackerContainer.style.display = "block";
    const todaysLessons = window.scheduleData[weekType][dayName];
    const sortedLessons = [...todaysLessons].sort(
      (a, b) => parseTimeRange(a.time).start - parseTimeRange(b.time).start,
    );

    let active = null,
      next = null,
      prevEnd = 0;
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
      const duration = active.end - active.start;
      const passed = currentMinutes - active.start;
      const percent = (passed / duration) * 100;
      progressWrapper.style.display = "block";
      progressFill.style.width = `${percent}%`;
      progressFill.classList.remove("break-mode");
      trackerText.innerHTML = `<div style="opacity:0.8; font-size:0.9em">Зараз урок:</div><div style="font-size:1.1em; font-weight:700">${active.subject}</div><div style="font-size:0.85em; margin-top:4px">До кінця: ${formatMinutes(active.end - currentMinutes)}</div>`;
    } else if (next) {
      const breakStart = prevEnd || 8 * 60;
      const breakDuration = next.start - breakStart;
      const breakPassed = currentMinutes - breakStart;
      let percent = 0;
      if (breakDuration > 0) percent = (breakPassed / breakDuration) * 100;
      progressWrapper.style.display = "block";
      progressFill.style.width = `${percent}%`;
      progressFill.classList.add("break-mode");
      const title = prevEnd === 0 ? "🌙 До початку навчання:" : "☕ Перерва";
      trackerText.innerHTML = `<div style="color:var(--accent-orange); font-weight:bold; font-size:1.1em">${title}</div><div style="margin-top:5px">Наступний: <b>${next.subject}</b> о ${next.startStr}</div><div style="font-size:0.85em; opacity:0.8">Залишилось: ${formatMinutes(next.start - currentMinutes)}</div>`;
    } else {
      progressWrapper.style.display = "none";
      trackerText.innerHTML = "На сьогодні все! Гарного відпочинку 🌙";
    }
  }

  // 5. КЕРУВАННЯ ТА РЕДАГУВАННЯ

  const adminModal = document.getElementById("adminModal");
  const adminBtn = document.getElementById("adminBtn");
  const modalTitle = document.querySelector("#adminModal h3");

  // Відкриття форми для СТВОРЕННЯ (скидаємо editingTarget)
  adminBtn.onclick = () => {
    editingTarget = null; // Це режим створення
    modalTitle.innerText = "Додати новий запис";
    document.getElementById("editForm").reset();
    adminModal.style.display = "block";
  };

  document.getElementById("closeModal").onclick = () =>
    (adminModal.style.display = "none");

  // Відкриття форми для РЕДАГУВАННЯ
  window.openEditModal = function (week, day, index) {
    editingTarget = { week, day, index }; // Запам'ятовуємо, що редагуємо
    modalTitle.innerText = "Редагувати запис";

    // Отримуємо дані уроку
    const lesson = window.scheduleData[week][day][index];

    // Заповнюємо форму
    document.getElementById("editWeek").value = week;
    document.getElementById("editDay").value = day;
    document.getElementById("editSubject").value = lesson.subject;
    document.getElementById("editTime").value = lesson.time;
    document.getElementById("editType").value = lesson.type;
    document.getElementById("editTeacher").value = lesson.teacher || "";
    document.getElementById("editLink").value = lesson.link || "";

    adminModal.style.display = "block";
  };

  // Перемикач режиму
  const editModeBtn = document.getElementById("editModeBtn");
  editModeBtn.onclick = () => {
    isEditMode = !isEditMode;
    document.body.classList.toggle("edit-mode", isEditMode);

    if (isEditMode) {
      editModeBtn.classList.add("active");
      editModeBtn.innerHTML = "❌";
    } else {
      editModeBtn.classList.remove("active");
      editModeBtn.innerHTML = "✏️";
    }
  };

  // Видалення
  const deleteModal = document.getElementById("deleteModal");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
  const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
  const deleteConfirmText = document.getElementById("deleteConfirmText");

  window.requestDelete = function (week, day, index, subjectName) {
    deleteTarget = { week, day, index };
    deleteConfirmText.innerHTML = `Ви точно хочете видалити <b>"${subjectName}"</b>?`;
    deleteModal.style.display = "block";
  };

  confirmDeleteBtn.onclick = function () {
    if (deleteTarget) {
      const { week, day, index } = deleteTarget;
      const dayRef = db.ref(`${week}/${day}`);
      dayRef.once("value").then((snapshot) => {
        const lessons = snapshot.val();
        if (lessons) {
          lessons.splice(index, 1);
          dayRef
            .set(lessons.length > 0 ? lessons : [])
            .then(() => {
              deleteModal.style.display = "none";
              deleteTarget = null;
            })
            .catch((err) => alert("Помилка: " + err));
        }
      });
    }
  };

  cancelDeleteBtn.onclick = () => {
    deleteModal.style.display = "none";
    deleteTarget = null;
  };

  // --- ЗБЕРЕЖЕННЯ (ДОДАВАННЯ або ОНОВЛЕННЯ) ---
  document.getElementById("editForm").onsubmit = function (e) {
    e.preventDefault();
    const week = document.getElementById("editWeek").value;
    const day = document.getElementById("editDay").value;
    const typeSelect = document.getElementById("editType");
    const selectedOption = typeSelect.options[typeSelect.selectedIndex];
    const typeLabelMatch = selectedOption.text.match(/\(([^)]+)\)/);
    const typeLabel = typeLabelMatch ? typeLabelMatch[1] : "Пара";

    const newLesson = {
      subject: document.getElementById("editSubject").value,
      time: document.getElementById("editTime").value,
      type: typeSelect.value,
      typeLabel: typeLabel,
      teacher: document.getElementById("editTeacher").value,
      link: document.getElementById("editLink").value,
      linkText: "Link",
    };

    // Логіка: Якщо ми редагуємо -> оновлюємо існуючий. Якщо ні -> додаємо новий.
    if (editingTarget) {
      // РЕДАГУВАННЯ
      // Увага: якщо користувач змінив тиждень або день, треба видалити зі старого місця і додати в нове
      const samePlace =
        editingTarget.week === week && editingTarget.day === day;

      if (samePlace) {
        // Просто оновлюємо масив
        db.ref(`${week}/${day}`)
          .once("value")
          .then((snapshot) => {
            const lessons = snapshot.val();
            lessons[editingTarget.index] = newLesson;
            lessons.sort(
              (a, b) =>
                parseTimeRange(a.time).start - parseTimeRange(b.time).start,
            );
            return db.ref(`${week}/${day}`).set(lessons);
          })
          .then(() => {
            adminModal.style.display = "none";
            editingTarget = null;
            document.getElementById("editForm").reset();
          });
      } else {
        // Перенесення в інший день (видалити старе -> додати нове)
        const oldRef = db.ref(`${editingTarget.week}/${editingTarget.day}`);
        const newRef = db.ref(`${week}/${day}`);

        oldRef
          .once("value")
          .then((snapshot) => {
            const oldLessons = snapshot.val();
            oldLessons.splice(editingTarget.index, 1);
            return oldRef.set(oldLessons.length > 0 ? oldLessons : []);
          })
          .then(() => {
            return newRef.once("value");
          })
          .then((snapshot) => {
            const newLessons = snapshot.val() || [];
            newLessons.push(newLesson);
            newLessons.sort(
              (a, b) =>
                parseTimeRange(a.time).start - parseTimeRange(b.time).start,
            );
            return newRef.set(newLessons);
          })
          .then(() => {
            adminModal.style.display = "none";
            editingTarget = null;
            document.getElementById("editForm").reset();
          });
      }
    } else {
      // СТВОРЕННЯ НОВОГО
      db.ref(`${week}/${day}`)
        .once("value")
        .then((snapshot) => {
          const currentLessons = snapshot.val() || [];
          currentLessons.push(newLesson);
          currentLessons.sort(
            (a, b) =>
              parseTimeRange(a.time).start - parseTimeRange(b.time).start,
          );
          return db.ref(`${week}/${day}`).set(currentLessons);
        })
        .then(() => {
          adminModal.style.display = "none";
          document.getElementById("editForm").reset();
        });
    }
  };

  // ФУНКЦІЇ (ЧАС, ВКЛАДКИ)
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
    return h > 0 ? `${h}г ${m}хв` : `${m}хв`;
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
    if (statusEl)
      statusEl.innerHTML = `Зараз активний: <span>${type === "upper" ? "Верхній" : "Нижній"} тиждень</span>`;
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
      const dayOrder = dIdx === 0 ? 7 : dIdx;
      const curOrder = curDayIdx === 0 ? 7 : curDayIdx;

      // ЛОГІКА ДЛЯ МИНУЛИХ УРОКІВ
      if (dayOrder < curOrder) {
        day.classList.add("day-passed");
        day.querySelectorAll("tr").forEach((r) => r.classList.add("passed"));
      } else if (dayOrder === curOrder) {
        day.querySelectorAll("tbody tr").forEach((row) => {
          if (row.classList.contains("free-time-row")) return;
          const timeText = row.querySelector(".time-cell").innerText;
          const { start, end } = parseTimeRange(timeText);
          row.classList.remove("passed", "current", "next");
          if (curMins > end) row.classList.add("passed");
          else if (curMins >= start && curMins <= end)
            row.classList.add("current");
          else if (curMins < start) {
            if (!day.querySelector(".next") && !day.querySelector(".current"))
              row.classList.add("next");
          }
        });
      }
    }
  }
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
