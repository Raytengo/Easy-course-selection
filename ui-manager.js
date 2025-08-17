// 課程管理器 - 負責課程資料的載入、儲存和管理
class CourseManager {
  constructor() {
    this.allCourses = [];
    this.selectedCourses = new Set();
    this.focusedCourseId = null;
  }

  // 從 JSON 檔案載入課程資料
  async loadCourses() {
    try {
      // 重新整理頁面時清除localStorage，確保用戶可以重新開始
      if (performance.navigation && performance.navigation.type === 1) {
        // 頁面重新整理
        localStorage.removeItem('coursesData');
        console.log('頁面重新整理，已清除先前的課程資料');
      } else if (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]?.type === 'reload') {
        // 現代瀏覽器的重新整理檢測
        localStorage.removeItem('coursesData');
        console.log('頁面重新整理，已清除先前的課程資料');
      }

      // 優先使用 localStorage（如果有的話），方便在沒有後端的情況下保留使用者新增的課程
      const stored = localStorage.getItem('coursesData');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          this.allCourses = parsed.courses || [];
          console.log('從 localStorage 載入課程資料:', this.allCourses.length, '門課程');
          return;
        } catch (e) {
          console.warn('localStorage 解析失敗，改從檔案載入', e);
        }
      }

      // fallback: 從靜態 JSON 檔載入（僅在開發或有伺服器環境時可用）
      const response = await fetch('courses.json');
      const data = await response.json();
      this.allCourses = data.courses || [];
      console.log('已載入課程資料:', this.allCourses.length, '門課程');
    } catch (error) {
      console.error('載入課程資料失敗:', error);
      // 如果載入失敗，使用預設資料
      this.allCourses = [];
    }
  }

  // 儲存課程資料到 JSON 檔案（實際需要後端支援）
  async saveCourses() {
    try {
      // 在無後端的情況下，將資料儲存到 localStorage 作為持久化方案
      const data = { courses: this.allCourses };
      console.log('儲存課程資料（local）:', data);
      try {
        localStorage.setItem('coursesData', JSON.stringify(data));
      } catch (e) {
        console.warn('無法寫入 localStorage:', e);
      }
      // 注意：無法直接從瀏覽器寫入檔案系統，若需產生可下載的 JSON 檔案，請使用 exportCoursesToFile()
    } catch (error) {
      console.error('儲存課程資料失敗:', error);
    }
  }

  // 產生 courses.json 下載檔（供使用者手動保存並覆蓋原始檔案）
  exportCoursesToFile(filename = 'courses.json') {
    try {
      const data = { courses: this.allCourses };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      console.log('已產生下載檔：', filename);
    } catch (err) {
      console.error('匯出課程檔案失敗：', err);
    }
  }

  // 新增課程
  addCourse(course) {
    if (!this.allCourses.find(c => c.id === course.id)) {
      this.allCourses.push(course);
      this.saveCourses();
      return true;
    }
    return false;
  }

  // 移除課程
  removeCourse(courseId) {
    const index = this.allCourses.findIndex(c => c.id === courseId);
    if (index !== -1) {
      this.allCourses.splice(index, 1);
      this.selectedCourses.delete(courseId);
      if (this.focusedCourseId === courseId) {
        this.focusedCourseId = null;
      }
      this.saveCourses();
      return true;
    }
    return false;
  }

  // 刪除所有課程
  removeAllCourses() {
    if (this.allCourses.length === 0) {
      return;
    }
    const courseCount = this.allCourses.length;
    const confirmed = 1;
    if (confirmed) {
      this.allCourses = [];
      this.selectedCourses.clear();
      this.focusedCourseId = null;
      localStorage.removeItem('coursesData');
      this.renderCourseList();
      this.updateToggleAllButtonState();
      if (window.uiManager) {
        window.uiManager.updateTimetableCourses();
      }
      // 按鈕文字和動畫效果
      const deleteAllBtn = document.getElementById('delete-all-btn');
      if (deleteAllBtn) {
        deleteAllBtn.textContent = '已經刪除';
        deleteAllBtn.classList.add('opacity-60');
        deleteAllBtn.style.transition = 'all 0.2s';
        deleteAllBtn.style.transform = 'scale(0.95)';
        setTimeout(() => {
          deleteAllBtn.textContent = '全部刪除';
          deleteAllBtn.classList.remove('opacity-60');
          deleteAllBtn.style.transform = '';
        }, 2000);
      }
    }
  }

  // 取得過濾後的課程列表
  getFilteredCourses(searchTerm = '') {
    if (!searchTerm) return this.allCourses;
    const term = searchTerm.toLowerCase();
    return this.allCourses.filter(course => 
      course.name.toLowerCase().includes(term) || 
      course.code.toLowerCase().includes(term)
    );
  }

  // 切換課程選擇狀態
  toggleCourse(courseId) {
    if (this.selectedCourses.has(courseId)) {
      this.selectedCourses.delete(courseId);
      if (this.focusedCourseId === courseId) {
        this.focusedCourseId = null;
      }
    } else {
      this.selectedCourses.add(courseId);
    }
  }

  // 全選/取消全選
  toggleAll(courses) {
    const allSelected = courses.every(course => this.selectedCourses.has(course.id));
    if (allSelected) {
      courses.forEach(course => this.selectedCourses.delete(course.id));
    } else {
      courses.forEach(course => this.selectedCourses.add(course.id));
    }
  }

  // 切換聚焦狀態
  toggleFocus(courseId) {
    this.focusedCourseId = (this.focusedCourseId === courseId) ? null : courseId;
  }

  // 渲染課程列表
  renderCourseList() {
    const courseListContainer = document.getElementById('course-list');
    const searchBox = document.getElementById('search-box');
    
    if (!courseListContainer) return;

    const searchTerm = searchBox ? searchBox.value : '';
    const filteredCourses = this.getFilteredCourses(searchTerm);
    
    courseListContainer.innerHTML = '';
    
    filteredCourses.forEach(course => {
      const isSelected = this.selectedCourses.has(course.id);
      const div = document.createElement('div');
      div.className = 'glass-card p-3 border-l-4 course-card';
      div.id = `course-card-${course.id}`;
      
      // 設定顏色變數
      const strongColor = this.fadeColor(course.color, 0.95);
      const faintColor = this.fadeColor(course.color, 0.45);
      div.style.setProperty('--card-hl', strongColor);
      div.style.setProperty('--card-hl-faint', faintColor);
      div.dataset.color = course.color;
      div.style.borderLeftColor = isSelected ? strongColor : faintColor;
      
      const timeStr = course.times.map(t => `${t.day} ${t.start} - ${t.end}`).join('<br>');
      
      div.innerHTML = `
        <div class="flex justify-between items-start">
          <div>
            <h3 class="font-bold text-base text-slate-800">${course.name}</h3>
            <p class="text-xs text-slate-600">${course.code} - ${course.section}</p>
            <p class="text-xs text-slate-500 mt-1">${course.instructor}</p>
          </div>
          <button onclick="window.courseManager.handleToggleCourse('${course.id}')" class="add-btn ${isSelected ? 'bg-emerald-500/80' : 'bg-white/30'} transition-colors rounded-full" data-selected="${isSelected ? 'true' : 'false'}" title="${isSelected ? '按一下取消選取' : '按一下加入課表'}" aria-label="${isSelected ? '按一下取消選取' : '按一下加入課表'}">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-plus h-5 w-5 text-slate-600" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-check h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-x h-5 w-5" viewBox="0 0 20 20" fill="#ef4444"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
          </button>
        </div>
        <div class="text-xs text-slate-700 mt-2 pt-2 border-t border-white/50">${timeStr}</div>
      `;
      
      courseListContainer.appendChild(div);
      
      // 綁定卡片點擊事件
      div.addEventListener('click', (e) => {
        if (e.target.closest('.add-btn')) return;
        this.handleListCardClick(course.id);
      });
      
      // 如果是聚焦的課程，添加聚焦樣式
      if (this.focusedCourseId === course.id) {
        div.classList.add('course-focus');
      }
    });
  }

  // 更新全選按鈕狀態
  updateToggleAllButtonState() {
    const searchBox = document.getElementById('search-box');
    const searchTerm = searchBox ? searchBox.value : '';
    const filtered = this.getFilteredCourses(searchTerm);
    const btns = Array.from(document.querySelectorAll('.toggle-all-btn'));
    
    if (filtered.length === 0) {
      btns.forEach(b => {
        b.textContent = '全部選取';
        b.disabled = true;
      });
      return;
    }
    
    btns.forEach(b => b.disabled = false);
    const allSelected = filtered.every(c => this.selectedCourses.has(c.id));
    btns.forEach(b => b.textContent = allSelected ? '全部取消' : '全部選取');
  }

  // 處理課程切換
  handleToggleCourse(courseId) {
    this.toggleCourse(courseId);
    this.renderCourseList();
    this.updateToggleAllButtonState();
    if (window.uiManager) {
      window.uiManager.updateTimetableCourses();
      window.uiManager.syncFocusStyles();
    }
  }

  // 處理全選切換
  handleToggleAll() {
    const searchBox = document.getElementById('search-box');
    const searchTerm = searchBox ? searchBox.value : '';
    const filtered = this.getFilteredCourses(searchTerm);
    this.toggleAll(filtered);
    this.renderCourseList();
    this.updateToggleAllButtonState();
    if (window.uiManager) {
      window.uiManager.updateTimetableCourses();
    }
  }

  // 處理左側卡片點擊
  handleListCardClick(courseId) {
    this.toggleFocus(courseId);
    if (window.uiManager) {
      window.uiManager.syncFocusStyles({ scroll: true });
    }
  }

  // 輔助函數：淡化顏色
  fadeColor(col, alpha) {
    if (!col) return `rgba(0,0,0,${alpha})`;
    
    const hslaMatch = col.match(/hsla?\(([^)]+)\)/);
    if (hslaMatch) {
      const parts = hslaMatch[1].split(',');
      if (parts.length >= 3) {
        const h = parts[0].trim();
        const s = parts[1].trim();
        const l = parts[2].trim();
        return `hsla(${h}, ${s}, ${l}, ${alpha})`;
      }
    }
    
    const rgbMatch = col.match(/rgba?\(([^)]+)\)/);
    if (rgbMatch) {
      const nums = rgbMatch[1].split(',').map(x => x.trim());
      const r = nums[0], g = nums[1] || 0, b = nums[2] || 0;
      return `rgba(${r},${g},${b},${alpha})`;
    }
    
    if (col.startsWith('#')) {
      let hex = col.slice(1);
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    
    return col;
  }

  // 初始化
  async init() {
    await this.loadCourses();
    this.renderCourseList();
    this.updateToggleAllButtonState();
    
    // 綁定搜尋框事件
    const searchBox = document.getElementById('search-box');
    if (searchBox) {
      searchBox.addEventListener('input', () => {
        this.renderCourseList();
        this.updateToggleAllButtonState();
        if (window.uiManager) {
          window.uiManager.syncFocusStyles();
        }
      });
    }
    
    // 綁定全選按鈕事件（課程列表頁）
    const toggleAllBtns = document.querySelectorAll('.toggle-all-btn');
    toggleAllBtns.forEach(btn => {
      btn.addEventListener('click', () => this.handleToggleAll());
    });
    
    // 綁定全部刪除按鈕事件（導入頁）
    const deleteAllBtn = document.getElementById('delete-all-btn');
    if (deleteAllBtn) {
      deleteAllBtn.addEventListener('click', () => this.removeAllCourses());
    }
  }
}

// UI 管理器 - 負責界面交互和課表渲染
class UIManager {
  constructor() {
    this.hourHeight = 0;
  }

  // 時間轉分鐘
  timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // 渲染課表
  renderTimetable() {
    const timetableContainer = document.getElementById('timetable');
    if (!timetableContainer) return;

    const days = ['Mo', 'Tu', 'We', 'Th', 'Fr'];
    const startHour = 8, endHour = 21;

    // 清空舊的 body 區塊（保留 6 個 header cell）
    while (timetableContainer.children.length > 6) {
      timetableContainer.lastChild.remove();
    }

    // 左側時間欄
    const timeCol = document.createElement('div');
    timeCol.className = 'time-label-col grid h-full';
    timeCol.style.gridTemplateRows = `repeat(${endHour - startHour + 1}, 1fr)`;
    
    for (let h = startHour; h <= endHour; h++) {
      const el = document.createElement('div');
      el.className = 'time-label flex justify-end pr-2';
      el.textContent = `${String(h).padStart(2, '0')}:00`;
      timeCol.appendChild(el);
    }
    timetableContainer.appendChild(timeCol);

    // 右側五天欄位
    days.forEach(d => {
      const col = document.createElement('div');
      col.className = 'day-col relative grid h-full';
      col.id = `day-col-${d}`;
      col.style.gridTemplateRows = `repeat(${endHour - startHour}, 1fr)`;
      
      for (let h = startHour; h < endHour; h++) {
        const slot = document.createElement('div');
        slot.className = 'timetable-slot';
        col.appendChild(slot);
      }
      
      timetableContainer.appendChild(col);
    });
  }

  // 更新課表佈局
  updateTimetableLayout() {
    const startHour = 8, endHour = 21;
    const numLines = endHour - startHour + 1;
    const numIntervals = endHour - startHour;

    const probe = document.getElementById('day-col-Mo') || document.querySelector('.day-col');
    if (!probe) return;
    
    const colH = probe.getBoundingClientRect().height;
    if (colH <= 0) return;

    this.hourHeight = colH / numIntervals;

    document.querySelectorAll('.day-col').forEach(col => {
      col.style.gridTemplateRows = `repeat(${numIntervals}, ${this.hourHeight}px)`;
    });
    
    const timeGrid = document.querySelector('.time-label-col');
    if (timeGrid) {
      timeGrid.style.gridTemplateRows = `repeat(${numLines - 1}, ${this.hourHeight}px) 0px`;
    }

    this.updateTimetableCourses();
  }

  // 更新課表中的課程區塊
  updateTimetableCourses() {
    if (!window.courseManager) return;

    document.querySelectorAll('.course-block').forEach(el => el.remove());
    
    if (!this.hourHeight) {
      this.updateTimetableLayout();
      if (!this.hourHeight) return;
    }

    const startHour = 8;
    const selected = Array.from(window.courseManager.selectedCourses)
      .map(id => window.courseManager.allCourses.find(c => c.id === id))
      .filter(Boolean);

    selected.forEach(course => {
      course.times.forEach(time => {
        const col = document.getElementById(`day-col-${time.day}`);
        if (!col) return;

        // 找出重疊的課程
        const overlaps = selected.filter(c => 
          c.times.some(t => 
            t.day === time.day && 
            Math.max(this.timeToMinutes(time.start), this.timeToMinutes(t.start)) < 
            Math.min(this.timeToMinutes(time.end), this.timeToMinutes(t.end))
          )
        ).sort((a, b) => a.id.localeCompare(b.id));

        const idx = overlaps.findIndex(c => c.id === course.id);
        const n = Math.max(1, overlaps.length);
        const width = 100 / n;
        const left = idx * width;

        const s = this.timeToMinutes(time.start);
        const e = this.timeToMinutes(time.end);
        const top = ((s / 60) - startHour) * this.hourHeight;
        const h = ((e - s) / 60) * this.hourHeight - 2;

        const block = document.createElement('div');
        block.className = 'course-block';
        block.dataset.courseId = course.id;
        block.style.background = course.color;
        block.style.top = top + 'px';
        block.style.height = Math.max(4, h) + 'px';
        block.style.left = left + '%';
        block.style.width = width + '%';
        block.innerHTML = `
          <p class="font-bold leading-tight truncate">${course.name}</p>
          <p class="text-xs leading-tight opacity-80">${course.code}</p>
        `;
        
        col.appendChild(block);
        this.makeDraggable(block, course.id);
        
        if (window.courseManager.focusedCourseId === course.id && 
            window.courseManager.selectedCourses.has(course.id)) {
          block.classList.add('is-focused');
        }
      });
    });

    this.syncFocusStyles();
  }

  // 使課程區塊可拖拽
  makeDraggable(block, courseId) {
    let startX = 0, startY = 0, moved = false, out = false, origin = null;
    
    function onDown(e) {
      e.preventDefault();
      origin = block.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      moved = false;
      out = false;
      block.classList.add('dragging');
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
    
    function onMove(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      block.style.transform = `translate(${dx}px, ${dy}px)`;
      
      const pad = 16;
      const cx = origin.left + origin.width / 2 + dx;
      const cy = origin.top + origin.height / 2 + dy;
      const inside = (cx >= origin.left - pad && cx <= origin.right + pad && 
                     cy >= origin.top - pad && cy <= origin.bottom + pad);
      
      if (!inside) {
        if (!out) {
          out = true;
          block.classList.add('drag-out');
          block.classList.remove('is-focused');
        }
      } else {
        if (out) {
          out = false;
          block.classList.remove('drag-out');
          if (window.courseManager.focusedCourseId === courseId) {
            block.classList.add('is-focused');
          }
        }
      }
    }
    
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      block.classList.remove('dragging');
      block.style.transform = '';
      
      if (!moved) {
        // 點擊事件
        window.uiManager.handleCalendarBlockClick(courseId);
        return;
      }
      
      if (out) {
        // 拖離原位 - 取消選取
        if (window.courseManager.selectedCourses.has(courseId)) {
          window.courseManager.handleToggleCourse(courseId);
        }
      } else {
        // 回到原位
        window.uiManager.syncFocusStyles();
      }
    }
    
    block.addEventListener('mousedown', onDown);
  }

  // 同步聚焦樣式
  syncFocusStyles({ scroll = false } = {}) {
    if (!window.courseManager) return;

    // 左側卡片樣式
    document.querySelectorAll('.course-card').forEach(el => 
      el.classList.remove('course-focus')
    );
    
    if (window.courseManager.focusedCourseId) {
      let card = document.getElementById(`course-card-${window.courseManager.focusedCourseId}`);
      if (!card) {
        // 如果被搜尋過濾掉，清除搜尋並重繪
        const searchBox = document.getElementById('search-box');
        if (searchBox) {
          searchBox.value = '';
          window.courseManager.renderCourseList();
          window.courseManager.updateToggleAllButtonState();
          card = document.getElementById(`course-card-${window.courseManager.focusedCourseId}`);
        }
      }
      if (card) {
        card.classList.add('course-focus');
        if (scroll) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
    
    // 右側區塊樣式
    document.querySelectorAll('.course-block').forEach(el => {
      if (window.courseManager.focusedCourseId && 
          el.dataset.courseId === window.courseManager.focusedCourseId && 
          window.courseManager.selectedCourses.has(window.courseManager.focusedCourseId)) {
        el.classList.add('is-focused');
      } else {
        el.classList.remove('is-focused');
      }
    });
  }

  // 處理課表區塊點擊
  handleCalendarBlockClick(courseId) {
    if (!window.courseManager) return;
    window.courseManager.toggleFocus(courseId);
    this.syncFocusStyles({ scroll: true });
  }

  // 初始化翻頁控制
  initPageController() {
    const leftPager = document.getElementById('left-pager');
    const toImportBtn = document.getElementById('to-import-btn');
    const backBtn = document.getElementById('back-to-list-btn');
    
    if (toImportBtn) {
      toImportBtn.addEventListener('click', () => {
        if (leftPager) leftPager.classList.add('is-import');
        // 重置導入頁面狀態
        if (window.ocrProcessor) {
          window.ocrProcessor.resetImportPage();
        }
      });
    }
    
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (leftPager) leftPager.classList.remove('is-import');
        // 重置導入頁面狀態
        if (window.ocrProcessor) {
          window.ocrProcessor.resetImportPage();
        }
      });
    }
  }

  // 初始化
  init() {
    this.renderTimetable();
    this.initPageController();
    
    setTimeout(() => {
      this.updateTimetableLayout();
      window.addEventListener('resize', () => {
        this.updateTimetableLayout();
        this.syncFocusStyles();
      });
    }, 100);
  }
}
