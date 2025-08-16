#!/bin/bash

echo "🚀 Azure File Uploader 로컬 개발 환경 시작"
echo "================================================"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 필수 도구 확인
echo -e "${BLUE}1. 필수 도구 확인 중...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js가 설치되어 있지 않습니다.${NC}"
    echo "https://nodejs.org에서 Node.js를 설치해주세요."
    exit 1
fi

if ! command -v func &> /dev/null; then
    echo -e "${RED}❌ Azure Functions Core Tools가 설치되어 있지 않습니다.${NC}"
    echo "다음 명령어로 설치해주세요:"
    echo "npm install -g azure-functions-core-tools@4 --unsafe-perm true"
    exit 1
fi

echo -e "${GREEN}✅ Node.js 및 Azure Functions Core Tools 확인됨${NC}"

# 의존성 설치
echo -e "${BLUE}2. 의존성 설치 중...${NC}"

if [ ! -d "node_modules" ]; then
    echo "프론트엔드 의존성 설치 중..."
    npm install
fi

if [ ! -d "api/node_modules" ]; then
    echo "API 의존성 설치 중..."
    cd api && npm install && cd ..
fi

echo -e "${GREEN}✅ 의존성 설치 완료${NC}"

# 환경 변수 확인
echo -e "${BLUE}3. 환경 변수 확인 중...${NC}"

if [ ! -f "api/local.settings.json" ]; then
    echo -e "${YELLOW}⚠️  api/local.settings.json 파일이 없습니다.${NC}"
    echo "Azure Storage 계정 정보를 설정해주세요."
else
    echo -e "${GREEN}✅ local.settings.json 파일 확인됨${NC}"
fi

# 서버 시작
echo -e "${BLUE}4. 서버 시작 중...${NC}"
echo "================================================"

# Azure Functions 백그라운드 실행
echo -e "${YELLOW}Azure Functions 시작 중... (포트 7071)${NC}"
cd api
func start --port 7071 &
FUNC_PID=$!
cd ..

# 잠시 대기 (Functions 시작 시간)
sleep 3

# 정적 파일 서버 시작
echo -e "${YELLOW}정적 파일 서버 시작 중... (포트 8080)${NC}"
npx live-server --port=8080 --no-browser &
SERVER_PID=$!

# 잠시 대기 (서버 시작 시간)
sleep 2

echo ""
echo -e "${GREEN}🎉 로컬 개발 환경이 시작되었습니다!${NC}"
echo "================================================"
echo -e "${BLUE}📱 접속 URL:${NC}"
echo "   • 업로더: http://localhost:8080"
echo "   • 테스트 페이지: http://localhost:8080/local-test.html"
echo "   • API: http://localhost:7071"
echo ""
echo -e "${BLUE}🔧 설정해야 할 것:${NC}"
echo "   1. api/local.settings.json에 Azure Storage 정보 입력"
echo "   2. AZURE_STORAGE_ACCOUNT_NAME 설정"
echo "   3. AZURE_STORAGE_ACCOUNT_KEY 설정"
echo ""
echo -e "${YELLOW}💡 Streamlit에서 테스트하려면:${NC}"
echo '   st.components.v1.iframe("http://localhost:8080?container=test&location=eastus", height=600)'
echo ""
echo -e "${RED}종료하려면 Ctrl+C를 누르세요${NC}"

# 종료 시그널 처리
cleanup() {
    echo ""
    echo -e "${YELLOW}서버 종료 중...${NC}"
    kill $FUNC_PID 2>/dev/null
    kill $SERVER_PID 2>/dev/null
    echo -e "${GREEN}✅ 서버가 종료되었습니다.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# 백그라운드 프로세스 대기
wait
