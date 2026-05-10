# Ptrip Frontend

백엔드 여행지 검색 API와 카카오맵을 연결한 미니 여행지 검색 화면입니다.

## 환경변수

루트에 `.env` 파일을 만들고 아래 값을 설정합니다.

```bash
VITE_API_BASE_URL=http://localhost:8080
VITE_KAKAO_MAP_KEY=your_kakao_javascript_key
```

`.env.example` 파일도 함께 제공됩니다.

## 실행 방법

```bash
npm install
npm run dev
```

프론트는 기본적으로 [http://localhost:5173](http://localhost:5173) 에서 실행됩니다.

## 테스트 방법

1. 백엔드 `Ptrip-be` 서버를 `http://localhost:8080` 에서 실행합니다.
2. 프론트에서 검색창에 `부산`, `제주`, `강릉` 같은 키워드를 입력합니다.
3. 카드 리스트에 이미지, 제목, 주소, 전화번호가 보이는지 확인합니다.
4. 지도에 검색 결과 좌표 기준 마커가 표시되는지 확인합니다.
5. 카드를 클릭했을 때 지도가 해당 장소로 이동하는지 확인합니다.
6. 마커를 클릭했을 때 장소명이 인포윈도우로 표시되는지 확인합니다.

## 주요 구현 내용

- `VITE_API_BASE_URL` 기반 백엔드 검색 API 연동
- `VITE_KAKAO_MAP_KEY` 기반 카카오맵 SDK 동적 로딩
- 검색 결과 카드 리스트와 마커 동기화
- 기본 Vue 예제 컴포넌트 제거 및 단일 검색 화면 중심 구조 정리
