# Easy Course Selection
![image](https://github.com/Raytengo/Easy-course-selection/blob/main/pic/demo.png)


## 簡單概要 
**Easy Course Selection** 是一個基於 **OCR 與前端展示** 的課程時間表管理工具。    
透過前端網頁界面 (`index.html`) 直觀地展示課表，方便查閱、篩選與管理。  
使用者可以上傳課程表(目前辨識系統只支援相對應的課程格式,詳情請見下方示範)，系統會經由 **文字辨識 (OCR)** 自動解析課程資訊，自動處理必要資訊並生成課程資料卡。    
  
  
總之就是因為學校的選課系統用的我很躁,要排課還得自己比較每一堂課的時間會不會衝堂  
所以用這個小東西可以超快決定好,至於排好課程但是選不到就不是我的問題了


## 內容  
-  **OCR 處理**：`ocr-processor.js` 負責將圖片轉成所需資料。   
-  **直觀前端界面**：`index.html` + `styles.css` + `ui-manager.js` 提供互動式 UI，讓使用者能查看課程卡片。  
-  **響應式設計**：簡潔的 UI 風格，至少作者看得很舒服。
-  **Json backup**: `course.json`是作為backup，如果無法使用對應的圖片輸入，使用指定的資料型態替換掉原本的json亦可運行。



##  使用  

### 1. 準備課程表  
將課程表 (PDF/截圖) 輸入到系統。  
<img src="https://github.com/Raytengo/Easy-course-selection/blob/main/pic/input_example.png" alt="image" width="400"/>

### 2. 左側可以滑動並添加欲選課程，右側可以拖動課程移除不需要的課程
已經是防呆介面了,這個還不會用請檢討自己是否適合讀大學

---

## Web Scraper

This project includes a web scraper to fetch course data directly from the university website.

### Setup

1.  **Install Python and Pip:** Make sure you have Python 3 and pip installed.
2.  **Install Dependencies:** Install the required Python libraries using pip:
    ```bash
    pip install playwright beautifulsoup4 lxml
    ```
3.  **Install Playwright Browsers:** Install the necessary browser binaries for Playwright:
    ```bash
    python -m playwright install --with-deps
    ```
4.  **Set Environment Variables:** You need to set your university account credentials as environment variables.
    ```bash
    export HKUST_USERNAME="your_username"
    export HKUST_PASSWORD="your_password"
    ```

### Running the Scraper

Once the setup is complete, you can run the scraper:
```bash
python scraper.py
```
The script will log in, scrape the course data for the AIAA subject, and update the `courses.json` file.

## 註解
如果輸入的圖片排版跟示範不同,可能會導致辨識有問題,導致卡片生成錯誤  
可以參考json檔案裡面的資料格式,先將你的課程丟給llm,生成相對應的資料格式並替換掉原本的json內容即可  
其實可以將ocr替換成llm,並讓他生成對應的資料,這會是比較通用且穩定的方法。但是我不想花api的錢

此外部分代碼為ai生成，如果發現代碼有問題那你是對的




