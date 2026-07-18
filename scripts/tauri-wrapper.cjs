const { spawn } = require('child_process');
const path = require('path');

// 1. 실행된 인수들 가져오기 (예: build, dev 등)
const args = process.argv.slice(2);

// 2. 플랫폼별 tauri CLI 명령어 결정 (Windows는 tauri.cmd, macOS는 tauri)
const isWindows = process.platform === 'win32';
const tauriCmd = isWindows ? 'tauri.cmd' : 'tauri';

// node_modules/.bin 안의 tauri CLI 경로
const tauriPath = path.join(__dirname, '..', 'node_modules', '.bin', tauriCmd);

console.log(`[Tauri-Wrapper] Running tauri CLI with args: ${args.join(' ')}`);

// 3. Tauri CLI 실행
const child = spawn(tauriPath, args, { stdio: 'inherit', shell: true });

child.on('close', (code) => {
  // 빌드가 성공적으로 끝났고, 실행 명령어가 'build'인 경우 post-build 스크립트 실행
  if (code === 0 && args.includes('build')) {
    console.log(`\n[Tauri-Wrapper] Build completed successfully. Running post-build script...`);
    try {
      require('./post-build.cjs');
    } catch (err) {
      console.error('[Tauri-Wrapper] Post-build script failed:', err);
      process.exit(1);
    }
  }
  process.exit(code);
});
