#!/bin/bash
# Local test script for scheduling flow
# Prerequisites: Server running (npm run dev), 3 users with phones in DB

BASE_URL="${BASE_URL:-http://localhost:3000}"

# Replace with your actual user IDs (from seed or API)
HOST_USER_ID="${HOST_USER_ID}"
CANDIDATE_1_ID="${CANDIDATE_1_ID}"
CANDIDATE_2_ID="${CANDIDATE_2_ID}"

if [ -z "$HOST_USER_ID" ] || [ -z "$CANDIDATE_1_ID" ] || [ -z "$CANDIDATE_2_ID" ]; then
  echo "Usage: HOST_USER_ID=xxx CANDIDATE_1_ID=yyy CANDIDATE_2_ID=zzz $0"
  echo "Or: export HOST_USER_ID CANDIDATE_1_ID CANDIDATE_2_ID first"
  exit 1
fi

echo "1. Creating scheduling request..."
RESP=$(curl -s -X POST "$BASE_URL/scheduling" \
  -H "Content-Type: application/json" \
  -d "{
    \"hostUserId\": \"$HOST_USER_ID\",
    \"sportType\": \"tennis\",
    \"format\": \"singles\",
    \"matchType\": \"competitive\",
    \"date\": \"2026-03-12\",
    \"startTime\": \"2026-03-12T18:00:00.000Z\",
    \"endTime\": \"2026-03-12T19:30:00.000Z\",
    \"locationText\": \"Barcelona Club\",
    \"radiusKm\": 10,
    \"responseWindowMinutes\": 60,
    \"candidateUserIds\": [\"$CANDIDATE_1_ID\", \"$CANDIDATE_2_ID\"]
  }")
REQUEST_ID=$(echo "$RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$REQUEST_ID" ]; then
  echo "Failed to create request. Response: $RESP"
  exit 1
fi
echo "   Request ID: $REQUEST_ID"

echo ""
echo "2. Starting scheduling (sends first WhatsApp to candidate 1)..."
curl -s -X POST "$BASE_URL/scheduling/$REQUEST_ID/start" | head -c 500
echo ""

echo ""
echo "3. Simulate webhook: candidate 1 DECLINES..."
# Candidate 1's phone must match User.phone in DB (digits only)
CANDIDATE_1_PHONE="${CANDIDATE_1_PHONE:-34612345678}"
curl -s -X POST "$BASE_URL/whatsapp/webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$CANDIDATE_1_PHONE\",
    \"body\": { \"text\": \"NO\" }
  }"
echo ""

echo ""
echo "4. Simulate webhook: candidate 2 ACCEPTS..."
CANDIDATE_2_PHONE="${CANDIDATE_2_PHONE:-34687654321}"
curl -s -X POST "$BASE_URL/whatsapp/webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$CANDIDATE_2_PHONE\",
    \"body\": { \"text\": \"YES\" }
  }"
echo ""

echo ""
echo "5. Fetch final request state..."
curl -s "$BASE_URL/scheduling/$REQUEST_ID"
