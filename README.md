# Afterglow

잔광(AFTERGLOW) 세계관 기록 단말과 URIM.

- `index.html` 터미널 (기록, 용어집, 명부, 사용자 등록 등)
- `urim.html` URIM 기록 질의 단말
- `server/` URIM 서버 (Cloudflare Worker `urim-proxy`)와 사용자 데이터베이스 구조

## 사용자 등록

터미널의 **사용자 등록** 앱에서 아이디와 비밀번호로 가입하고 자작 캐릭터를 한 명 등록한다 (한 계정에 캐릭터 하나).
로그인 토큰은 브라우저 `localStorage`의 `ag-token`에 저장되고, 같은 사이트의 URIM이 이 토큰으로
그 캐릭터를 불러와 그 캐릭터를 상대로 대화한다.

- 서버: `https://urim-proxy.bucksve.workers.dev` (`server/worker.js`)
- 데이터베이스: Cloudflare D1 `afterglow-users` (`server/schema.sql`)
- 비밀번호는 PBKDF2-SHA256(10만 회)으로 저장하고, 세션 토큰은 해시만 저장한다. 비밀번호는 되찾을 수 없다.
- 요청은 `ALLOWED_ORIGIN`에 적은 사이트에서만 받는다. 새 사이트를 만들면 쉼표로 주소를 추가한다.

### API

| 경로 | 설명 |
| --- | --- |
| `POST /auth/signup` `{username, password}` | 가입. `{token, user, characters}` |
| `POST /auth/login` `{username, password}` | 로그인. `{token, user, characters}` |
| `POST /auth/logout` | 로그아웃 |
| `GET /me` | `{user, characters, limits}` |
| `PUT /me/active` `{id}` | URIM 대화 캐릭터 지정 |
| `POST /me/password` `{password, newPassword}` | 비밀번호 변경 |
| `DELETE /me` `{password}` | 계정과 캐릭터 삭제 |
| `POST /characters` `{data, avatar?}` | 캐릭터 등록 (이미 있으면 `too_many_characters`) |
| `PUT /characters/:id` `{data, avatar?}` | 캐릭터 수정. `avatar`를 생략하면 사진은 그대로, `null`이면 삭제 |
| `DELETE /characters/:id` | 캐릭터 삭제 |

로그인이 필요한 요청은 `Authorization: Bearer <token>` 헤더를 붙인다.

### 캐릭터 정보 형식 (schemaVersion 1)

| 키 | 값 |
| --- | --- |
| `name` | 이름 (필수, 30자) |
| `nameEn`, `age`, `gender` | 영문 이름, 나이, 성별 |
| `origin` | `TB-01`~`TB-12`, `OPH`, `SEIR`, `NOD` (필수) |
| `originDetail` | 구역, 고리, 씨족, 거점 |
| `species` | `human`, `later`, `mixed`, `uc` (필수) |
| `lineage` | 혈통 (레이터는 필수) |
| `G`, `C`, `T` | 명부 지수. 순수 인간 G 4~5, 그 밖 1~3. C 1~5. T 0~4. 언섹션은 모두 `null` |
| `echoType` | `없음`, `방출형`, `조형형`, `강화형`, `간섭형`, `감응형`. T0와 언섹션은 `없음` |
| `echoAbility` | 잔향 능력 설명 |
| `job`, `faction` | 직업, 소속 |
| `appearance`, `personality`, `background`, `secret`, `notes` | 서술 |

### 프로필 사진

캐릭터마다 `avatar` 하나. 사이트에서 사진을 고르면 바로 정사각형으로 잘라 320×320으로 줄인 뒤
`data:image/webp;base64,…`(지원하지 않는 브라우저는 jpeg) 형태로 저장한다. 최대 200,000자.
`GET /me`의 각 캐릭터에 `avatar`로 함께 온다.

### URIM과 제4의 벽

로그인한 상태로 URIM과 대화하면 URIM은 상대를 세계관 속 그 캐릭터로 대한다. 현실, AI, 제작자, 롤플레이 자체처럼
세계관 밖을 묻는 질문에는 'ACCESS DENIED · 접근 차단' 카드만 보여 준다.

형식을 바꿀 때는 `server/worker.js`의 `SCHEMA_VERSION`을 올리고, 저장된 `schema_version`을 보고 옛 기록을 옮긴다.
