#!/bin/bash
# Test Pollinations keyless text API viability for ECHO's AI fallback
echo "=== [1] Model list ==="
curl -s -m 20 "https://text.pollinations.ai/models" | head -c 1500
echo ""
echo ""
echo "=== [2] Classic GET endpoint (plain prompt) ==="
time curl -s -m 45 "https://text.pollinations.ai/$(python3 -c "import urllib.parse; print(urllib.parse.quote('Reply with one short sentence: what is the movie Parasite (2019) about?'))")" | head -c 400
echo ""
echo ""
echo "=== [3] POST /openai with system+user (our real shape, Arabic) ==="
time curl -s -m 45 -X POST "https://text.pollinations.ai/openai" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [
      {"role": "system", "content": "You are ECHO, an entertainment companion. Reply in clear Arabic with a warm Egyptian-friendly voice. Max 40 words, no markdown."},
      {"role": "user", "content": "رشحني فيلم كوري زي Parasite"}
    ]
  }' | head -c 900
echo ""
