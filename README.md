# Ptrip Frontend

공공데이터포털 한국관광공사 관광정보 API와 카카오맵을 활용한 여행지 검색 미니 프로젝트입니다.

사용자가 여행지 키워드를 입력하면 백엔드 API를 통해 관광 정보를 조회하고, 검색 결과를 카드 목록과 지도 마커로 확인할 수 있습니다.

## 프로젝트 소개

Ptrip은 외부 공공 API 연동과 지도 SDK 활용을 연습하기 위해 만든 포트폴리오용 미니 프로젝트입니다.

백엔드에서 한국관광공사 관광정보 API를 호출하고, 프론트에서는 검색 결과를 카카오맵과 함께 시각적으로 보여줍니다.

## 주요 기능

- 여행지 키워드 검색
- 검색 결과 카드 리스트 표시
- 카카오맵 지도 표시
- 검색 결과 위치 마커 표시
- 카드 클릭 시 해당 장소로 지도 이동
- 마커 클릭 시 장소명 인포윈도우 표시
- 카테고리 필터
- 상세보기 모달

## 기술 스택

- Vue 3
- Vite
- JavaScript
- Axios
- Kakao Map JavaScript SDK
- CSS

## 프로젝트 구조

```text
src
├── assets
│   ├── base.css
│   └── main.css
├── router
│   └── index.js
├── services
│   └── tourApi.js
├── utils
│   └── loadKakaoMap.js
├── views
│   └── HomeView.vue
├── App.vue
└── main.js
