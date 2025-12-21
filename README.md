# PDF to PPTX Converter

NotebookLMで生成されたPDFスライドを編集可能なPowerPointファイル（PPTX）に変換するWebアプリケーション。

## 特徴

- 🔤 **インタラクティブ領域選択** - ドラッグでテキスト/画像領域を指定
- 🖼️ **画像抽出** - 選択領域を高解像度画像として保持
- 📝 **OCRテキスト認識** - Tesseract.jsで日本語/英語対応
- 🎨 **背景色抽出** - PDFの背景色をPPTXに反映

## 使い方

1. PDFをドラッグ&ドロップでアップロード
2. 「🔤テキスト」または「🖼️画像」モードを選択
3. ドラッグで領域を選択
4. 「PPTXを生成」をクリック
5. ダウンロード

## ローカルで実行

```bash
# リポジトリをクローン
git clone https://github.com/YOUR_USERNAME/pdf-pptx.git
cd pdf-pptx

# ローカルサーバーを起動
python -m http.server 8080

# ブラウザで開く
# http://localhost:8080
```

## 技術スタック

- **PDF.js** - PDF描画・解析
- **PptxGenJS** - PPTX生成
- **Tesseract.js** - OCR（日本語/英語）

## ライセンス

MIT
