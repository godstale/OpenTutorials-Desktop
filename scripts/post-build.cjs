const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. package.json에서 버전 읽기
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

// 2. 플랫폼별 소스 파일 및 타겟 파일 이름 결정
const isWindows = process.platform === 'win32';
const srcFileName = isWindows ? 'desktop.exe' : 'desktop';
const targetFileName = isWindows ? `OpenTutorials-v${version}.exe` : `OpenTutorials-v${version}`;

const srcPath = path.join(__dirname, '..', 'src-tauri', 'target', 'release', srcFileName);
const releaseDir = path.join(__dirname, '..', 'release');
const targetPath = path.join(releaseDir, targetFileName);

console.log(`[Post-Build] Post-build process started...`);
console.log(`[Post-Build] Target version: ${version}`);

// 3. 빌드된 실행 파일 존재 여부 확인
if (!fs.existsSync(srcPath)) {
  console.error(`[Post-Build] Error: Build artifact not found at "${srcPath}"`);
  process.exit(1);
}

// 4. release 폴더 생성 (없을 경우)
if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
  console.log(`[Post-Build] Created release directory at "${releaseDir}"`);
}

// 5. 파일 복사 및 이름 변경
try {
  fs.copyFileSync(srcPath, targetPath);
  console.log(`[Post-Build] Successfully copied and renamed artifact to:`);
  console.log(`             => ${targetPath}`);
} catch (err) {
  console.error(`[Post-Build] Failed to copy build artifact:`, err);
  process.exit(1);
}

// 6. git add를 자동 실행하여 git 추적에 추가
try {
  console.log(`[Post-Build] Adding artifact to Git staging area...`);
  execSync(`git add "${targetPath}"`, { stdio: 'inherit' });
  console.log(`[Post-Build] Successfully staged "${targetFileName}" for Git commit.`);
} catch (err) {
  console.warn(`[Post-Build] Warning: Failed to run git add. Is git initialized?`, err.message);
}
