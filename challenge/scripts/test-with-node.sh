#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting MintPass integration test with automated node management...${NC}"

# Function to cleanup background processes
cleanup() {
    if [ ! -z "$NODE_PID" ]; then
        echo -e "${YELLOW}🧹 Cleaning up Hardhat node (PID: $NODE_PID)...${NC}"
        
        # First try graceful termination
        if kill $NODE_PID 2>/dev/null; then
            # Wait a moment for graceful shutdown
            sleep 2
            
            # If still running, force kill
            if kill -0 $NODE_PID 2>/dev/null; then
                echo -e "${YELLOW}⚠️ Graceful shutdown failed, force killing...${NC}"
                kill -9 $NODE_PID 2>/dev/null
            fi
        fi
        
        # Wait for the process to be fully reaped to prevent zombie processes
        wait $NODE_PID 2>/dev/null || true
        
        # Clean up any remaining node processes on port 8545
        if lsof -ti:8545 >/dev/null 2>&1; then
            echo -e "${YELLOW}🧹 Cleaning up remaining processes on port 8545...${NC}"
            lsof -ti:8545 | xargs kill -9 2>/dev/null || true
        fi
        
        echo -e "${GREEN}✅ Hardhat node stopped${NC}"
    fi
}

# Set trap to cleanup on script exit (success or failure)
trap cleanup EXIT

# Start Hardhat node in background
echo -e "${YELLOW}🔧 Starting Hardhat node...${NC}"
cd ../contracts
npx hardhat node > /dev/null 2>&1 &
NODE_PID=$!
cd ../challenges

# Wait for node to be ready
echo -e "${YELLOW}⏳ Waiting for Hardhat node to be ready...${NC}"
for i in {1..30}; do
    # Check if Hardhat node is responding to JSON-RPC calls
    if curl -s -X POST -H "Content-Type: application/json" \
        --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
        http://127.0.0.1:8545 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Hardhat node is ready!${NC}"
        break
    fi
    
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Timeout waiting for Hardhat node to start${NC}"
        exit 1
    fi
    
    sleep 1
done

# Run the tests
echo -e "${YELLOW}🧪 Running integration tests...${NC}"
cd ../contracts
npx hardhat test ../challenge/test/mintpass-integration.test.js --network localhost

# Store exit code to return it at the end
TEST_EXIT_CODE=$?

cd ../challenge

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
else
    echo -e "${RED}❌ Tests failed${NC}"
fi

# Cleanup will be handled by the trap
exit $TEST_EXIT_CODE 