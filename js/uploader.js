class AzureFileUploader {
    constructor() {
        this.selectedFile = null;
        this.containerName = null;
        this.containerLocation = null;
        this.sasToken = null;
        this.blobServiceClient = null;
        
        // 진행률 업데이트 쓰로틀링 (초대용량 파일 최적화)
        this.lastProgressUpdate = 0;
        this.progressUpdateInterval = 200; // 200ms마다 업데이트 (성능 향상)
        
        // 메모리 관리
        this.maxConcurrentChunks = 8; // 메모리에 동시 로드할 최대 청크 수
        
        this.initializeElements();
        this.bindEvents();
        this.parseUrlParams();
    }

    initializeElements() {
        console.log('🔧 DOM 요소 초기화 시작');
        
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.selectedFileDiv = document.getElementById('selectedFile');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.statusMessage = document.getElementById('statusMessage');
        this.progressContainer = document.getElementById('progressContainer');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.progressPercent = document.getElementById('progressPercent');
        this.fileName = document.getElementById('fileName');
        this.fileSize = document.getElementById('fileSize');
        this.containerInfo = document.getElementById('containerInfo');
        this.containerNameSpan = document.getElementById('containerName');
        this.containerLocationSpan = document.getElementById('containerLocation');
        
        // 주요 요소들이 제대로 찾아졌는지 확인
        const requiredElements = {
            uploadArea: this.uploadArea,
            fileInput: this.fileInput,
            uploadBtn: this.uploadBtn
        };
        
        for (const [name, element] of Object.entries(requiredElements)) {
            if (!element) {
                console.error(`❌ 필수 요소 '${name}' 를 찾을 수 없습니다!`);
            } else {
                console.log(`✅ '${name}' 요소 찾음`);
            }
        }
    }

    parseUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        this.containerName = urlParams.get('container') || 'default-container';
        this.containerLocation = urlParams.get('location') || 'eastus';
        
        // 컨테이너 정보 표시
        this.containerNameSpan.textContent = this.containerName;
        this.containerLocationSpan.textContent = this.containerLocation;
        this.containerInfo.style.display = 'block';
    }

    bindEvents() {
        console.log('🔗 이벤트 바인딩 시작');
        
        // 파일 선택 이벤트
        this.uploadArea.addEventListener('click', () => {
            console.log('📁 업로드 영역 클릭됨');
            this.fileInput.click();
        });

        this.fileInput.addEventListener('change', (e) => {
            console.log('📄 파일 선택됨:', e.target.files.length);
            if (e.target.files.length > 0) {
                this.handleFileSelect(e.target.files[0]);
            }
        });

        // 드래그 앤 드롭 이벤트
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });

        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('dragover');
        });

        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            
            if (e.dataTransfer.files.length > 0) {
                this.handleFileSelect(e.dataTransfer.files[0]);
            }
        });

        // 업로드 버튼 이벤트
        this.uploadBtn.addEventListener('click', () => {
            this.uploadFile();
        });
    }

    handleFileSelect(file) {
        this.selectedFile = file;
        
        // 파일 정보 표시
        this.fileName.textContent = file.name;
        this.fileSize.textContent = this.formatFileSize(file.size);
        
        // 드래그 영역 스타일 변경 (파일 선택됨)
        this.uploadArea.classList.add('file-selected');
        
        // UI 업데이트
        this.selectedFileDiv.style.display = 'block';
        this.uploadBtn.style.display = 'block';
        this.uploadBtn.disabled = false;
        this.hideStatus();
        
        // 진행률 초기화
        this.progressContainer.style.display = 'none';
        this.progressFill.style.width = '0%';
        this.progressPercent.textContent = '0%';
        
        // 업로드 통계 숨기기
        const uploadStats = document.getElementById('uploadStats');
        if (uploadStats) {
            uploadStats.style.display = 'none';
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async getSasToken() {
        try {
            // Azure Functions API 호출하여 SAS 토큰 획득
            const apiUrl = window.location.hostname === 'localhost' 
                ? 'http://localhost:7071/api/generateSas'  // 로컬 개발
                : '/api/generateSas';  // 배포 환경
                
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    containerName: this.containerName,
                    fileName: this.selectedFile.name,
                    location: this.containerLocation
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.sasUrl;
        } catch (error) {
            console.error('SAS 토큰 획득 실패:', error);
            throw new Error('SAS 토큰 획득에 실패했습니다.');
        }
    }

    async uploadFile() {
        if (!this.selectedFile) return;

        try {
            this.uploadBtn.disabled = true;
            this.showStatus('SAS 토큰을 획득하는 중...', 'info');
            
            // SAS 토큰 획득
            const sasUrl = await this.getSasToken();
            
            this.showStatus('파일을 업로드하는 중...', 'info');
            this.progressContainer.style.display = 'block';
            
            // 20GB+ 파일용 상세 통계 표시
            const uploadStats = document.getElementById('uploadStats');
            if (uploadStats && this.selectedFile.size > 1024 * 1024 * 1024) { // 1GB 이상
                uploadStats.style.display = 'block';
            }
            
            // 업로드 시간 추적 초기화
            this.uploadStartTime = null;
            this.lastSpeedUpdate = null;
            this.lastLoadedBytes = 0;
            
            // Azure Blob Storage 클라이언트 생성
            if (typeof Azure === 'undefined') {
                throw new Error('Azure Storage Blob SDK가 로드되지 않았습니다. 페이지를 새로고침해주세요.');
            }
            
            if (!Azure.Storage || !Azure.Storage.Blob || !Azure.Storage.Blob.BlockBlobClient) {
                throw new Error('Azure Storage Blob 모듈이 완전히 로드되지 않았습니다. 페이지를 새로고침해주세요.');
            }
            
            console.log('🔗 Azure Blob Client 생성 중:', sasUrl.substring(0, 100) + '...');
            const blockBlobClient = new Azure.Storage.Blob.BlockBlobClient(sasUrl);
            
            // 업로드 옵션 설정 (최적화됨)
            const uploadOptions = {
                blockSize: this.getOptimalBlockSize(this.selectedFile.size),
                concurrency: this.getOptimalConcurrency(),
                onProgress: (progress) => {
                    this.updateProgressThrottled(progress);
                }
            };

            // 파일 업로드 실행
            await blockBlobClient.uploadData(this.selectedFile, uploadOptions);
            
            this.showStatus(`✅ 파일 "${this.selectedFile.name}"이 성공적으로 업로드되었습니다!`, 'success');
            this.progressPercent.textContent = '100%';
            this.progressFill.style.width = '100%';
            this.progressText.textContent = '업로드 완료!';
            
            // Streamlit에 완료 신호 전송 (postMessage 사용)
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'upload_complete',
                    fileName: this.selectedFile.name,
                    containerName: this.containerName,
                    fileSize: this.selectedFile.size
                }, '*');
            }
            
            // 3초 후 UI 리셋 (새 파일 업로드 준비)
            setTimeout(() => {
                this.resetUI();
            }, 3000);
            
        } catch (error) {
            console.error('업로드 실패:', error);
            this.showStatus(`❌ 업로드 실패: ${error.message}`, 'error');
        } finally {
            this.uploadBtn.disabled = false;
        }
    }

    updateProgress(progress) {
        if (progress.loadedBytes && progress.totalBytes) {
            const percent = Math.round((progress.loadedBytes / progress.totalBytes) * 100);
            this.progressFill.style.width = percent + '%';
            this.progressPercent.textContent = percent + '%';
            
            const loaded = this.formatFileSize(progress.loadedBytes);
            const total = this.formatFileSize(progress.totalBytes);
            
            // 20GB+ 파일용 상세 진행률 표시
            if (progress.completedBlocks && progress.totalBlocks) {
                this.progressText.textContent = `${loaded} / ${total} (블록 ${progress.completedBlocks}/${progress.totalBlocks})`;
            } else {
                this.progressText.textContent = `${loaded} / ${total}`;
            }
            
            // 업로드 속도 계산 및 표시
            this.updateUploadSpeed(progress.loadedBytes);
        }
    }

    // 업로드 속도 추적 (초대용량 파일용)
    updateUploadSpeed(loadedBytes) {
        const now = Date.now();
        
        if (!this.uploadStartTime) {
            this.uploadStartTime = now;
            this.lastSpeedUpdate = now;
            this.lastLoadedBytes = 0;
            return;
        }
        
        // 1초마다 속도 업데이트
        if (now - this.lastSpeedUpdate >= 1000) {
            const timeDiff = (now - this.lastSpeedUpdate) / 1000;
            const bytesDiff = loadedBytes - this.lastLoadedBytes;
            const speed = bytesDiff / timeDiff;
            
            const speedElement = document.getElementById('uploadSpeed');
            if (speedElement) {
                speedElement.textContent = `속도: ${this.formatFileSize(speed)}/s`;
            }
            
            // 남은 시간 계산
            const remainingBytes = this.selectedFile.size - loadedBytes;
            const eta = Math.round(remainingBytes / speed);
            
            const etaElement = document.getElementById('uploadETA');
            if (etaElement && eta > 0 && eta < 86400) { // 24시간 미만일 때만 표시
                etaElement.textContent = `남은 시간: ${this.formatTime(eta)}`;
            }
            
            this.lastSpeedUpdate = now;
            this.lastLoadedBytes = loadedBytes;
        }
    }

    // 시간 포맷팅 (초 -> 시:분:초)
    formatTime(seconds) {
        if (seconds < 60) {
            return `${seconds}초`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${minutes}분 ${secs}초`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}시간 ${minutes}분`;
        }
    }

    // 쓰로틀링된 진행률 업데이트 (성능 최적화)
    updateProgressThrottled(progress) {
        const now = Date.now();
        if (now - this.lastProgressUpdate >= this.progressUpdateInterval) {
            this.updateProgress(progress);
            this.lastProgressUpdate = now;
        }
    }

    // 파일 크기에 따른 최적 블록 크기 계산 (20GB+ 지원)
    getOptimalBlockSize(fileSize) {
        const MB = 1024 * 1024;
        const GB = 1024 * MB;
        
        if (fileSize < 100 * MB) {
            return 4 * MB;      // 100MB 미만: 4MB 블록
        } else if (fileSize < 1 * GB) {
            return 8 * MB;      // 1GB 미만: 8MB 블록
        } else if (fileSize < 5 * GB) {
            return 16 * MB;     // 5GB 미만: 16MB 블록
        } else if (fileSize < 20 * GB) {
            return 64 * MB;     // 20GB 미만: 64MB 블록 (Azure 최대 블록 크기)
        } else {
            // 20GB 이상 초대용량: 100MB 블록 (Azure Blob 최대 블록 크기)
            return 100 * MB;    
        }
    }

    // 네트워크 상황에 따른 최적 동시성 계산 (초대용량 파일 고려)
    getOptimalConcurrency() {
        const userAgent = navigator.userAgent.toLowerCase();
        const isMobile = userAgent.includes('mobile') || userAgent.includes('android') || userAgent.includes('iphone');
        
        // 파일 크기에 따른 동적 조정
        if (!this.selectedFile) return 3;
        
        const GB = 1024 * 1024 * 1024;
        const fileSize = this.selectedFile.size;
        
        if (isMobile) {
            // 모바일: 배터리와 네트워크 안정성 우선
            if (fileSize > 10 * GB) return 2;  // 10GB+: 2개
            return 3;                          // 그 외: 3개
        } else {
            // 데스크톱: 파일 크기별 최적화
            if (fileSize > 50 * GB) return 3;  // 50GB+: 3개 (초안정)
            if (fileSize > 20 * GB) return 4;  // 20GB+: 4개 (안정)
            if (fileSize > 5 * GB) return 5;   // 5GB+: 5개 (균형)
            return 6;                          // 5GB 미만: 6개 (빠름)
        }
    }

    showStatus(message, type) {
        this.statusMessage.textContent = message;
        this.statusMessage.className = `status-message status-${type}`;
        this.statusMessage.style.display = 'block';
    }

    hideStatus() {
        this.statusMessage.style.display = 'none';
    }

    // UI 리셋 (새 파일 업로드 준비)
    resetUI() {
        // 파일 선택 초기화
        this.selectedFile = null;
        this.fileInput.value = '';
        
        // 드래그 영역 스타일 리셋
        this.uploadArea.classList.remove('file-selected');
        
        // 파일 정보 숨기기
        this.selectedFileDiv.style.display = 'none';
        this.uploadBtn.style.display = 'none';
        
        // 진행률 숨기기
        this.progressContainer.style.display = 'none';
        this.progressFill.style.width = '0%';
        this.progressPercent.textContent = '0%';
        
        // 업로드 통계 숨기기
        const uploadStats = document.getElementById('uploadStats');
        if (uploadStats) {
            uploadStats.style.display = 'none';
        }
        
        // 상태 메시지 숨기기
        this.hideStatus();
        
        // 업로드 추적 초기화
        this.uploadStartTime = null;
        this.lastSpeedUpdate = null;
        this.lastLoadedBytes = 0;
        
        console.log('🔄 UI 리셋 완료 - 새 파일 업로드 준비');
    }
}

// 페이지 로드 시 업로더 초기화
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM 로드 완료');
    
    // 즉시 업로더 초기화 (UI 이벤트는 Azure SDK와 무관)
    const uploader = new AzureFileUploader();
    console.log('🚀 Azure File Uploader 초기화 완료');
    
    // Azure SDK 로드 상태 확인 (업로드 시에만 필요)
    function checkAzureSDK() {
        if (typeof Azure !== 'undefined' && Azure.Storage && Azure.Storage.Blob) {
            console.log('✅ Azure Storage Blob SDK 완전 로드됨');
            return true;
        } else if (typeof Azure !== 'undefined') {
            console.warn('⚠️ Azure 객체 있음, 하지만 Storage.Blob 모듈 없음');
            setTimeout(checkAzureSDK, 500);
            return false;
        } else {
            console.warn('⚠️ Azure SDK 로딩 중...');
            setTimeout(checkAzureSDK, 500);
            return false;
        }
    }
    
    // 약간의 지연 후 체크 시작
    setTimeout(checkAzureSDK, 500);
});
