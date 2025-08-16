const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');

module.exports = async function (context, req) {
    context.log('SAS 토큰 생성 요청 수신');

    // CORS 헤더 설정
    context.res = {
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    };

    // OPTIONS 요청 처리 (CORS preflight)
    if (req.method === 'OPTIONS') {
        context.res.status = 200;
        return;
    }

    try {
        // 요청 본문 검증
        const { containerName, fileName, location } = req.body;

        if (!containerName || !fileName) {
            context.res.status = 400;
            context.res.body = {
                error: 'containerName과 fileName이 필요합니다.'
            };
            return;
        }

        // 환경 변수에서 Azure Storage 정보 가져오기
        const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
        const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;

        if (!accountName || !accountKey) {
            context.log.error('Azure Storage 계정 정보가 설정되지 않았습니다.');
            context.res.status = 500;
            context.res.body = {
                error: 'Azure Storage 계정 정보가 설정되지 않았습니다.'
            };
            return;
        }

        // Azure Storage 클라이언트 생성
        const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
        const blobServiceClient = new BlobServiceClient(
            `https://${accountName}.blob.core.windows.net`,
            sharedKeyCredential
        );

        // 컨테이너 클라이언트 가져오기
        const containerClient = blobServiceClient.getContainerClient(containerName);

        // 컨테이너가 존재하는지 확인하고, 없으면 private으로 생성
        try {
            // 먼저 private 컨테이너로 생성 시도 (보안상 권장)
            await containerClient.createIfNotExists();
            context.log(`컨테이너 '${containerName}' 준비 완료`);
        } catch (createError) {
            // 컨테이너가 이미 존재하거나 다른 이유로 실패한 경우
            if (createError.code === 'ContainerAlreadyExists' || createError.statusCode === 409) {
                context.log(`컨테이너 '${containerName}' 이미 존재함`);
            } else {
                context.log.warn(`컨테이너 확인/생성 중 경고: ${createError.code || createError.message}`);
                // 컨테이너 생성에 실패해도 SAS 토큰 생성은 계속 진행
                // (컨테이너가 이미 존재할 가능성이 높음)
            }
        }

        // 블롭 클라이언트 가져오기
        const blobClient = containerClient.getBlockBlobClient(fileName);

        // SAS 토큰 생성 - 12시간 유효 (20GB+ 대용량 파일 지원)
        const sasOptions = {
            containerName: containerName,
            blobName: fileName,
            permissions: BlobSASPermissions.parse('rcw'), // read, create, write
            startsOn: new Date(),
            expiresOn: new Date(new Date().valueOf() + 12 * 3600 * 1000), // 12시간 후 만료
        };

        const sasToken = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential).toString();
        const sasUrl = `${blobClient.url}?${sasToken}`;

        context.log(`SAS URL 생성 완료: ${fileName}`);

        // 성공 응답
        context.res.status = 200;
        context.res.body = {
            sasUrl: sasUrl,
            containerName: containerName,
            fileName: fileName,
            expiresAt: sasOptions.expiresOn.toISOString()
        };

    } catch (error) {
        context.log.error('SAS 토큰 생성 중 오류:', error);
        
        context.res.status = 500;
        context.res.body = {
            error: 'SAS 토큰 생성에 실패했습니다.',
            details: error.message
        };
    }
};
