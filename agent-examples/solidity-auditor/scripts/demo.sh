#!/usr/bin/env bash
#
# TAL End-to-End Demo Script
#
# Runs the full lifecycle:
#   1. Start the agent runtime
#   2. Submit a summarization task
#   3. Submit a Solidity audit task
#   4. Request StakeSecured validation
#   5. Execute validator re-execution
#   6. Query validation status
#   7. Show results with on-chain hashes
#
# Prerequisites:
#   - cd agent-runtime && cp .env.example .env  (fill in OPENAI_API_KEY)
#   - npm install
#
set -euo pipefail

RUNTIME_URL="${RUNTIME_URL:-http://localhost:3001}"
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

header() { echo -e "\n${BLUE}═══════════════════════════════════════════════════${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"; }
ok()     { echo -e "${GREEN}✓ $1${NC}"; }
info()   { echo -e "${YELLOW}→ $1${NC}"; }
err()    { echo -e "${RED}✗ $1${NC}"; }

parse_json() {
  python3 -c "import sys,json; data=json.load(sys.stdin); print(data.get('$1','N/A'))" 2>/dev/null || echo "N/A"
}

# -------------------------------------------------------------------
header "TAL Agent Runtime — E2E Demo"
# -------------------------------------------------------------------

# 1. Health check
info "Checking agent runtime at $RUNTIME_URL ..."
HEALTH=$(curl -sf "$RUNTIME_URL/health" 2>/dev/null || true)
if [ -z "$HEALTH" ]; then
  err "Agent runtime not running. Start it first:"
  echo "  cd agent-runtime && npm run dev"
  exit 1
fi
ok "Runtime is healthy"
echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"

# 2. List agents
header "Step 1: Discover Agents"
info "GET /api/agents"
AGENTS=$(curl -sf "$RUNTIME_URL/api/agents")
echo "$AGENTS" | python3 -m json.tool 2>/dev/null || echo "$AGENTS"
ok "Found agents"

# 3. Summarization task
header "Step 2: Submit Summarization Task"

TMPFILE=$(mktemp)
cat > "$TMPFILE" << 'PAYLOAD'
{
  "agentId": "summarizer",
  "input": {
    "text": "The Tokamak Network is a Layer 2 protocol suite built on Ethereum that provides on-demand computation and scalable infrastructure. It uses an Optimistic Rollup architecture with a unique economic model centered around the TON token. The network supports multiple rollup deployments, each secured by staked TON, with a seigniorage mechanism that rewards stakers. The Tokamak AI Layer (TAL) extends this infrastructure to support trustless AI agent operations, enabling decentralized agent discovery, reputation management, and output verification through stake-secured re-execution and TEE attestation. TAL implements the ERC-8004 standard for agent identity and uses a cross-layer bridge to leverage L1 staking for L2 agent validation security."
  }
}
PAYLOAD

info "POST /api/tasks (agent: summarizer)"
SUMMARY_RESULT=$(curl -sf -X POST "$RUNTIME_URL/api/tasks" \
  -H "Content-Type: application/json" \
  -d @"$TMPFILE")

echo ""
SUMMARY_STATUS=$(echo "$SUMMARY_RESULT" | parse_json status)
SUMMARY_HASH=$(echo "$SUMMARY_RESULT" | parse_json outputHash)
SUMMARY_ID=$(echo "$SUMMARY_RESULT" | parse_json taskId)

ok "Task ID:     $SUMMARY_ID"
ok "Status:      $SUMMARY_STATUS"
ok "Output Hash: $SUMMARY_HASH"
echo ""

if [ "$SUMMARY_STATUS" = "completed" ]; then
  info "Output:"
  echo "$SUMMARY_RESULT" | parse_json output
elif [ "$SUMMARY_STATUS" = "failed" ]; then
  err "Error:"
  echo "$SUMMARY_RESULT" | parse_json error
fi

# 4. Audit task
header "Step 3: Submit Solidity Audit Task"

cat > "$TMPFILE" << 'PAYLOAD'
{
  "agentId": "auditor",
  "input": {
    "text": "pragma solidity ^0.8.24;\n\ncontract VulnerableVault {\n    mapping(address => uint256) public balances;\n\n    function deposit() external payable {\n        balances[msg.sender] += msg.value;\n    }\n\n    function withdraw(uint256 amount) external {\n        require(balances[msg.sender] >= amount, \"Insufficient\");\n        (bool ok, ) = msg.sender.call{value: amount}(\"\");\n        require(ok, \"Transfer failed\");\n        balances[msg.sender] -= amount;\n    }\n\n    function getBalance() external view returns (uint256) {\n        return address(this).balance;\n    }\n}"
  }
}
PAYLOAD

info "POST /api/tasks (agent: auditor)"
AUDIT_RESULT=$(curl -sf -X POST "$RUNTIME_URL/api/tasks" \
  -H "Content-Type: application/json" \
  -d @"$TMPFILE")

echo ""
AUDIT_STATUS=$(echo "$AUDIT_RESULT" | parse_json status)
AUDIT_HASH=$(echo "$AUDIT_RESULT" | parse_json outputHash)
AUDIT_ID=$(echo "$AUDIT_RESULT" | parse_json taskId)

ok "Task ID:     $AUDIT_ID"
ok "Status:      $AUDIT_STATUS"
ok "Output Hash: $AUDIT_HASH"
echo ""

if [ "$AUDIT_STATUS" = "completed" ]; then
  info "Output:"
  echo "$AUDIT_RESULT" | parse_json output
elif [ "$AUDIT_STATUS" = "failed" ]; then
  err "Error:"
  echo "$AUDIT_RESULT" | parse_json error
fi

# 5. Request validation
header "Step 4: Request StakeSecured Validation"

cat > "$TMPFILE" << PAYLOAD
{
  "taskId": "$SUMMARY_ID",
  "model": "StakeSecured"
}
PAYLOAD

info "POST /api/validations/request (taskId: $SUMMARY_ID, model: StakeSecured)"
VALIDATION_REQUEST=$(curl -sf -X POST "$RUNTIME_URL/api/validations/request" \
  -H "Content-Type: application/json" \
  -d @"$TMPFILE")

echo ""
VALIDATION_TASK_ID=$(echo "$VALIDATION_REQUEST" | parse_json taskId)
VALIDATION_MODEL=$(echo "$VALIDATION_REQUEST" | parse_json model)
VALIDATION_AGENT=$(echo "$VALIDATION_REQUEST" | parse_json agentId)
VALIDATION_INPUT_HASH=$(echo "$VALIDATION_REQUEST" | parse_json inputHash)

ok "Validation Task ID: $VALIDATION_TASK_ID"
ok "Model:              $VALIDATION_MODEL"
ok "Agent ID:           $VALIDATION_AGENT"
ok "Input Hash:         $VALIDATION_INPUT_HASH"
echo ""

# 6. Execute validation
header "Step 5: Execute Validator Re-Execution"

cat > "$TMPFILE" << PAYLOAD
{
  "taskId": "$SUMMARY_ID"
}
PAYLOAD

info "POST /api/validations/execute (taskId: $SUMMARY_ID)"
VALIDATION_RESULT=$(curl -sf -X POST "$RUNTIME_URL/api/validations/execute" \
  -H "Content-Type: application/json" \
  -d @"$TMPFILE")

echo ""
VALIDATION_SCORE=$(echo "$VALIDATION_RESULT" | parse_json score)
VALIDATION_MATCH=$(echo "$VALIDATION_RESULT" | parse_json matchType)
VALIDATION_REEXEC_HASH=$(echo "$VALIDATION_RESULT" | parse_json reExecutionHash)

ok "Validation Score:       $VALIDATION_SCORE"
ok "Match Type:             $VALIDATION_MATCH"
ok "Re-Execution Hash:      $VALIDATION_REEXEC_HASH"
echo ""

# 7. Query validation status
header "Step 6: Query Validation Status"

info "GET /api/validations/agent/1"
AGENT_VALIDATIONS=$(curl -sf "$RUNTIME_URL/api/validations/agent/1")
echo "$AGENT_VALIDATIONS" | python3 -m json.tool 2>/dev/null || echo "$AGENT_VALIDATIONS"
ok "Retrieved agent validations"

# Cleanup
rm -f "$TMPFILE"

# Summary
header "Demo Complete"
echo "Lifecycle demonstrated:"
echo "  1. Agent discovery via REST API"
echo "  2. Task submission to Summarizer agent"
echo "  3. Task submission to Solidity Auditor agent"
echo "  4. Validation request via /api/validations/request"
echo "  5. Validator re-execution via /api/validations/execute"
echo "  6. Validation status query via /api/validations/agent/:id"
echo "  7. Output hashes generated for on-chain validation"
echo ""
echo "Next steps for full on-chain demo:"
echo "  - Register agents: npm run register"
echo "  - Request validation via TALValidationRegistry"
echo "  - Submit feedback via TALReputationRegistry"
echo ""
ok "Demo script finished"
