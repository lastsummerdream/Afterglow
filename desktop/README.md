# AFTERGLOW 데스크톱 앱 (macOS `.dmg` / Windows `.exe`)

롤플레잉 사이트 커버 화면(`https://lastsummerdream.github.io/Afterglow/app/`)을 전용 창으로 여는 데스크톱 애플리케이션입니다.
사이트가 업데이트되면 앱을 다시 설치하지 않아도 자동으로 최신 화면이 반영됩니다.

## 다운로드 링크 (GitHub Releases)

- **전체 배포 페이지**: https://github.com/lastsummerdream/Afterglow/releases/latest
- **macOS 설치 파일 (`.dmg`, Apple Silicon & Intel 공용)**:
  https://github.com/lastsummerdream/Afterglow/releases/latest/download/Afterglow-mac.dmg
- **Windows 설치 파일 (`Setup.exe`)**:
  https://github.com/lastsummerdream/Afterglow/releases/latest/download/Afterglow-Windows-Setup.exe
- **Windows 무설치 포터블 실행 파일 (`Portable.exe`)**:
  https://github.com/lastsummerdream/Afterglow/releases/latest/download/Afterglow-Windows-Portable.exe

## 첫 실행 시 OS 보안 안내 해제 방법

유료 코드 서명 인증서 없이 빌드된 파일이므로 첫 실행 시 아래 방법으로 열어 주세요.

- **Windows**: `Windows의 PC 보호(SmartScreen)` 창이 뜨면 **추가 정보** → **실행** 클릭
- **macOS**: `AFTERGLOW.app`을 `Applications(응용 프로그램)` 폴더로 옮긴 뒤, 처음 열 때 아이콘을 **우클릭(Control+클릭) → 열기** 선택 (또는 `시스템 설정 > 개인정보 보호 및 보안` 아래쪽의 **확인 없이 열기** 클릭)

## 직접 빌드하기

```bash
cd desktop
npm install
npm run dist:mac   # macOS: dist/Afterglow-mac.dmg
npm run dist:win   # Windows: dist/Afterglow-Windows-Setup.exe, dist/Afterglow-Windows-Portable.exe
```
