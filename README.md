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

### 노션 사용자 명부

워커에 `NOTION_TOKEN`(노션 내부 통합 시크릿)을 넣으면 가입, 로그인, 캐릭터 등록·수정·삭제, 계정 삭제가 있을 때마다
노션의 비공개 데이터베이스 'AFTERGLOW · 사용자 명부 (관리용)'에 바로 반영된다. 비밀번호와 사진 파일은 보내지 않는다.
탈퇴한 계정은 지우지 않고 상태를 '탈퇴'로 바꾼다.

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
| `attackStyle`, `attackStyle2` | 공격 스타일과 보조 스타일 (선택). `근접`, `사격`, `투척`, `의체`, `잔향`, `기계`, `지원`. `잔향`은 잔향이 있을 때만 |
| `attackNormalName`, `attackNormal` | 일반 공격 이름(40자)과 서술(600자) |
| `attackSpecialName`, `attackSpecial` | 특수 공격 이름(40자)과 서술(800자) |
| `attackUltimateName`, `attackUltimate` | 필살기 이름(40자)과 서술(1000자) |

### 프로필 사진

캐릭터마다 `avatar` 하나. 사이트에서 사진을 고르면 바로 정사각형으로 잘라 320×320으로 줄인 뒤
`data:image/webp;base64,…`(지원하지 않는 브라우저는 jpeg) 형태로 저장한다. 최대 200,000자.
`GET /me`의 각 캐릭터에 `avatar`로 함께 온다.

### URIM과 제4의 벽

로그인한 상태로 URIM과 대화하면 URIM은 상대를 세계관 속 그 캐릭터로 대한다. 현실, AI, 제작자, 롤플레이 자체처럼
세계관 밖을 묻는 질문에는 'ACCESS DENIED · 접근 차단' 카드만 보여 준다.

형식을 바꿀 때는 `server/worker.js`의 `SCHEMA_VERSION`을 올리고, 저장된 `schema_version`을 보고 옛 기록을 옮긴다.

## 커뮤니티 · 게임 API (2026-11)

새 화면(단체 단말, 1:1 대화 공간, 개인 단말, 캐릭터 스탯, 전투, 창고, 숙소, 설정, 타임라인)이 쓰는 경로. 모두 로그인 필요.
처음 한 번 `server/migrations/0002_community.sql`을 D1 `afterglow-users`에 실행해야 한다.

| 경로 | 설명 |
| --- | --- |
| `GET /users` | 다른 사용자 목록 `{id, name, sub, job, faction, online}` (5분 안에 요청이 있었으면 접속 중) |
| `GET/POST /channels` | 단체 단말 채널 목록 / 만들기 `{name}` |
| `GET/POST /channels/:id/messages` | 채널 메시지 / 보내기 `{text}` |
| `PUT/DELETE /messages/:id` | 내 메시지 수정 `{text}` / 삭제. 단체 단말은 내용만 지우고 자리를 남겨 URIM 안내로 보이고, 1:1·DM은 바로 지운다 |
| `GET/POST /talks` | 1:1 대화 목록 / 만들기 `{partnerId, title}` (한 사람과 여러 개) |
| `PUT/DELETE /talks/:id` | 제목 바꾸기 `{title}` / 나가기(대화와 메시지 삭제) |
| `GET/POST /talks/:id/messages` | 1:1 메시지 |
| `GET /dms` | DM 목록 `{partner, unread, count, last}` (한 사람당 하나) |
| `GET/POST /dms/:userId/messages`, `POST /dms/:userId/read` | DM 메시지, 읽음 표시 |
| `GET/POST /posts` | 타임라인 글 (글자 수 제한 없음, 서버 최대 2만 자. 미리보기 200자는 화면에서 자름) |
| `PUT/DELETE /posts/:id` | 내 글 수정 / 삭제 (댓글도 함께 삭제) |
| `GET/POST /posts/:id/comments` | 댓글 / 답글 `{text, parentId?}` |
| `PUT/DELETE /comments/:id` | 내 댓글 수정 / 삭제 (답글도 함께 삭제) |
| `PUT /me/lines` `{lines}` | 메인 화면 캐릭터 대사 (최대 5개). `GET /me`의 `profile.lines` |
| `GET/PUT /home` `{layout}` | 숙소 배치 (가구, 도트 캐릭터, 위치) |
| `GET /stats?user=` | 캐릭터 스탯 (G·C·T, 레벨, 장비로 계산) |
| `GET /inventory`, `POST /inventory/:id/equip`, `POST /inventory/:id/place`, `DELETE /inventory/:id` | 창고 |
| `GET /battle`, `POST /battle/start`, `POST /battle/turn` `{action, text?}` | 텍스트 전투. Claude가 스탯을 보고 한 턴을 판정하고, 키가 없거나 실패하면 스탯 굴림으로 대신한다 |

새 화면은 로그인하지 않았거나 서버에 닿지 못하면 '체험 모드'로 그 브라우저(localStorage) 안에서만 동작한다.

## 롤플레잉 사이트 (`app/`)

주소: https://lastsummerdream.github.io/Afterglow/app/

터미널과 같은 주소(lastsummerdream.github.io)라 로그인 정보(`ag-token`)를 함께 쓴다. 터미널에서 로그인했으면 그대로 들어가고, 사용자·캐릭터 정보도 같은 서버에서 불러온다.

| 파일 | 화면 |
| --- | --- |
| `index.html` | 커버 (로딩 → 진입하기 → 로그인 / 초대 코드 회원가입) |
| `main.html` | 메인 (캐릭터, 대사, 메뉴, URIM) |
| `group.html` · `private.html` · `dm.html` | 단체 단말 · 1:1 대화 공간 · 개인 단말 DM |
| `stats.html` · `battle.html` · `inventory.html` · `home.html` | 캐릭터 스탯 · 텍스트 전투 · 창고 · 숙소 |
| `settings.html` · `timeline.html` | 설정 · 타임라인 |

- 로고: `app/assets/logo.png` (1000 × 440, 투명 PNG)를 넣으면 커버 가운데에 나온다.
- 로그인하지 않고 다른 화면 주소로 들어오면 커버로 돌아간다.
- 초대 코드는 D1 `invites` 표에 넣는다 (`server/migrations/0003_invites.sql`의 예시 참고). 워커에 `INVITE_REQUIRED=1`을 두면 코드 없이는 어디서도 가입할 수 없다.
- 전투의 일반 공격 · 특수 공격 · 필살기 이름과 설명은 사용자 등록(캐릭터 정보)의 `attackNormal*`, `attackSpecial*`, `attackUltimate*`를 함께 쓴다.
- 전투 공격 배율 등 임시 값: `app/assets/ag.js`의 `AG.SKILL_RULES`, `server/worker.js`의 `SKILL_RULES` (두 곳을 같이 바꾼다).
