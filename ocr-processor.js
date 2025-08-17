// OCR 處理器 - 2025-08-16 修正版：強化 Section 偵測、正規化與安全附掛時段
class OCRProcessor {
  constructor() {
    this.isProcessing = false;
    
    // 全域課程顏色管理
    this.courseColors = {};
    this.colorIndex = 0;
    
    // 預定義的優質調色盤，精心挑選確保視覺區分度最大
    this.colorPalette = [
      0,    // 紅色
      100,   // 黃綠色
      210,  // 天藍色
      45,   // 橙色      
      300,  // 紫色
      15,   // 朱紅色
      165,  // 翠綠色
      235,  // 深藍色
      75,   // 黃色
      190,  // 淺藍色
      275,  // 深紫色
      345,  // 玫瑰色
    ];
  }

  // 改進的顏色生成函數：按順序分配顏色，確保每個課程都不同
  getColorForCourse(courseId) {
    if (!this.courseColors[courseId]) {
      // 按順序分配顏色，確保每個課程都不同
      const selectedHue = this.colorPalette[this.colorIndex % this.colorPalette.length];
      this.colorIndex++; // 下一個課程使用下一個顏色
      
      this.courseColors[courseId] = `hsla(${selectedHue}, 70%, 85%, 0.85)`;
    }
    return this.courseColors[courseId];
  }

  // --- 小工具：把 OCR 可能的誤讀正規化 ---
  normalizeSectionCode(rawToken) {
    // 例： "L O2" / "LO2" / "L0I" / "LA 01" → "L02" / "L01" / "LA01"
    // 新增： "T O1" / "TO1" / "T0I" → "T01"
    // 新增： "R O1" / "RO1" / "R0I" → "R01"
    if (!rawToken) return "";
    let s = String(rawToken).toUpperCase().replace(/\s+/g, "");
    const m = s.match(/^([LTR])(A)?([0-9OI]{1,3})$/);
    if (!m) return s;
    const prefix = m[1]; // L, T, 或 R
    const hasA = !!m[2];
    let digits = (m[3] || "")
      .replace(/O/g, "0")  // O -> 0
      .replace(/I/g, "1"); // I -> 1
    
    // 確保數字至少兩位數 (01, 02, ... 09, 10, ...)
    if (digits.length === 1) {
      digits = "0" + digits;
    }
    
    return prefix + (hasA ? "A" : "") + digits;
  }

  // 展開天數縮寫 - 動態解析任何組合
  expandDays(dayStr) {
    if (!dayStr) return [];
    
    // 標準天數映射
    const dayAbbreviations = {
      'Mo': 'Mo', 'Monday': 'Mo',
      'Tu': 'Tu', 'Tuesday': 'Tu', 'Tue': 'Tu',
      'We': 'We', 'Wednesday': 'We', 'Wed': 'We',
      'Th': 'Th', 'Thursday': 'Th', 'Thu': 'Th',
      'Fr': 'Fr', 'Friday': 'Fr', 'Fri': 'Fr',
      'Sa': 'Sa', 'Saturday': 'Sa', 'Sat': 'Sa',
      'Su': 'Su', 'Sunday': 'Su', 'Sun': 'Su'
    };
    
    // 常見組合的快速映射（優化性能）
    const commonCombinations = {
      'MoTu': ['Mo', 'Tu'],
      'MoWe': ['Mo', 'We'],
      'MoTh': ['Mo', 'Th'],
      'MoFr': ['Mo', 'Fr'],
      'TuWe': ['Tu', 'We'],
      'TuTh': ['Tu', 'Th'],
      'TuFr': ['Tu', 'Fr'],
      'WeTh': ['We', 'Th'],
      'WeFr': ['We', 'Fr'],
      'ThFr': ['Th', 'Fr'],
    };
    
    const normalizedInput = dayStr.trim();
    
    // 先檢查是否為常見組合
    if (commonCombinations[normalizedInput]) {
      return commonCombinations[normalizedInput];
    }
    
    // 檢查是否為單個天數
    if (dayAbbreviations[normalizedInput]) {
      return [dayAbbreviations[normalizedInput]];
    }
    
    // 動態解析：嘗試拆分連續的天數縮寫
    const result = [];
    let remaining = normalizedInput;
    
    // 按優先級排序的天數模式（長的先匹配）
    const patterns = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
                     'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
                     'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    
    while (remaining.length > 0) {
      let matched = false;
      
      for (const pattern of patterns) {
        if (remaining.startsWith(pattern)) {
          const standardDay = dayAbbreviations[pattern];
          if (standardDay && !result.includes(standardDay)) {
            result.push(standardDay);
          }
          remaining = remaining.substring(pattern.length);
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        // 如果無法匹配，嘗試單個字符匹配或跳過
        const char = remaining.charAt(0);
        remaining = remaining.substring(1);
        
        // 可能是分隔符，繼續處理
        if (!/[A-Za-z]/.test(char)) {
          continue;
        }
        
        console.warn(`無法解析天數字符: "${char}" 在 "${dayStr}" 中`);
      }
    }
    
    // 如果完全無法解析，返回原始字符串作為單個元素
    if (result.length === 0) {
      console.warn(`無法解析天數組合: "${dayStr}"，使用原始值`);
      return [normalizedInput];
    }
    
    console.log(`天數解析: "${dayStr}" -> [${result.join(', ')}]`);
    return result;
  }

  // 解析 OCR 文字為課程資料
  parseOcrToCoursesSimple(raw) {
    let text = (raw || "").replace(/\r/g, "").replace(/[|]/g, " ").trim();
    if (!text) return [];

    const to24 = (t) => {
      const m = t.match(/([0-9]{1,2}):([0-9]{2})(?:\s*(AM|PM))?/i);
      if (!m) return null;
      let h = parseInt(m[1], 10);
      const mm = m[2];
      const ap = (m[3] || "").trim().toUpperCase();
      if (ap === "PM" && h !== 12) h += 12;
      if (ap === "AM" && h === 12) h = 0;
      return (h < 10 ? "0" : "") + h + ":" + mm;
    };

    const lines = text
      .split(/\n+/)
      .map((l) => l.trim().replace(/\s+/g, " "))
      .filter(Boolean);

    const out = [];
    const sectionMap = new Map();

    let currentCourseId = null;
    let currentCourseName = "";
    let lastSectionKey = null; // 只有在偵測到 section 後才會更新

    const isHeaderNoise = (s) =>
      /View All Sections|Meeting Dates|Session\b|Status\b|First\b|Last\b/i.test(
        s
      );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // --- 課程標題：如 AIAA 3225 - Learning and Optimization ... ---
      const courseTitleMatch = line.match(
        /([A-Z]{3,6}\s*[0-9]{3,5})\s*[-–]\s*(.+)/i
      );
      if (courseTitleMatch && !isHeaderNoise(line)) {
        currentCourseId = courseTitleMatch[1].replace(/\s+/g, "");
        currentCourseName = courseTitleMatch[2].trim();
        lastSectionKey = null; // 進入新課程，清空上一次 section
        continue;
      }

      if (!currentCourseId) continue;

      // --- Section 偵測：支持 L/T/R 開頭，數字範圍 01-99，允許 O/I 代替 0/1 ---
      let sectionMatch =
        line.match(
          /Section\s+((?:[LTR]\s*A?)\s*[0-9OI]{1,3})[-\s]*(LEC|LAB|TUT|TUTORIAL|IND|INDEPENDENT)(?:\([0-9]+\))?/i
        ) ||
        line.match(
          /\b((?:[LTR]\s*A?)\s*[0-9OI]{1,3})[-\s]*(LEC|LAB|TUT|TUTORIAL|IND|INDEPENDENT)(?:\([0-9]+\))?\b/i
        );

      if (sectionMatch) {
        const rawSec = sectionMatch[1].replace(/\s+/g, "");
        const sectionType = sectionMatch[2].toUpperCase();
        const sectionNumber = this.normalizeSectionCode(rawSec); // 正規化

        const sectionKey = `${currentCourseId}-${sectionNumber}-${sectionType}`;
        lastSectionKey = sectionKey;

        // 抓取這個 section 的細節
        const details = this.extractDetailsFromLines(lines, i, to24);

        if (sectionMap.has(sectionKey)) {
          // 合併防重複
          const existing = sectionMap.get(sectionKey);
          details.times.forEach((t) => {
            if (
              !existing.times.some(
                (e) => e.day === t.day && e.start === t.start && e.end === t.end
              )
            ) {
              existing.times.push(t);
            }
          });
          if (existing.instructor === "TBA" && details.instructor !== "TBA") {
            existing.instructor = details.instructor;
          }
          if (existing.room === "TBA" && details.room !== "TBA") {
            existing.room = details.room;
          }
        } else {
          sectionMap.set(sectionKey, {
            courseId: currentCourseId,
            courseName: currentCourseName,
            sectionNumber,
            sectionType,
            times: details.times,
            instructor: details.instructor,
            room: details.room,
          });
        }
        continue;
      }

      // --- 備援：時間列（僅在有上一個 section 時才附掛） ---
      const direct = line.match(
        /(Mo|Tu|We|Th|Fr|Sa|Su|MoWe|TuTh|MoWeFr)\s+([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM))\s*[-–]\s*([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM))/i
      );
      if (direct && lastSectionKey && sectionMap.has(lastSectionKey)) {
        const days = this.expandDays(direct[1]);
        const start = to24(direct[2]);
        const end = to24(direct[3]);
        if (start && end) {
          const target = sectionMap.get(lastSectionKey);
          days.forEach((day) => {
            if (
              !target.times.some(
                (e) => e.day === day && e.start === start && e.end === end
              )
            ) {
              target.times.push({ day, start, end });
            }
          });
        }
      }
    }

    // 輸出：每個 section 一張卡
    sectionMap.forEach((s) => {
      const id = `${s.courseId}-${s.sectionNumber}-${s.sectionType}`;
      out.push({
        id,
        courseId: s.courseId,
        code: s.courseId,
        name: s.courseName,
        section: `${s.sectionNumber}-${s.sectionType}`,
        sectionType: s.sectionType,
        instructor: s.instructor,
        room: s.room,
        times: s.times,
        color: this.getColorForCourse(s.courseId),
      });
    });

    return out;
  }

  extractDetailsFromLines(lines, startIndex, to24) {
    const result = { times: [], instructor: "TBA", room: "TBA" };

    console.log('=== 開始提取詳細信息 ===');
    console.log('起始行:', startIndex, '總行數:', lines.length);

    // 往下掃幾行（同一個 box 內）
    for (let i = startIndex; i < Math.min(lines.length, startIndex + 14); i++) {
      const line = lines[i];
      console.log(`檢查第${i}行:`, line);

      // 碰到下一個課程或下一個 Section 就停止（不要因 Status 提前中斷）
      if (
        i > startIndex &&
        (/[A-Z]{3,6}\s*[0-9]{3,5}\s*[-–]/i.test(line) ||
          /Section\s+(?:[LTR]\s*A?)\s*[0-9OI]{1,3}/i.test(line))
      ) {
        console.log('遇到新課程或section，停止解析');
        break;
      }

      // 完整時間解析 - 同一行包含完整時間信息
      const timeRe = /(Mo|Tu|We|Th|Fr|Sa|Su|MoWe|TuTh|MoWeFr)\s+([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM))\s*[-–]\s*([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM))/gi;
      for (const m of line.matchAll(timeRe)) {
        const days = this.expandDays(m[1]);
        const start = to24(m[2]);
        const end = to24(m[3]);
        if (start && end) {
          days.forEach((d) => result.times.push({ day: d, start, end }));
          console.log('✓ 找到完整時間:', m[1], start, '-', end);
        }
      }
      
      // 跨行時間解析 - 多種可能的格式
      // 格式1: "TuTh 10:30AM -" (行尾有破折號)
      const partialTimeMatch1 = line.match(/(Mo|Tu|We|Th|Fr|Sa|Su|MoWe|TuTh|MoWeFr)\s+([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM))\s*[-–]\s*$/i);
      if (partialTimeMatch1 && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        console.log('找到跨行時間格式1，下一行:', nextLine);
        const endTimeMatch = nextLine.match(/^\s*([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM))/i);
        if (endTimeMatch) {
          const days = this.expandDays(partialTimeMatch1[1]);
          const start = to24(partialTimeMatch1[2]);
          const end = to24(endTimeMatch[1]);
          if (start && end) {
            days.forEach((d) => result.times.push({ day: d, start, end }));
            console.log('✓ 找到跨行時間格式1:', partialTimeMatch1[1], start, '-', end);
          }
        }
      }
      
      // 格式2: "TuTh 10:30AM" (沒有破折號)
      const partialTimeMatch2 = line.match(/(Mo|Tu|We|Th|Fr|Sa|Su|MoWe|TuTh|MoWeFr)\s+([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM))\s*$/i);
      if (partialTimeMatch2 && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        console.log('找到跨行時間格式2，下一行:', nextLine);
        // 下一行可能是 "11:50AM" 或 "- 11:50AM"
        const endTimeMatch = nextLine.match(/^\s*[-–]?\s*([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM))/i);
        if (endTimeMatch) {
          const days = this.expandDays(partialTimeMatch2[1]);
          const start = to24(partialTimeMatch2[2]);
          const end = to24(endTimeMatch[1]);
          if (start && end) {
            days.forEach((d) => result.times.push({ day: d, start, end }));
            console.log('✓ 找到跨行時間格式2:', partialTimeMatch2[1], start, '-', end);
          }
        }
      }
      
      // 格式3: 處理可能的特殊字符和空格
      const flexibleTimeMatch = line.match(/(Mo|Tu|We|Th|Fr|Sa|Su|MoWe|TuTh|MoWeFr)\s+([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM))/i);
      if (flexibleTimeMatch && i + 1 < lines.length && !result.times.length) {
        const nextLine = lines[i + 1];
        console.log('找到靈活時間格式，下一行:', nextLine);
        // 查找下一行的任何時間格式
        const nextTimeMatch = nextLine.match(/([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM))/i);
        if (nextTimeMatch) {
          const days = this.expandDays(flexibleTimeMatch[1]);
          const start = to24(flexibleTimeMatch[2]);
          const end = to24(nextTimeMatch[1]);
          if (start && end) {
            days.forEach((d) => result.times.push({ day: d, start, end }));
            console.log('✓ 找到靈活跨行時間:', flexibleTimeMatch[1], start, '-', end);
          }
        }
      }

      // 教室
      const roomMatch =
        line.match(/Rm\s+([0-9]+),?\s*([A-Z][0-9]*)/i) ||
        line.match(/Room\s+([0-9]+)/i);
      if (roomMatch && result.room === "TBA") {
        result.room =
          roomMatch.length >= 3
            ? `Rm ${roomMatch[1]}, ${roomMatch[2]}`
            : roomMatch[0];
      }

      // 講師（允許多位，跨行聚合）
      const instr = [];
      const mm = line.match(
        /([A-Z]{2,}[A-Za-z]*),\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g
      );
      if (mm) mm.forEach((x) => instr.push(x));
      if (instr.length) {
        result.instructor =
          result.instructor === "TBA"
            ? instr.join("; ")
            : `${result.instructor}; ${instr.join("; ")}`;
      }
    }
    return result;
  }

  // ===== 以下為 UI / 流程（含預覽縮圖） =====

  showImagesPreview(files) {
    const previewContainer = document.getElementById("image-preview");
    if (!previewContainer) return;

    if (!files || files.length === 0) {
      previewContainer.innerHTML = "";
      previewContainer.className = "";
      return;
    }

    previewContainer.innerHTML = "";
    previewContainer.className = "flex gap-4 overflow-x-auto px-1 mt-1 items-start";
    previewContainer.style.cssText = `
      min-height: 122px;
      padding-top: 2px;
      overflow-y: visible;
      scrollbar-width: thin;
      scrollbar-color: rgba(148,163,184,0.6) transparent;
    `;
    
    const style = document.createElement("style");
    style.textContent = `
  #image-preview::-webkit-scrollbar { height: 5px; }
      #image-preview::-webkit-scrollbar-track { background: rgba(255,255,255,0.1); border-radius: 3px; }
      #image-preview::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.6); border-radius: 3px; }
      #image-preview::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.8); }
      
      .image-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        backdrop-filter: blur(4px);
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      
      .image-modal.show {
        opacity: 1;
      }
      
      .image-modal img {
        max-width: 90%;
        max-height: 90%;
        object-fit: contain;
        border-radius: 12px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      }
      
      .image-modal .close-btn {
        position: absolute;
        top: 20px;
        right: 20px;
        width: 40px;
        height: 40px;
        background: rgba(255, 255, 255, 0.9);
        border: none;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 24px;
        color: #333;
        transition: all 0.2s ease;
      }
      
      .image-modal .close-btn:hover {
        background: rgba(255, 255, 255, 1);
        transform: scale(1.1);
      }
    `;
    if (!document.querySelector("#preview-scrollbar-style")) {
      style.id = "preview-scrollbar-style";
      document.head.appendChild(style);
    }

    Array.from(files).forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const imgContainer = document.createElement("div");
        imgContainer.className = "relative flex-shrink-0 group cursor-pointer";
  imgContainer.style.width = "96px";
  imgContainer.style.height = "96px";

        const img = document.createElement("img");
        img.src = e.target.result;
        img.alt = `上傳的圖片 ${index + 1}`;
        img.className = "w-full h-full object-cover rounded-xl border-2 border-white/50 shadow-lg group-hover:border-blue-300 transition-all duration-200";
        
        // 添加點擊放大功能
        img.onclick = (event) => {
          event.stopPropagation();
          this.showImageModal(e.target.result, file.name);
        };

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "absolute top-1 right-1 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-lg transition-all duration-200 opacity-90 group-hover:opacity-100 hover:scale-110 z-10";
        deleteBtn.innerHTML = "×";
        deleteBtn.title = "刪除此圖片";
        deleteBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.removeImagePreview(index);
        };

        const overlay = document.createElement("div");
        overlay.className = "absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-xl transition-all duration-200 pointer-events-none";
        
        // 添加放大鏡圖標提示
        const zoomIcon = document.createElement("div");
        zoomIcon.className = "absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none";
        zoomIcon.innerHTML = `
          <div class="w-6 h-6 bg-white/90 rounded-full flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-700">
              <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
            </svg>
          </div>
        `;
        
        imgContainer.appendChild(img);
        imgContainer.appendChild(deleteBtn);
        imgContainer.appendChild(overlay);
        imgContainer.appendChild(zoomIcon);
        previewContainer.appendChild(imgContainer);
      }.bind(this);
      reader.readAsDataURL(file);
    });
  }

  // 新增：顯示圖片放大模態框
  showImageModal(imageSrc, fileName) {
    // 移除已存在的模態框
    const existingModal = document.querySelector('.image-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.onclick = () => this.closeImageModal(modal);

    const img = document.createElement('img');
    img.src = imageSrc;
    img.alt = fileName;
    img.onclick = (e) => e.stopPropagation(); // 防止點擊圖片關閉模態框

    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.onclick = () => this.closeImageModal(modal);

    modal.appendChild(img);
    modal.appendChild(closeBtn);
    document.body.appendChild(modal);

    // 觸發顯示動畫
    setTimeout(() => modal.classList.add('show'), 10);

    // 添加鍵盤事件
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        this.closeImageModal(modal);
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
  }

  // 新增：關閉圖片放大模態框
  closeImageModal(modal) {
    modal.classList.remove('show');
    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    }, 300);
  }

  removeImagePreview(indexToRemove) {
    const fileInput = document.getElementById("import-image");
    if (!fileInput || !fileInput.files) return;

    const dt = new DataTransfer();
    Array.from(fileInput.files).forEach((file, index) => {
      if (index !== indexToRemove) dt.items.add(file);
    });

    fileInput.files = dt.files;
    this.showImagesPreview(fileInput.files);
    this.updateImportButtonState();
  }

  // 新增：重置導入頁面狀態
  resetImportPage() {
    // 清除文件輸入
    const fileInput = document.getElementById("import-image");
    if (fileInput) {
      fileInput.value = "";
    }
    
    // 清除圖片預覽
    const imagePreview = document.getElementById("image-preview");
    if (imagePreview) {
      imagePreview.innerHTML = "";
      imagePreview.className = "";
    }
    
    // 清除 OCR 狀態
    const ocrStatus = document.getElementById("ocr-status");
    if (ocrStatus) {
      ocrStatus.textContent = "";
      ocrStatus.style.display = "none";
    }
    
    // 重置按鈕狀態
    this.updateImportButtonState();
    
    // 關閉任何打開的圖片模態框
    const existingModal = document.querySelector('.image-modal');
    if (existingModal) {
      this.closeImageModal(existingModal);
    }
  }

  updateImportButtonState() {
    const btn = document.getElementById("import-btn");
    const files = document.getElementById("import-image")?.files;
    const btnText = btn?.querySelector('span');

    if (btn) {
      if (files && files.length > 0) {
        btn.disabled = false;
        if (btnText) {
          btnText.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
              <path fill-rule="evenodd" d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813A3.75 3.75 0 0 0 7.466 7.89l.813-2.846A.75.75 0 0 1 9 4.5ZM18 1.5a.75.75 0 0 1 .728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 0 1 0 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 0 1-1.456 0l-.258-1.036a2.625 2.625 0 0 0-1.91-1.91l-1.036-.258a.75.75 0 0 1 0-1.456l1.036-.258a2.625 2.625 0 0 0 1.91-1.91l.258-1.036A.75.75 0 0 1 18 1.5ZM16.5 15a.75.75 0 0 1 .712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 0 1 0 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 0 1-1.422 0l-.395-1.183a1.5 1.5 0 0 0-.948-.948l-1.183-.395a.75.75 0 0 1 0-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0 1 16.5 15Z" clip-rule="evenodd" />
            </svg>
            上傳 (${files.length} 張圖片)
          `;
        }
      } else {
        btn.disabled = true;
        if (btnText) {
          btnText.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 opacity-50">
              <path fill-rule="evenodd" d="M10.5 3.75a6 6 0 0 0-5.98 6.496A5.25 5.25 0 0 0 6.75 20.25H18a4.5 4.5 0 0 0 2.206-8.423 3.75 3.75 0 0 0-4.133-4.748A6.001 6.001 0 0 0 10.5 3.75Zm2.25 6a.75.75 0 0 0-1.5 0v4.94l-1.72-1.72a.75.75 0 0 0-1.06 1.06l3 3a.75.75 0 0 0 1.06 0l3-3a.75.75 0 1 0-1.06-1.06l-1.72 1.72V9.75Z" clip-rule="evenodd" />
            </svg>
            請先選擇圖片
          `;
        }
      }
    }
  }

  handleFileSelect(event) {
    const files = event.target.files;
    
    // 清除之前的 OCR 狀態提示
    const statusEl = document.getElementById("ocr-status");
    if (statusEl) {
      statusEl.textContent = "";
      statusEl.style.display = "none";
    }
    
    if (files && files.length > 0) {
      this.showImagesPreview(files);
      this.updateImportButtonState();
    } else {
      const previewContainer = document.getElementById("image-preview");
      if (previewContainer) previewContainer.innerHTML = "";
      this.updateImportButtonState();
    }
  }

  async handleImportSubmit() {
    const btn = document.getElementById("import-btn");
    const statusEl = document.getElementById("ocr-status");
    const files = document.getElementById("import-image")?.files;

    if (!files || files.length === 0) {
      alert("請先選擇圖片檔案");
      return;
    }
    if (!window.Tesseract) {
      alert("OCR 功能尚未載入，請重新整理頁面後再試");
      return;
    }
    if (this.isProcessing) {
      alert("正在處理中，請稍候...");
      return;
    }

    try {
      this.isProcessing = true;
      btn.disabled = true;
      
      // 更新按鈕顯示處理狀態，但保持可見
      const btnSpan = btn.querySelector('span');
      if (btnSpan) {
        btnSpan.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 animate-spin">
            <path fill-rule="evenodd" d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 100 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H2.984a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z" clip-rule="evenodd" />
          </svg>
          處理中...
        `;
      }

      let allParsedCourses = [];
      let processedCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // 更新按鈕文字顯示當前處理進度        
        if (statusEl) {
          statusEl.style.display = "none"; // 隱藏狀態顯示，因為現在顯示在按鈕上
        }
        
        try {
          const {
            data: { text },
          } = await Tesseract.recognize(file, "eng", {
            logger: (m) => {
              if (m.status === "recognizing text" && btnSpan) {
                // 計算總體進度：之前完成的圖片 + 當前圖片的進度
                const completedImages = i; // 已完成的圖片數量
                const currentImageProgress = m.progress; // 當前圖片的進度 (0-1)
                const totalProgress = (completedImages + currentImageProgress) / files.length;
                const overallPercentage = Math.round(totalProgress * 100);
                
                // 在按鈕上顯示總體 OCR 進度
                btnSpan.innerHTML = `
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 animate-spin">
                    <path fill-rule="evenodd" d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 100 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H2.984a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z" clip-rule="evenodd" />
                  </svg>
                  處理中 ${overallPercentage}%
                `;
              }
            },
          });
          if (text && text.trim()) {
            const parsed = this.parseOcrToCoursesSimple(text);
            allParsedCourses.push(...parsed);
            processedCount++;
          }
        } catch (ocrError) {
          console.error(`處理第 ${i + 1} 張圖片時發生錯誤:`, ocrError);
          if (btnSpan) {
            btnSpan.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                <path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 9a.75.75 0 0 0-1.5 0v2.25H9a.75.75 0 0 0 0 1.5h2.25V15a.75.75 0 0 0 1.5 0v-2.25H15a.75.75 0 0 0 0-1.5h-2.25V9Z" clip-rule="evenodd" />
              </svg>
              第 ${i + 1} 張失敗，繼續...
            `;
          }
        }
      }

      if (allParsedCourses.length === 0) {
        alert(
          `已處理 ${processedCount}/${files.length} 張圖片，但未能解析到任何課程。請確認圖片內容包含課程資訊。`
        );
        return;
      }

      const addedCount = await this.updateCoursesData(allParsedCourses);

      if (window.courseManager) {
        window.courseManager.renderCourseList();
        window.courseManager.updateToggleAllButtonState();
      }
      if (window.uiManager) {
        window.uiManager.updateTimetableCourses();
      }

      // 顯示上傳成功狀態
      if (btnSpan) {
        btnSpan.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
            <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clip-rule="evenodd" />
          </svg>
          上傳成功
        `;
      }

      // 等待2秒顯示成功狀態，然後開始清理
      setTimeout(() => {
        const leftPager = document.getElementById("left-pager");
        if (leftPager) leftPager.classList.remove("is-import");
        
        // 清空文件輸入框和預覽
        const fileInput = document.getElementById("import-image");
        const previewContainer = document.getElementById("image-preview");
        if (fileInput) fileInput.value = "";
        if (previewContainer) previewContainer.innerHTML = "";
        
        // 清除 OCR 狀態提示
        const statusEl = document.getElementById("ocr-status");
        if (statusEl) {
          statusEl.textContent = "";
          statusEl.style.display = "none";
        }
        
        this.updateImportButtonState();
      }, 1000); // 延長到2秒讓用戶看到成功狀態
    } catch (err) {
      console.error("OCR 處理失敗:", err);
      alert("OCR 處理過程中發生錯誤：" + (err?.message || err));
      if (statusEl) {
        statusEl.style.display = "block";
        statusEl.textContent = "處理失敗";
      }
    } finally {
      this.isProcessing = false;
      btn.disabled = false;
    }
  }

  async updateCoursesData(newCourses) {
    try {
      let addedCount = 0;
      if (window.courseManager) {
        newCourses.forEach((course) => {
          const success = window.courseManager.addCourse(course);
          if (success) addedCount++;
        });
      }
      return addedCount;
    } catch (error) {
      console.error("更新課程資料失敗:", error);
      return 0;
    }
  }

  init() {
    const fileInput = document.getElementById("import-image");
    if (fileInput) {
      fileInput.addEventListener("change", (event) => this.handleFileSelect(event));
      this.updateImportButtonState();
    }
    window.handleImportSubmit = () => this.handleImportSubmit();
  }
}

// 建立全域實例
window.ocrProcessor = new OCRProcessor();
