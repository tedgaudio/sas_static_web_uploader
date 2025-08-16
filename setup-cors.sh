#!/bin/bash

# Azure Storage CORS 설정 스크립트

echo "🔧 Azure Storage Account CORS 설정 중..."

# Azure CLI 로그인 확인
if ! az account show &> /dev/null; then
    echo "Azure CLI 로그인이 필요합니다:"
    echo "az login"
    exit 1
fi

# Storage Account 이름
STORAGE_ACCOUNT="gspkfast"

echo "📋 Storage Account: $STORAGE_ACCOUNT"

# CORS 설정 적용
az storage cors add \
    --account-name $STORAGE_ACCOUNT \
    --services b \
    --methods GET PUT POST DELETE HEAD OPTIONS \
    --origins "*" \
    --allowed-headers "*" \
    --exposed-headers "*" \
    --max-age 86400

if [ $? -eq 0 ]; then
    echo "✅ CORS 설정이 성공적으로 적용되었습니다!"
    echo ""
    echo "🔄 브라우저에서 페이지를 새로고침하고 다시 업로드를 시도해보세요."
else
    echo "❌ CORS 설정 실패"
    echo ""
    echo "🔧 Azure Portal에서 수동으로 설정해주세요:"
    echo "1. Azure Portal → Storage Account → gspkfast"
    echo "2. Settings → Resource sharing (CORS)"
    echo "3. Blob service 탭에서 새 규칙 추가:"
    echo "   - Allowed origins: *"
    echo "   - Allowed methods: GET,PUT,POST,DELETE,HEAD,OPTIONS"
    echo "   - Allowed headers: *"
    echo "   - Exposed headers: *"
    echo "   - Max age: 86400"
fi
