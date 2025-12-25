"""
Ollama Proxy Server
Provides CORS-enabled API endpoint for browser-based Ollama calls
Uses LLaVA for vision-language text extraction from images
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import base64
import re

app = Flask(__name__)
CORS(app)

OLLAMA_URL = "http://localhost:11434/api/generate"

@app.route('/api/extract-text', methods=['POST'])
def extract_text():
    """
    Extract text from an image using LLaVA
    Expects: { "image": "base64_image_data" }
    Returns: { "text": "extracted text", "lines": [...] }
    """
    try:
        data = request.json
        image_data = data.get('image', '')
        
        # Remove data URL prefix if present
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        # Prompt for text extraction
        prompt = """この画像に含まれるテキストを全て抽出してください。
以下のルールに従ってください：
- 元のレイアウトを維持し、改行も保持する
- 日本語と英語の両方を正確に読み取る
- 余計な説明は不要、テキストのみを出力する
- 見出し、本文、箇条書きなどの階層構造を維持する"""

        # Call Ollama API
        response = requests.post(OLLAMA_URL, json={
            "model": "llava",
            "prompt": prompt,
            "images": [image_data],
            "stream": False
        }, timeout=60)
        
        if response.status_code != 200:
            return jsonify({"error": f"Ollama error: {response.status_code}"}), 500
        
        result = response.json()
        extracted_text = result.get('response', '')
        
        # Parse into lines with estimated positions
        lines = []
        raw_lines = extracted_text.split('\n')
        for i, line_text in enumerate(raw_lines):
            if line_text.strip():
                lines.append({
                    "text": line_text.strip(),
                    "index": i,
                    "conf": 95.0  # VLM confidence is generally high
                })
        
        return jsonify({
            "text": extracted_text.strip(),
            "lines": lines,
            "avgConf": 95.0,
            "model": "llava"
        })
        
    except requests.exceptions.Timeout:
        return jsonify({"error": "Ollama timeout"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health():
    """Check if Ollama is available"""
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=5)
        if response.status_code == 200:
            models = [m['name'] for m in response.json().get('models', [])]
            return jsonify({"status": "ok", "models": models})
    except:
        pass
    return jsonify({"status": "error", "message": "Ollama not available"}), 503

if __name__ == '__main__':
    print("=" * 50)
    print("Ollama Proxy Server")
    print("=" * 50)
    print("Starting server on http://localhost:5000")
    print("Make sure Ollama is running (ollama serve)")
    print("=" * 50)
    app.run(host='0.0.0.0', port=5000, debug=True)
