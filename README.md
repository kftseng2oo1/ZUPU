# 龍山派 曾氏族譜

家族族譜管理 App：歷代祖先名冊、靈骨塔位、世代樹狀圖、祭祀提醒與家族沿革。

**線上使用**：https://kftseng2oo1.github.io/ZUPU/

## 主要功能
- **👥 歷代祖先**：名冊與生平，可上傳照片、記錄配偶來源、生卒日期（支援農曆忌日換算）
- **🏛️ 靈骨安位**：多座塔位管理，記錄樓層、格位與編號
- **🌳 族譜樹狀**：世代傳承脈絡圖，可列印、存成圖片或分享
- **🔔 祭祀提醒**：忌日與傳統節日
- **家族沿革**：可編輯，也可從文件／PDF 匯入
- 資料匯入匯出：Excel、PDF、JSON 備份與還原

## 技術與依賴
- 單檔 HTML PWA（`index.html` 內含全部 HTML/CSS/JS），`manifest.json` + `sw.js` 提供安裝到主畫面與離線快取。
- 文件整理使用 Claude（直連 `api.anthropic.com`，需自備 API Key）
- 資料存在 localStorage：`ancestorApp_v28`

## 備註
- 這個 repo 是**公開**的，`index.html` 內含預設的祖先名冊與家族沿革。如果不希望家族資料公開，可以把 repo 改為私人（GitHub Pages 私人 repo 需付費方案），或把預設資料移出程式碼、改成只從備份匯入。
