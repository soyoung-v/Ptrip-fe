<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import { fetchTourDetail, searchTours } from '@/services/tourApi'
import { loadKakaoMap } from '@/utils/loadKakaoMap'

const DEFAULT_KEYWORD = '부산'
const CATEGORY_LABELS = {
  '12': '관광지',
  '14': '문화시설',
  '15': '축제공연행사',
  '25': '여행코스',
  '28': '레포츠',
  '32': '숙박',
  '38': '쇼핑',
  '39': '음식점',
}
const CATEGORY_FILTERS = [
  '전체',
  '관광지',
  '문화시설',
  '축제공연행사',
  '여행코스',
  '레포츠',
  '숙박',
  '쇼핑',
  '음식점',
]
const FALLBACK_IMAGE =
  'data:image/svg+xml;charset=UTF-8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f766e" />
          <stop offset="100%" stop-color="#f59e0b" />
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#g)" />
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        fill="white" font-family="Pretendard, sans-serif" font-size="32">
        Ptrip Destination
      </text>
    </svg>
  `)

const keyword = ref(DEFAULT_KEYWORD)
const searchKeyword = ref(DEFAULT_KEYWORD)
const tours = ref([])
const isLoading = ref(false)
const errorMessage = ref('')
const mapErrorMessage = ref('')
const selectedPlaceId = ref('')
const selectedPlace = ref(null)
const selectedCategory = ref('전체')
const isDetailLoading = ref(false)
const detailErrorMessage = ref('')

const mapContainer = ref(null)
const map = ref(null)
const infoWindow = ref(null)
const markerEntries = ref([])

// 카드에 보여줄 값들을 백엔드 DTO 기준으로 프론트 친화적으로 정규화한다.
function normalizeTour(item, index) {
  const mapX = Number.parseFloat(item.mapX)
  const mapY = Number.parseFloat(item.mapY)
  const category = CATEGORY_LABELS[item.contentTypeId] || item.contentTypeId || '카테고리 정보 없음'

  return {
    id: item.contentId || `${item.title ?? 'tour'}-${index}`,
    title: item.title?.trim() || '이름 없는 여행지',
    address: [item.addr1, item.addr2].filter(Boolean).join(' ') || '주소 정보가 없습니다.',
    telephone: item.tel?.trim() || '전화번호 정보가 없습니다.',
    image: item.firstImage || item.firstImage2 || FALLBACK_IMAGE,
    category,
    contentTypeId: item.contentTypeId || '',
    latitude: Number.isFinite(mapY) ? mapY : null,
    longitude: Number.isFinite(mapX) ? mapX : null,
    overview: item.overview?.trim() || '',
  }
}

// 인포윈도우에 안전하게 텍스트를 넣기 위해 HTML 특수문자를 이스케이프한다.
function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// 현재 지도에 올라간 마커와 이벤트를 모두 정리한다.
function clearMarkers() {
  if (!window.kakao?.maps) {
    markerEntries.value = []
    return
  }

  markerEntries.value.forEach(({ marker, handler }) => {
    window.kakao.maps.event.removeListener(marker, 'click', handler)
    marker.setMap(null)
  })

  markerEntries.value = []
}

// 선택한 장소의 이름을 인포윈도우로 띄우고 지도를 해당 위치로 이동시킨다.
function openPlaceOverlay(tour, shouldPan = true) {
  if (!map.value || !infoWindow.value || !window.kakao?.maps) {
    return
  }

  const markerEntry = markerEntries.value.find(({ tourId }) => tourId === tour.id)

  if (!markerEntry) {
    return
  }

  const content = `
    <div style="padding: 9px 12px; font-size: 13px; font-weight: 700; color: #0f172a;">
      ${escapeHtml(tour.title)}
    </div>
  `

  infoWindow.value.setContent(content)
  infoWindow.value.open(map.value, markerEntry.marker)
  selectedPlaceId.value = tour.id

  if (shouldPan) {
    map.value.panTo(markerEntry.marker.getPosition())
  }
}

// 검색 결과 좌표를 기준으로 카카오맵 마커를 다시 그린다.
function renderMarkers() {
  if (!map.value || !window.kakao?.maps) {
    return
  }

  clearMarkers()

  const validTours = filteredTours.value.filter(
    (tour) => tour.latitude !== null && tour.longitude !== null,
  )

  if (!validTours.length) {
    infoWindow.value?.close()
    return
  }

  const bounds = new window.kakao.maps.LatLngBounds()

  validTours.forEach((tour) => {
    const position = new window.kakao.maps.LatLng(tour.latitude, tour.longitude)
    const marker = new window.kakao.maps.Marker({
      map: map.value,
      position,
      title: tour.title,
    })

    // 마커 클릭 시 카드 선택 상태와 인포윈도우를 함께 동기화한다.
    const handler = () => openPlaceOverlay(tour, true)

    window.kakao.maps.event.addListener(marker, 'click', handler)
    markerEntries.value.push({ tourId: tour.id, marker, handler })
    bounds.extend(position)
  })

  map.value.setBounds(bounds)

  if (selectedPlaceId.value) {
    const selectedTour = validTours.find((tour) => tour.id === selectedPlaceId.value)

    if (selectedTour) {
      openPlaceOverlay(selectedTour, false)
      return
    }
  }

  openPlaceOverlay(validTours[0], false)
}

// 카카오맵 SDK를 로드한 뒤 기본 지도를 생성한다.
async function initializeMap() {
  try {
    const kakao = await loadKakaoMap()

    if (!mapContainer.value) {
      return
    }

    map.value = new kakao.maps.Map(mapContainer.value, {
      center: new kakao.maps.LatLng(36.3504, 127.3845),
      level: 13,
    })

    infoWindow.value = new kakao.maps.InfoWindow({ removable: false })
    renderMarkers()
  } catch (error) {
    mapErrorMessage.value = error.message || '카카오맵을 불러오지 못했습니다.'
  }
}

// 검색어를 백엔드에 전달하고 카드/지도용 상태를 함께 갱신한다.
async function handleSearch() {
  const trimmedKeyword = keyword.value.trim()

  if (!trimmedKeyword) {
    errorMessage.value = '검색어를 입력해주세요.'
    tours.value = []
    selectedPlaceId.value = ''
    selectedPlace.value = null
    selectedCategory.value = '전체'
    clearMarkers()
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  searchKeyword.value = trimmedKeyword
  selectedPlace.value = null
  detailErrorMessage.value = ''

  try {
    const data = await searchTours(trimmedKeyword)
    tours.value = data.map(normalizeTour)
    selectedCategory.value = '전체'
    selectedPlaceId.value = tours.value[0]?.id || ''

    if (!tours.value.length) {
      errorMessage.value = '검색 결과가 없습니다. 다른 키워드로 다시 시도해보세요.'
    }
  } catch (error) {
    tours.value = []
    selectedPlaceId.value = ''
    selectedPlace.value = null
    selectedCategory.value = '전체'
    clearMarkers()
    errorMessage.value = error.message || '여행지 검색 중 오류가 발생했습니다.'
  } finally {
    isLoading.value = false
  }
}

// 카드 한 번 클릭 시 해당 장소를 활성화하고 지도를 부드럽게 이동시킨다.
function handleCardClick(tour) {
  selectedPlaceId.value = tour.id
  openPlaceOverlay(tour, true)
}

// 상세보기 버튼에서는 가능하면 상세 API를 다시 호출해 설명 정보를 보강한다.
async function handleOpenDetail(tour) {
  selectedPlaceId.value = tour.id
  openPlaceOverlay(tour, true)
  selectedPlace.value = {
    ...tour,
    overview: tour.overview || '',
  }
  detailErrorMessage.value = ''
  isDetailLoading.value = true

  try {
    if (!tour.id) {
      return
    }

    const detail = normalizeTour(await fetchTourDetail(tour.id), 0)
    selectedPlace.value = {
      ...tour,
      ...detail,
      image: detail.image || tour.image,
      overview: detail.overview || tour.overview || '',
    }
  } catch (error) {
    selectedPlace.value = {
      ...tour,
      overview: tour.overview || '',
    }
    detailErrorMessage.value = error.message || '상세 정보를 불러오지 못했습니다.'
  } finally {
    isDetailLoading.value = false
  }
}

function handleCategoryFilter(category) {
  selectedCategory.value = category

  const nextSelectedTour = filteredTours.value[0]

  if (!nextSelectedTour) {
    selectedPlaceId.value = ''
    infoWindow.value?.close()
    return
  }

  selectedPlaceId.value = nextSelectedTour.id
  openPlaceOverlay(nextSelectedTour, false)
}

function closeModal() {
  selectedPlace.value = null
  detailErrorMessage.value = ''
}

const filteredTours = computed(() => {
  if (selectedCategory.value === '전체') {
    return tours.value
  }

  return tours.value.filter((tour) => tour.category === selectedCategory.value)
})

const resultSummary = computed(() => {
  if (isLoading.value) {
    return '검색 결과를 불러오는 중입니다.'
  }

  if (errorMessage.value && !filteredTours.value.length) {
    return errorMessage.value
  }

  return `${searchKeyword.value} 검색 결과 ${filteredTours.value.length}곳`
})

const emptyStateMessage = computed(() => {
  if (!tours.value.length) {
    return '검색어를 입력하고 여행지를 찾아보세요.'
  }

  return '선택한 카테고리에 해당하는 여행지가 없습니다.'
})

// 검색 결과나 필터가 바뀌면 DOM과 지도를 순서대로 갱신해 카드/마커 상태를 맞춘다.
watch(
  filteredTours,
  async () => {
    await nextTick()
    renderMarkers()
  },
  { deep: true },
)

onMounted(async () => {
  await initializeMap()
  await handleSearch()
})
</script>

<template>
  <div class="travel-page">
    <section class="hero-section">
      <div class="hero-copy">
        <div class="brand-row">
          <img class="brand-logo" src="/logo.png" alt="Ptrip logo" />
          <div>
            <p class="eyebrow">Ptrip Mini Explorer</p>
          </div>
        </div>
        <h2>원하는 여행지를 검색하고 지도로 바로 확인해보세요.</h2>
      </div>

      <form class="search-panel" @submit.prevent="handleSearch">
        <label class="search-label" for="keyword">여행지 키워드</label>
        <div class="search-row">
          <input
            id="keyword"
            v-model="keyword"
            class="search-input"
            type="text"
            name="keyword"
            placeholder="예: 부산, 제주, 강릉"
          />
          <button class="search-button" type="submit" :disabled="isLoading">
            {{ isLoading ? '검색 중...' : '검색' }}
          </button>
        </div>
      </form>
    </section>

    <section class="content-section">
      <div class="results-panel">
        <div class="panel-header">
          <div>
            <p class="panel-label">Search Results</p>
            <h2>여행지 리스트</h2>
          </div>
          <span class="result-count">{{ resultSummary }}</span>
        </div>
                <div class="filter-row">
          <button
            v-for="category in CATEGORY_FILTERS"
            :key="category"
            type="button"
            class="filter-button"
            :class="{ active: selectedCategory === category }"
            @click="handleCategoryFilter(category)"
          >
            {{ category }}
          </button>
        </div>

        <p v-if="errorMessage && tours.length" class="inline-message error">{{ errorMessage }}</p>

        <div v-if="filteredTours.length" class="card-list">
          <article
            v-for="tour in filteredTours"
            :key="tour.id"
            class="place-card"
            :class="{ active: selectedPlaceId === tour.id }"
            @click="handleCardClick(tour)"
          >
            <img class="place-image" :src="tour.image" :alt="tour.title" />
            <div class="place-content">
              <div class="place-heading">
                <h3>{{ tour.title }}</h3>
                <span class="badge">{{ tour.category }}</span>
              </div>
              <div class="place-footer">
                <button class="detail-button" type="button" @click.stop="handleOpenDetail(tour)">
                  상세보기
                </button>
              </div>
            </div>
          </article>
        </div>

        <div v-else class="empty-state">
          <p>{{ emptyStateMessage }}</p>
        </div>
      </div>

      <div class="map-panel">
        <div class="panel-header">
          <div>
            <p class="panel-label">Kakao Map</p>
            <h2>지도 보기</h2>
          </div>
        </div>

        <div class="map-frame">
          <div ref="mapContainer" class="map-container"></div>
          <div v-if="mapErrorMessage" class="map-overlay error">
            <p>{{ mapErrorMessage }}</p>
            <p class="overlay-hint">`.env`에 `VITE_KAKAO_MAP_KEY`가 설정되어 있는지 확인해주세요.</p>
          </div>
          <div v-else-if="!tours.length && !isLoading" class="map-overlay">
            <p>검색 결과가 없으면 마커도 표시되지 않습니다.</p>
          </div>
        </div>
      </div>
    </section>

    <div v-if="selectedPlace" class="modal-backdrop" @click.self="closeModal">
      <section class="detail-modal" aria-modal="true" role="dialog">
        <div class="modal-header">
          <div>
            <p class="panel-label">Place Detail</p>
            <h2>{{ selectedPlace.title }}</h2>
          </div>
          <button class="close-button" type="button" @click="closeModal">닫기</button>
        </div>

        <div class="modal-body">
          <img class="modal-image" :src="selectedPlace.image" :alt="selectedPlace.title" />

          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">주소</span>
              <p>{{ selectedPlace.address }}</p>
            </div>
            <div class="detail-item">
              <span class="detail-label">전화번호</span>
              <p>{{ selectedPlace.telephone }}</p>
            </div>
            <div class="detail-item">
              <span class="detail-label">카테고리</span>
              <p>{{ selectedPlace.category }}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.travel-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100vh;
  padding: 16px 20px 20px;
  overflow: hidden;
}

.hero-section {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.9fr);
  gap: 20px;
  margin-bottom: 16px;
  max-height: 240px;
}

.hero-copy,
.search-panel,
.results-panel,
.map-panel {
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 28px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(18px);
}

.hero-copy,
.search-panel {
  min-height: 210px;
}

.hero-copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 18px 22px;
  overflow: hidden;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
}

.brand-logo {
  width: 58px;
  height: 58px;
  padding: 6px;
  border-radius: 16px;
  object-fit: contain;
  background: #fff;
  box-shadow: 0 10px 24px rgba(15, 118, 110, 0.16);
}

.brand-name {
  color: #0f172a;
  font-size: 1rem;
  font-weight: 800;
}

.eyebrow,
.panel-label {
  margin-bottom: 10px;
  color: #0f766e;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hero-copy h2,
.panel-header h2 {
  color: #0f172a;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.hero-description {
  max-width: 60ch;
  margin-top: 14px;
  color: #475569;
  font-size: 0.92rem;
}

.search-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 16px 18px;
  min-height: 0;
  overflow: hidden;
}

.search-label {
  margin-bottom: 8px;
  color: #0f172a;
  font-weight: 700;
}

.search-row {
  display: flex;
  gap: 12px;
}

.search-input {
  flex: 1;
  min-width: 0;
  padding: 12px 16px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 18px;
  outline: none;
  background: #fff;
  color: #0f172a;
  font-size: 1rem;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.search-input:focus {
  border-color: #0f766e;
  box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.14);
  transform: translateY(-1px);
}

.search-button {
  min-width: 104px;
  padding: 0 18px;
  border: none;
  border-radius: 18px;
  background: #146c63;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.2s ease;
}

.search-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 14px 22px rgba(20, 108, 99, 0.22);
}

.search-button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.search-hint,
.overlay-hint,
.result-count,
.place-address,
.place-tel,
.empty-state,
.inline-message {
  color: #64748b;
  font-size: 0.95rem;
}

.search-hint {
  margin-top: 8px;
  font-size: 0.88rem;
}

.content-section {
  display: grid;
  grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
  gap: 24px;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.results-panel,
.map-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 20px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.filter-button {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.75);
  color: #475569;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.filter-button:hover {
  transform: translateY(-1px);
}

.filter-button.active {
  background: #146c63;
  color: #fff;
}

.card-list {
  display: grid;
  gap: 12px;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}

.place-card {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 12px;
  padding: 10px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 18px;
  background: #fff;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.place-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 16px 24px rgba(15, 23, 42, 0.08);
}

.place-card.active {
  border-color: rgba(15, 118, 110, 0.65);
  box-shadow: 0 18px 30px rgba(15, 118, 110, 0.12);
}

.place-image {
  width: 92px;
  height: 92px;
  border-radius: 14px;
  object-fit: cover;
  background: #dbeafe;
}

.place-content {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.place-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.place-heading h3 {
  color: #0f172a;
  font-size: 0.98rem;
  font-weight: 800;
  line-height: 1.3;
}

.badge {
  flex-shrink: 0;
  padding: 5px 8px;
  color: #0f766e;
  font-size: 0.74rem;
  font-weight: 700;
}

.place-address,
.place-tel {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
}

.place-address {
  margin-bottom: 6px;
  font-size: 0.9rem;
  -webkit-line-clamp: 2;
}

.place-tel {
  font-size: 0.88rem;
  -webkit-line-clamp: 1;
}

.place-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: auto;
}

.detail-button {
  align-self: flex-start;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(20, 108, 99, 0.12);
  color: #146c63;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.detail-button:hover {
  background: #146c63;
  color: #fff;
}

.map-frame {
  position: relative;
  overflow: hidden;
  min-height: 0;
  flex: 1;
  height: 100%;
  border-radius: 24px;
  background:
    radial-gradient(circle at top left, rgba(15, 118, 110, 0.2), transparent 38%),
    linear-gradient(180deg, #e2e8f0, #cbd5e1);
}

.map-container {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.map-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(248, 250, 252, 0.82);
  color: #334155;
  text-align: center;
}

.map-overlay.error,
.inline-message.error {
  color: #b91c1c;
}

.empty-state {
  display: grid;
  min-height: 240px;
  place-items: center;
  border: 1px dashed rgba(148, 163, 184, 0.45);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.68);
  text-align: center;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.44);
  backdrop-filter: blur(6px);
}

.detail-modal {
  width: min(760px, 100%);
  max-height: min(88vh, 900px);
  overflow: auto;
  padding: 24px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 30px 60px rgba(15, 23, 42, 0.22);
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.close-button {
  flex-shrink: 0;
  min-width: 84px;
  padding: 11px 16px;
  border-radius: 14px;
  background: #0f766e;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.modal-body {
  display: grid;
  gap: 18px;
}

.modal-image {
  width: 100%;
  max-height: 280px;
  border-radius: 18px;
  object-fit: cover;
  background: #dbeafe;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.detail-item {
  padding: 16px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 18px;
  background: #f8fafc;
}

.detail-label {
  display: inline-block;
  margin-bottom: 8px;
  color: #0f766e;
  font-size: 0.84rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.detail-item p,
.detail-caption {
  margin: 0;
  color: #334155;
  word-break: break-word;
}

.detail-caption {
  color: #64748b;
  font-size: 0.88rem;
}

@media (max-width: 1100px) {
  .travel-page {
    height: auto;
    min-height: 100vh;
    overflow: auto;
  }

  .hero-section,
  .content-section {
    grid-template-columns: 1fr;
  }

  .hero-section {
    flex: 0 0 auto;
    min-height: unset;
    max-height: none;
  }

  .content-section {
    min-height: 920px;
    overflow: visible;
  }
}

@media (max-width: 768px) {
  .travel-page {
    padding: 14px 14px 18px;
  }

  .hero-copy,
  .search-panel,
  .results-panel,
  .map-panel {
    border-radius: 24px;
  }

  .hero-copy {
    padding: 18px;
  }

  .brand-row {
    margin-bottom: 10px;
  }

  .brand-logo {
    width: 40px;
    height: 40px;
  }

  .search-row {
    flex-direction: column;
  }

  .search-button {
    min-height: 52px;
  }

  .panel-header {
    flex-direction: column;
  }

  .place-card {
    grid-template-columns: 1fr;
  }

  .place-image {
    width: 100%;
    height: 150px;
  }

  .map-frame {
    min-height: 420px;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }

  .modal-backdrop {
    padding: 12px;
  }

  .detail-modal {
    padding: 18px;
  }
}
</style>
