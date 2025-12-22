/**
 * PPTX Generator Module
 * Creates PowerPoint presentations from user-selected regions
 * With background color extraction and improved text styling
 */

import { cropRegion, ocrRegion, getPageDimensions, getPageBackgroundColor } from './pdf-parser.js';

/**
 * Generate PPTX from user-selected regions
 * @param {File} file - PDF file
 * @param {Object} allRegions - Regions organized by page number
 * @param {number} pageCount - Total number of pages
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Blob>} PPTX file as Blob
 */
export async function generatePPTXFromRegions(file, allRegions, pageCount, onProgress = () => { }) {
    console.log('[PPTX] Starting generation from regions...');

    // Create presentation
    const pptx = new PptxGenJS();
    pptx.author = 'PDF to PPTX Converter';
    pptx.title = file.name.replace('.pdf', '');

    // Get first page dimensions for slide size
    const firstDims = await getPageDimensions(file, 1);
    const slideWidth = firstDims.width / 72; // PDF points to inches
    const slideHeight = firstDims.height / 72;

    pptx.defineLayout({
        name: 'PDF_LAYOUT',
        width: slideWidth,
        height: slideHeight
    });
    pptx.layout = 'PDF_LAYOUT';

    console.log(`[PPTX] Slide size: ${slideWidth.toFixed(2)}" x ${slideHeight.toFixed(2)}"`);

    // Count total regions for progress
    let totalRegions = 0;
    let processedRegions = 0;
    for (const pageNum in allRegions) {
        totalRegions += allRegions[pageNum].length;
    }

    // Process each page
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const pageRegions = allRegions[pageNum] || [];

        // Create slide for this page
        const slide = pptx.addSlide();

        // Get and set background color from PDF
        try {
            onProgress({
                percent: Math.round((processedRegions / Math.max(1, totalRegions)) * 90),
                message: `Page ${pageNum}: 背景色を取得中...`
            });

            const bgColor = await getPageBackgroundColor(file, pageNum);
            slide.background = { color: bgColor };
            console.log(`[PPTX] Page ${pageNum} background: #${bgColor}`);
        } catch (err) {
            console.warn(`[PPTX] Failed to get background color, using white`, err);
            slide.background = { color: 'FFFFFF' };
        }

        // Get page dimensions
        const dims = await getPageDimensions(file, pageNum);
        const pageSlideW = dims.width / 72;
        const pageSlideH = dims.height / 72;

        // Process each region
        for (const region of pageRegions) {
            processedRegions++;
            const percent = Math.round((processedRegions / totalRegions) * 90);

            onProgress({
                percent,
                message: `処理中: Page ${pageNum}, ${region.type === 'text' ? 'テキスト' : '画像'} #${region.number}...`
            });

            try {
                // Crop the region from PDF
                const cropped = await cropRegion(
                    file,
                    pageNum,
                    region,
                    region.canvasWidth,
                    region.canvasHeight
                );

                // Calculate position in inches
                const x = cropped.pdfBounds.x / 72;
                const y = cropped.pdfBounds.y / 72;
                const w = cropped.pdfBounds.width / 72;
                const h = cropped.pdfBounds.height / 72;

                console.log(`[PPTX] Adding ${region.type} #${region.number} at (${x.toFixed(2)}, ${y.toFixed(2)}) ${w.toFixed(2)}x${h.toFixed(2)}"`);

                if (region.type === 'image') {
                    // Add as image
                    slide.addImage({
                        data: cropped.imageData,
                        x: x,
                        y: y,
                        w: w,
                        h: h
                    });
                } else {
                    // OCR and add as text box with detected style
                    const ocrResult = await ocrRegion(cropped.imageData);

                    if (ocrResult.text) {
                        // Clean up OCR text
                        const cleanedText = normalizeOCRText(ocrResult.text);

                        // Estimate text color from OCR (dark text assumed for now)
                        const textColor = detectTextColor(cropped.imageData);

                        // Calculate font size based on region height and number of lines
                        const lines = cleanedText.split('\n').filter(l => l.trim());
                        const estimatedFontSize = Math.max(8, Math.min(48,
                            Math.round((h * 72) / Math.max(1, lines.length) * 0.7)
                        ));

                        slide.addText(cleanedText, {
                            x: x,
                            y: y,
                            w: w,
                            h: h,
                            fontSize: estimatedFontSize,
                            fontFace: 'Arial',
                            color: textColor,
                            valign: 'top',
                            wrap: true
                        });
                        console.log(`[PPTX] Added text (${estimatedFontSize}pt, #${textColor}): "${ocrResult.text.substring(0, 40)}..."`);
                    } else {
                        // Fallback to image if OCR fails
                        console.log('[PPTX] OCR failed, using image fallback');
                        slide.addImage({
                            data: cropped.imageData,
                            x: x,
                            y: y,
                            w: w,
                            h: h
                        });
                    }
                }
            } catch (err) {
                console.error(`[PPTX] Error processing region:`, err);
            }
        }

        // If no regions for this page, leave it blank
        if (pageRegions.length === 0) {
            console.log(`[PPTX] Page ${pageNum}: No regions, creating blank slide`);
        }
    }

    // Generate file
    onProgress({ percent: 95, message: 'PPTXファイルを生成中...' });
    const blob = await pptx.write({ outputType: 'blob' });

    console.log(`[PPTX] Generated: ${(blob.size / 1024).toFixed(1)} KB`);

    return blob;
}

/**
 * Detect dominant text color from an image
 * Returns hex color (without #)
 * @param {string} imageData - Base64 image data URL
 * @returns {string} Hex color code
 */
function detectTextColor(imageData) {
    // For now, return black as default
    // Future enhancement: analyze image histogram to find text color
    // Dark backgrounds would have light text, light backgrounds have dark text

    // Simple heuristic: check if image is overall dark or light
    // This is a placeholder - true color detection would require canvas analysis

    return '000000'; // Default to black
}

/**
 * Normalize OCR text by removing unwanted spaces and line breaks
 * @param {string} text - Raw OCR text
 * @returns {string} Cleaned text
 */
function normalizeOCRText(text) {
    if (!text) return '';

    let result = text;

    // Remove multiple spaces (but keep single spaces between English words)
    result = result.replace(/  +/g, ' ');

    // Remove spaces between Japanese characters (OCR often adds unwanted spaces)
    // Japanese character ranges: Hiragana, Katakana, CJK
    result = result.replace(/([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])\s+([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])/g, '$1$2');

    // Remove space after Japanese punctuation
    result = result.replace(/([。、！？）」』])\s+/g, '$1');

    // Remove space before Japanese punctuation
    result = result.replace(/\s+([。、！？（「『])/g, '$1');

    // Normalize line breaks - remove single line breaks within paragraphs
    // Keep double line breaks as paragraph separators
    result = result.replace(/([^\n])\n([^\n])/g, '$1 $2');

    // Remove multiple consecutive line breaks (keep max 2)
    result = result.replace(/\n{3,}/g, '\n\n');

    // Trim each line
    result = result.split('\n').map(line => line.trim()).join('\n');

    // Remove leading/trailing whitespace
    result = result.trim();

    console.log('[PPTX] Text normalized:', result.substring(0, 50) + '...');

    return result;
}
